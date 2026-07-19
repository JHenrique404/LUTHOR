import type {
  Agent,
  AgentProfile,
  AgentState,
  RunEvent,
  RunEventType,
  RunSnapshot,
  RunState
} from '@shared/domain'
import { assertTransition } from '@shared/state-machine/run-state'
import type {
  AnswerQuestionInput,
  SimEventPayload,
  UserDirectionInput
} from '@shared/ipc/contract'

export interface SimulationEngineOptions {
  snapshot: RunSnapshot
  emit: (payload: SimEventPayload) => void
  /** Intervalo entre ticks de simulação (ms). */
  tickMs?: number
}

type Phase = 'working' | 'awaiting_answer' | 'verify_step4' | 'frontend' | 'final_verify' | 'done'

const ACTIVE_AGENT_STATES: AgentState[] = ['planning', 'waiting', 'executing', 'verifying']

const BACKEND_LOGS = [
  'Escrevendo middleware de sessão…',
  'Rodando testes de integração de auth…',
  'Ajustando renovação de token de sessão…',
  'Cobrindo rota /api/me com guard de sessão…'
]
const ORCHESTRATOR_LOGS = [
  'Revisando dependências entre etapas…',
  'Etapa 4 em execução; etapa 5 aguardando dependência…',
  'Monitorando verificação do fluxo de sessão…'
]
const FRONTEND_LOGS = [
  'Criando tela de login…',
  'Validando formulário de registro…',
  'Integrando client de sessão com a API…',
  'Ajustando estados de erro e loading…'
]

/**
 * Motor de simulação da Fase 1 — TODOS os eventos são mockados.
 *
 * Mantém o snapshot do run demo em memória e emite RunEvents em timers,
 * respeitando a máquina de estados do Run. A Fase 2 substitui apenas a
 * FONTE dos eventos (providers reais via contratos em ../integrations);
 * IPC, snapshot e renderer permanecem idênticos.
 *
 * Roteiro do run demo "Adicionar autenticação ao projeto":
 *  1. working        — Backend executa etapa 4, logs rotativos (3/5 verificadas)
 *  2. (tick 4)       — Verificador abre pergunta -> run awaiting_user
 *  3. awaiting_answer— eventos de heartbeat; progresso travado até resposta
 *  4. verify_step4   — resposta destrava: etapa 4 verificada, Backend conclui
 *  5. frontend       — Frontend sai de waiting -> executing (etapa 5)
 *  6. final_verify   — etapa 5 verificada -> run verifying -> completed
 * Pausar tudo congela o timer (nenhum evento novo); Retomar continua.
 */
export class SimulationEngine {
  private snapshot: RunSnapshot
  private readonly emitPayload: (payload: SimEventPayload) => void
  private readonly tickMs: number

  private timer: ReturnType<typeof setTimeout> | null = null
  private phase: Phase = 'working'
  private phaseTicks = 0
  private logCursor = 0
  private eventSeq = 0
  private pausedAll = false
  private resumeRunState: RunState = 'running'
  /** A verificação da etapa 4 só destrava depois da resposta do Verificador. */
  private verifierAnswered = false
  /** O Backend consolida uma segunda dúvida se o usuário demorar a responder. */
  private backendQuestionOpened = false
  /** Estados anteriores de agentes pausados pelo "Pausar tudo". */
  private pausedByAll = new Map<string, AgentState>()
  /** Estados anteriores de agentes pausados individualmente. */
  private pausedIndividually = new Map<string, AgentState>()

  constructor(options: SimulationEngineOptions) {
    this.snapshot = structuredClone(options.snapshot)
    this.emitPayload = options.emit
    this.tickMs = options.tickMs ?? 2500
  }

  getSnapshot(): RunSnapshot {
    return structuredClone(this.snapshot)
  }

  start(): void {
    this.schedule()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  // ── Comandos do usuário ────────────────────────────────────────────────

  pauseAll(): RunSnapshot {
    const { run } = this.snapshot
    if (this.pausedAll || this.phase === 'done') return this.getSnapshot()
    this.pausedAll = true
    this.stop()
    this.resumeRunState = run.state
    run.state = assertTransition(run.state, 'paused')
    for (const agent of this.snapshot.agents) {
      if (ACTIVE_AGENT_STATES.includes(agent.state)) {
        this.pausedByAll.set(agent.id, agent.state)
        agent.state = 'paused'
      }
    }
    this.pushEvent('run_paused', null, 'Execução pausada pelo usuário — eventos congelados')
    return this.getSnapshot()
  }

  resumeAll(): RunSnapshot {
    const { run } = this.snapshot
    if (!this.pausedAll) return this.getSnapshot()
    this.pausedAll = false
    run.state = assertTransition(run.state, this.resumeRunState)
    for (const [agentId, prior] of this.pausedByAll) {
      const agent = this.findAgent(agentId)
      if (agent && agent.state === 'paused') agent.state = prior
    }
    this.pausedByAll.clear()
    this.pushEvent('run_resumed', null, 'Execução retomada — eventos simulados continuam')
    this.schedule()
    return this.getSnapshot()
  }

  pauseAgent(agentId: string): RunSnapshot {
    const agent = this.findAgent(agentId)
    if (!agent || !ACTIVE_AGENT_STATES.includes(agent.state)) return this.getSnapshot()
    this.pausedIndividually.set(agent.id, agent.state)
    agent.state = 'paused'
    this.pushEvent('agent_paused', agent.id, `${agent.name} pausado pelo usuário`)
    return this.getSnapshot()
  }

  resumeAgent(agentId: string): RunSnapshot {
    const agent = this.findAgent(agentId)
    const prior = this.pausedIndividually.get(agentId)
    if (!agent || agent.state !== 'paused' || !prior) return this.getSnapshot()
    this.pausedIndividually.delete(agentId)
    agent.state = prior
    this.pushEvent('agent_resumed', agent.id, `${agent.name} retomado`)
    return this.getSnapshot()
  }

  answerQuestion(input: AnswerQuestionInput): RunSnapshot {
    this.applyAnswer(input)
    return this.getSnapshot()
  }

  /** Caixa de Decisões: aplica várias respostas de uma vez (cada uma emite evento). */
  answerQuestions(inputs: AnswerQuestionInput[]): RunSnapshot {
    for (const input of inputs) this.applyAnswer(input)
    return this.getSnapshot()
  }

  /**
   * Composer do orquestrador (Fase 1): registra a direção do usuário como
   * evento simulado no feed. Nenhuma IA real é chamada.
   */
  addUserDirection(input: UserDirectionInput): RunSnapshot {
    const targetAgent = input.scopeType === 'agent' ? this.findAgent(input.agentId ?? '') : null
    if (input.scopeType === 'agent' && !targetAgent) return this.getSnapshot()

    const scopeLabel =
      input.scopeType === 'orchestrator'
        ? 'Orquestrador'
        : input.scopeType === 'all'
          ? 'todos os agentes'
          : (targetAgent?.name ?? '')
    const prefix = input.kind === 'new_task' ? 'Nova tarefa registrada' : 'Instrução adicionada'
    const eventAgentId = targetAgent?.id ?? 'ag-orchestrator'
    this.pushEvent(
      'user_direction',
      eventAgentId,
      `${prefix} (${scopeLabel}): ${input.text.trim()}`
    )
    return this.getSnapshot()
  }

  /** Mantém os perfis do snapshot em sincronia com o repository. */
  setProfiles(profiles: AgentProfile[]): void {
    this.snapshot.profiles = structuredClone(profiles)
  }

  private applyAnswer(input: AnswerQuestionInput): boolean {
    const question = this.snapshot.questions.find((q) => q.id === input.questionId)
    if (!question || question.status !== 'pending') return false

    const option = question.options.find((o) => o.id === input.optionId)
    const answer = [option?.label, input.freeText?.trim()].filter(Boolean).join(' — ')
    if (!answer) return false

    question.status = 'answered'
    question.answer = answer

    const agent = this.findAgent(question.agentId)
    if (agent && agent.state === 'question_pending') {
      agent.state = agent.id === 'ag-verifier' ? 'verifying' : 'executing'
    }
    if (question.agentId === 'ag-verifier') this.verifierAnswered = true

    this.pushEvent('question_answered', question.agentId, `Resposta do usuário: ${answer}`)

    const pendingLeft = this.snapshot.questions.some((q) => q.status === 'pending')
    if (!pendingLeft) {
      const { run } = this.snapshot
      if (run.state === 'awaiting_user') {
        run.state = assertTransition(run.state, 'running')
        this.pushEvent('run_state_changed', null, 'Todas as perguntas respondidas — run retomado')
      } else if (run.state === 'paused') {
        // Respondidas durante pausa: ao retomar, o run volta para running.
        this.resumeRunState = 'running'
      }
      if (this.verifierAnswered && this.phase === 'awaiting_answer') {
        this.phase = 'verify_step4'
        this.phaseTicks = 0
      }
    }
    return true
  }

  // ── Roteiro interno ────────────────────────────────────────────────────

  private schedule(): void {
    if (this.pausedAll || this.phase === 'done' || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.tick()
      this.schedule()
    }, this.tickMs)
  }

  private tick(): void {
    switch (this.phase) {
      case 'working': {
        this.phaseTicks++
        this.rotateLogs([
          ['ag-backend', BACKEND_LOGS],
          ['ag-orchestrator', ORCHESTRATOR_LOGS]
        ])
        if (this.phaseTicks >= 4) this.openSessionQuestion()
        break
      }
      case 'awaiting_answer': {
        this.phaseTicks++
        // Usuário demorou: Backend consolida a própria dúvida na Caixa de Decisões
        // em vez de pausar sozinho.
        if (this.phaseTicks >= 2 && !this.backendQuestionOpened) {
          this.openBackendQuestion()
        } else {
          this.rotateLogs([['ag-backend', BACKEND_LOGS]])
        }
        break
      }
      case 'verify_step4': {
        const verifier = this.findAgent('ag-verifier')
        if (verifier?.state !== 'verifying') break
        this.phaseTicks++
        if (this.phaseTicks === 1) {
          this.pushEvent('agent_log', 'ag-verifier', 'Reverificando fluxo de sessão com a política escolhida…')
        } else {
          this.verifyStep4()
        }
        break
      }
      case 'frontend': {
        const frontend = this.findAgent('ag-frontend')
        if (frontend?.state !== 'executing') break
        this.phaseTicks++
        if (this.phaseTicks >= 4) {
          this.finishStep5()
        } else {
          this.rotateLogs([['ag-frontend', FRONTEND_LOGS]])
        }
        break
      }
      case 'final_verify': {
        const verifier = this.findAgent('ag-verifier')
        if (verifier?.state !== 'verifying') break
        this.phaseTicks++
        if (this.phaseTicks >= 2) this.completeRun()
        break
      }
      case 'done':
        break
    }
  }

  private openSessionQuestion(): void {
    const verifier = this.findAgent('ag-verifier')
    if (!verifier || verifier.state === 'paused') return
    verifier.state = 'question_pending'
    const question = {
      id: 'q-session-expiry',
      runId: this.snapshot.run.id,
      agentId: verifier.id,
      text: 'Qual deve ser o tempo de expiração das sessões de usuário?',
      options: [
        { id: 'opt-24h', label: '24 horas (mais seguro)' },
        { id: 'opt-7d', label: '7 dias (equilíbrio)' },
        { id: 'opt-30d', label: '30 dias (mais conveniente)' }
      ],
      allowFreeText: true,
      status: 'pending' as const,
      answer: null,
      createdAt: Date.now()
    }
    this.snapshot.questions.push(question)
    const { run } = this.snapshot
    run.state = assertTransition(run.state, 'awaiting_user')
    this.phase = 'awaiting_answer'
    this.phaseTicks = 0
    this.pushEvent(
      'question_opened',
      verifier.id,
      'Verificador abriu pergunta: tempo de expiração das sessões'
    )
  }

  private openBackendQuestion(): void {
    const backend = this.findAgent('ag-backend')
    if (!backend || backend.state !== 'executing') return
    this.backendQuestionOpened = true
    backend.state = 'question_pending'
    this.snapshot.questions.push({
      id: 'q-cookie-name',
      runId: this.snapshot.run.id,
      agentId: backend.id,
      text: 'Como nomear o cookie de sessão da aplicação?',
      options: [
        { id: 'opt-luthor', label: 'luthor_session' },
        { id: 'opt-app', label: 'app_session' },
        { id: 'opt-host', label: '__Host-session (mais estrito)' }
      ],
      allowFreeText: true,
      status: 'pending',
      answer: null,
      createdAt: Date.now()
    })
    this.pushEvent('question_opened', backend.id, 'Backend abriu pergunta: nome do cookie de sessão')
  }

  private verifyStep4(): void {
    const step = this.snapshot.steps.find((s) => s.index === 4)
    if (step) step.status = 'verified'
    this.snapshot.checkpoints.push({
      id: 'cp-4',
      runId: this.snapshot.run.id,
      label: 'Middleware de sessão verificado',
      stepIndex: 4,
      createdAt: Date.now()
    })
    const backend = this.findAgent('ag-backend')
    if (backend && backend.state !== 'paused') backend.state = 'completed'
    this.pushEvent('step_verified', 'ag-verifier', 'Etapa 4 verificada: middleware de sessão')
    this.pushEvent('checkpoint_created', null, 'Checkpoint criado: middleware de sessão verificado')
    if (backend?.state === 'completed') {
      this.pushEvent('agent_completed', 'ag-backend', 'Backend concluiu a subtask da etapa 4')
    }

    const frontend = this.findAgent('ag-frontend')
    const step5 = this.snapshot.steps.find((s) => s.index === 5)
    if (frontend && frontend.state === 'waiting') {
      frontend.state = 'executing'
      frontend.startedAt = Date.now()
      if (step5) step5.status = 'in_progress'
      this.pushEvent('agent_started', 'ag-frontend', 'Frontend iniciou etapa 5: telas de login')
      this.pushEvent('step_started', 'ag-frontend', 'Etapa 5 em andamento')
    }
    this.phase = 'frontend'
    this.phaseTicks = 0
  }

  private finishStep5(): void {
    const step5 = this.snapshot.steps.find((s) => s.index === 5)
    if (step5) step5.status = 'verified'
    const frontend = this.findAgent('ag-frontend')
    if (frontend && frontend.state !== 'paused') frontend.state = 'completed'
    const verifier = this.findAgent('ag-verifier')
    if (verifier && verifier.state !== 'paused') verifier.state = 'verifying'
    const { run } = this.snapshot
    run.state = assertTransition(run.state, 'verifying')
    this.snapshot.checkpoints.push({
      id: 'cp-5',
      runId: run.id,
      label: 'Telas de login e registro verificadas',
      stepIndex: 5,
      createdAt: Date.now()
    })
    this.pushEvent('step_verified', 'ag-verifier', 'Etapa 5 verificada: telas de login e registro')
    this.pushEvent('agent_completed', 'ag-frontend', 'Frontend concluiu a subtask da etapa 5')
    this.pushEvent('run_state_changed', null, 'Run em verificação final')
    this.phase = 'final_verify'
    this.phaseTicks = 0
  }

  private completeRun(): void {
    const { run } = this.snapshot
    run.state = assertTransition(run.state, 'completed')
    const orchestrator = this.findAgent('ag-orchestrator')
    if (orchestrator) orchestrator.state = 'completed'
    const verifier = this.findAgent('ag-verifier')
    if (verifier) verifier.state = 'completed'
    this.pushEvent('run_completed', null, 'Run concluído: autenticação adicionada (5 de 5 etapas verificadas)')
    this.phase = 'done'
    this.stop()
  }

  // ── Utilitários ────────────────────────────────────────────────────────

  private rotateLogs(sources: Array<[string, string[]]>): void {
    const active = sources.filter(([agentId]) => this.findAgent(agentId)?.state === 'executing')
    if (active.length === 0) return
    const [agentId, pool] = active[this.logCursor % active.length]
    const message = pool[Math.floor(this.logCursor / active.length) % pool.length]
    this.logCursor++
    this.pushEvent('agent_log', agentId, message)
  }

  private findAgent(agentId: string): Agent | undefined {
    return this.snapshot.agents.find((a) => a.id === agentId)
  }

  private pushEvent(type: RunEventType, agentId: string | null, message: string): void {
    const event: RunEvent = {
      id: `evt-${++this.eventSeq}-${Date.now().toString(36)}`,
      runId: this.snapshot.run.id,
      agentId,
      type,
      message,
      at: Date.now()
    }
    this.snapshot.events.push(event)
    if (this.snapshot.events.length > 200) this.snapshot.events.shift()
    this.snapshot.run.updatedAt = event.at
    if (agentId) {
      const agent = this.findAgent(agentId)
      if (agent) {
        agent.lastEventAt = event.at
        agent.lastEventMessage = message
      }
    }
    this.emitPayload({ event, snapshot: this.getSnapshot() })
  }
}
