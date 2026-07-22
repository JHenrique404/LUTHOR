import type {
  ChangedFile,
  RunEvent,
  RunEventType,
  RunResult,
  RunSnapshot,
  Workspace
} from '@shared/domain'
import {
  isAgentTerminal,
  NEEDS_INPUT_INSTRUCTION,
  parseNeedsInput
} from '@shared/domain'
import { assertTransition, isTerminal } from '@shared/state-machine/run-state'
import type { SimEventPayload } from '@shared/ipc/contract'
import type { CodexStatus } from './codex-detector'
import type { RunnerEvent } from './codex-runner'
import { CodexRunner } from './codex-runner'
import type { CommandRunner } from './codex-detector'
import { defaultCommandRunner } from './codex-detector'
import { TranscriptWriter } from './transcript'
import type { ContextRef } from './context-references'
import { buildContextInstruction } from './context-references'

/**
 * Run REAL com Codex CLI — Fase 2B.
 *
 * Mantém um RunSnapshot no MESMO formato da simulação (a Agent Office e o
 * detalhe do run funcionam sem bifurcação), mas com executor 'codex_cli',
 * um único worker e NENHUM dado inventado: modelo/uso só aparecem se a CLI
 * informar; não há steps nem porcentagens.
 */

const MAX_EVENTS = 500

export interface CodexStartInput {
  text: string
  workspace: Workspace
  cliStatus: CodexStatus
  profileId?: string
  profileName?: string
  /** Modelo escolhido (só aplicado se a CLI o aceitar). null = padrão. */
  model?: string | null
  /** Referências de contexto (@arquivo/@pasta), já validadas no main. */
  contextRefs?: ContextRef[]
  /** Continuação auditável de um run anterior que ficou awaiting_user. */
  continuationOf?: {
    originalText: string
    question: string
    answer: string
    /** Contexto necessário da tentativa anterior (limitado, sem segredos). */
    priorContext: string
    fromRunId: string
  }
}

/** Preâmbulo de continuação: tarefa original + pergunta + resposta do usuário. */
function buildContinuationPreamble(input: CodexStartInput): string {
  const c = input.continuationOf
  if (!c) return ''
  return [
    'Continuação de uma execução anterior que ficou aguardando sua decisão.',
    `Tarefa original: ${c.originalText}`,
    `Pergunta feita: ${c.question}`,
    `Resposta do usuário: ${c.answer}`,
    c.priorContext ? `Contexto necessário da tentativa anterior: ${c.priorContext}` : '',
    'Prossiga a tarefa original considerando a resposta acima.',
    '---',
    ''
  ]
    .filter(Boolean)
    .join('\n')
}

export interface CodexRunManagerOptions {
  emit: (payload: SimEventPayload) => void
  /** Diretório de dados do LUTHOR (userData) para transcript/metadata. */
  dataDir: string
  runner?: CodexRunner
  /** Executor de comandos read-only (git status). Injetável nos testes. */
  runCommand?: CommandRunner
  now?: () => number
  createTranscript?: (dataDir: string, runId: string) => TranscriptWriter
  /** Notifica quando a CLI emitiu dados de uso reais (habilita capacidade). */
  onUsageObserved?: () => void
}

/** Limite de arquivos listados no resumo Git de leitura. */
const MAX_CHANGED_FILES = 200

export class CodexRunManager {
  private snapshot: RunSnapshot | null = null
  private runner: CodexRunner
  private transcript: TranscriptWriter | null = null
  private eventSeq = 0
  private runSeq = 0
  private model: string | null = null
  private lastAgentMessage: string | null = null
  /** Todo texto de agent_message acumulado (para achar o marcador estruturado). */
  private agentTextAll = ''
  private usage: Record<string, number> | null = null
  /** Guarda o essencial do último start para uma continuação auditável. */
  private lastStart: {
    originalText: string
    workspace: Workspace
    cliStatus: CodexStatus
    model: string | null
    profileName: string
    contextRefs: ContextRef[]
  } | null = null
  /** Linhas do `git status --porcelain` ANTES do run (para diferenciar). */
  private preRunStatusLines: Set<string> = new Set()
  private gitAvailable = false
  private meta: {
    startedAt: number
    preExisting: boolean
    cliVersion: string | null
    cwd: string
  } | null = null

  private readonly emitPayload: (payload: SimEventPayload) => void
  private readonly dataDir: string
  private readonly runCommand: CommandRunner
  private readonly now: () => number
  private readonly createTranscript: (dataDir: string, runId: string) => TranscriptWriter
  private readonly onUsageObserved: () => void

  constructor(options: CodexRunManagerOptions) {
    this.emitPayload = options.emit
    this.dataDir = options.dataDir
    this.runner = options.runner ?? new CodexRunner()
    this.runCommand = options.runCommand ?? defaultCommandRunner
    this.now = options.now ?? Date.now
    this.createTranscript =
      options.createTranscript ?? ((dir, runId) => new TranscriptWriter(dir, runId))
    this.onUsageObserved = options.onUsageObserved ?? (() => {})
  }

  isBusy(): boolean {
    return this.snapshot !== null && !this.isTerminal()
  }

  hasRun(): boolean {
    return this.snapshot !== null
  }

  getSnapshot(): RunSnapshot | null {
    return this.snapshot ? structuredClone(this.snapshot) : null
  }

  private isTerminal(): boolean {
    const state = this.snapshot?.run.state
    return state === 'completed' || state === 'failed' || state === 'cancelled'
  }

  /** Congela finishedAt de instâncias/run terminais — a duração para de correr. */
  private freezeTerminalTimestamps(at: number): void {
    if (!this.snapshot) return
    for (const agent of this.snapshot.agents) {
      if (isAgentTerminal(agent.state) && agent.finishedAt === null) agent.finishedAt = at
    }
    if (isTerminal(this.snapshot.run.state) && this.snapshot.run.finishedAt === null) {
      this.snapshot.run.finishedAt = at
    }
  }

  /**
   * Verificação Git SOMENTE LEITURA antes do run: detecta mudanças locais
   * pré-existentes. Nenhuma escrita Git em hipótese alguma.
   */
  private async gitReadOnlyCheck(
    cwd: string
  ): Promise<{ isRepo: boolean; dirty: boolean; lines: string[] }> {
    try {
      const inside = await this.runCommand('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'])
      if (inside.code !== 0 || !/true/.test(inside.stdout)) {
        return { isRepo: false, dirty: false, lines: [] }
      }
      const status = await this.runCommand('git', ['-C', cwd, 'status', '--porcelain'])
      const lines =
        status.code === 0
          ? status.stdout.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean)
          : []
      return { isRepo: true, dirty: lines.length > 0, lines }
    } catch {
      return { isRepo: false, dirty: false, lines: [] }
    }
  }

  /** Parse "XY path" do porcelain em { status, path }. */
  private parsePorcelainLine(line: string): { status: string; path: string } {
    const status = line.slice(0, 2).trim()
    let path = line.slice(3).trim()
    // Renomeado: "old -> new"; ficamos com o destino.
    const arrow = path.indexOf(' -> ')
    if (arrow >= 0) path = path.slice(arrow + 4)
    return { status, path: path.replace(/^"|"$/g, '') }
  }

  /**
   * Resumo de arquivos alterados APÓS o run (Git só leitura). Diferencia o
   * que já existia antes. null quando Git indisponível na pasta.
   */
  private async collectChangedFiles(
    cwd: string
  ): Promise<{ files: ChangedFile[]; truncated: boolean } | null> {
    if (!this.gitAvailable) return null
    try {
      const status = await this.runCommand('git', ['-C', cwd, 'status', '--porcelain'])
      if (status.code !== 0) return null
      const lines = status.stdout.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean)
      const files = lines.slice(0, MAX_CHANGED_FILES).map((line) => {
        const { status: st, path } = this.parsePorcelainLine(line)
        return { path, status: st, preExisting: this.preRunStatusLines.has(line) }
      })
      return { files, truncated: lines.length > MAX_CHANGED_FILES }
    } catch {
      return null
    }
  }

  async start(input: CodexStartInput): Promise<RunSnapshot> {
    if (this.isBusy()) throw new Error('Já existe um run real em execução')
    if (!input.cliStatus.capabilities) throw new Error('Capacidades do Codex não detectadas')

    const now = this.now()
    this.runSeq++
    const runId = `run-codex-${now.toString(36)}-${this.runSeq}`
    const title = input.text.trim()
    const git = await this.gitReadOnlyCheck(input.workspace.path)

    this.model = null
    this.lastAgentMessage = null
    this.agentTextAll = ''
    this.usage = null
    this.eventSeq = 0
    this.gitAvailable = git.isRepo
    this.preRunStatusLines = new Set(git.lines)
    this.transcript = this.createTranscript(this.dataDir, runId)
    this.meta = {
      startedAt: now,
      preExisting: git.dirty,
      cliVersion: input.cliStatus.version,
      cwd: input.workspace.path
    }

    // Modelo só é EFETIVO quando a CLI aceita a flag; caso contrário, padrão.
    const modelConfigurable = input.cliStatus.capabilities.modelFlag
    const appliedModel = modelConfigurable && input.model ? input.model : null
    const contextRefs = input.contextRefs ?? []
    // Prompt final: tarefa + contexto + protocolo de pergunta estruturada.
    const promptWithContext =
      `${input.continuationOf ? buildContinuationPreamble(input) : ''}${title}` +
      `${buildContextInstruction(contextRefs)}` +
      `\n${NEEDS_INPUT_INSTRUCTION}`

    // Guarda o essencial para uma CONTINUAÇÃO auditável (nova execução real).
    this.lastStart = {
      originalText: input.continuationOf?.originalText ?? title,
      workspace: input.workspace,
      cliStatus: input.cliStatus,
      model: appliedModel,
      profileName: input.profileName ?? 'Codex CLI · padrão da CLI',
      contextRefs
    }

    this.snapshot = {
      workspace: structuredClone(input.workspace),
      task: {
        id: `task-${runId}`,
        workspaceId: input.workspace.id,
        title,
        prompt: title,
        createdAt: now
      },
      run: {
        id: runId,
        taskId: `task-${runId}`,
        state: 'running',
        executor: 'codex_cli',
        cancelRequested: false,
        startedAt: now,
        finishedAt: null,
        updatedAt: now
      },
      steps: [], // sem PlanStep falso: o Codex não produz um plano de etapas
      agents: [
        {
          id: 'ag-codex',
          runId,
          role: 'worker',
          name: 'Worker Codex',
          // Perfil honesto: só o que foi realmente aplicado (não "codex-high").
          profileId: 'codex-cli',
          squadId: null,
          state: 'executing',
          subtask: title,
          // Esforço não é configurável nesta versão detectada → menor (padrão).
          effort: 'low',
          writeScope: 'writer',
          worktreeRef: null,
          startedAt: now,
          finishedAt: null,
          lastEventAt: now,
          lastEventMessage: 'Iniciando processo Codex'
        }
      ],
      questions: [],
      checkpoints: [],
      events: [],
      profiles: [],
      result: null,
      // Configuração EFETIVA (não decorativa): o que foi de fato aplicado.
      effectiveConfig: {
        profileId: 'codex-cli',
        profileName: appliedModel
          ? `Codex CLI · modelo ${appliedModel}`
          : 'Codex CLI · padrão da CLI',
        appliedModel,
        appliedEffort: null,
        contextRefs: contextRefs.map((r) => ({ relPath: r.relPath, kind: r.kind }))
      }
    }

    this.pushEvent('task_received', null, `Tarefa real recebida: ${title}`)
    if (input.continuationOf) {
      this.pushEvent(
        'user_direction',
        null,
        `Nova execução iniciada como continuação do run ${input.continuationOf.fromRunId} — resposta do usuário incorporada ao contexto.`
      )
    }
    this.pushEvent(
      'agent_log',
      'ag-codex',
      `Executor: Codex CLI ${input.cliStatus.version ?? '(versão desconhecida)'} · sandbox workspace-write · cwd ${input.workspace.path}`
    )
    if (git.dirty) {
      this.pushEvent(
        'agent_log',
        null,
        'Aviso: a pasta já continha mudanças locais ANTES deste run (registrado no metadata). Elas não foram criadas pelo LUTHOR.'
      )
    }
    if (!git.isRepo) {
      this.pushEvent('agent_log', null, 'Pasta sem repositório Git — seguindo com --skip-git-repo-check.')
    }
    if (appliedModel) {
      this.pushEvent('agent_log', 'ag-codex', `Modelo aplicado via --model: ${appliedModel}`)
    }
    if (contextRefs.length > 0) {
      this.pushEvent(
        'agent_log',
        'ag-codex',
        `Contexto anexado: ${contextRefs.map((r) => r.relPath).join(', ')}`
      )
    }

    this.runner.start({
      prompt: promptWithContext,
      cwd: input.workspace.path,
      // Executável resolvido pela detecção — nunca a string "codex" crua.
      binaryPath: input.cliStatus.binaryPath ?? undefined,
      capabilities: input.cliStatus.capabilities,
      isGitRepo: git.isRepo,
      model: appliedModel,
      onEvent: (event) => this.handleRunnerEvent(event)
    })

    return this.getSnapshot()!
  }

  /** Pausa não é suportada pela CLI — registra o motivo em vez de fingir. */
  notePauseUnsupported(): RunSnapshot | null {
    if (!this.snapshot || this.isTerminal()) return this.getSnapshot()
    this.pushEvent(
      'agent_log',
      null,
      'Pausa não é suportada pelo executor real. Use "Cancelar run" para interromper.'
    )
    return this.getSnapshot()
  }

  /** Interrupção graciosa (a CLI não suporta pausa). */
  cancel(): RunSnapshot | null {
    if (!this.snapshot || this.isTerminal()) return this.getSnapshot()
    if (this.runner.cancel()) {
      this.snapshot.run.cancelRequested = true
      this.pushEvent(
        'run_state_changed',
        null,
        'Cancelamento solicitado — aguardando o processo encerrar (força após 5s)'
      )
    }
    return this.getSnapshot()
  }

  private handleRunnerEvent(event: RunnerEvent): void {
    if (!this.snapshot) return
    switch (event.kind) {
      case 'started': {
        this.transcript?.append(
          JSON.stringify({ luthor: 'started', pid: event.pid, args: event.args })
        )
        this.pushEvent('agent_started', 'ag-codex', `Processo iniciado (pid ${event.pid ?? '?'})`)
        break
      }
      case 'json': {
        this.transcript?.append(event.raw)
        const message = summarizeCliEvent(event.parsed)
        const model = extractModel(event.parsed)
        if (model && !this.model) {
          this.model = model
          this.pushEvent('agent_log', 'ag-codex', `Modelo informado pela CLI: ${model}`)
        }
        const usage = extractUsage(event.parsed)
        if (usage) {
          this.usage = { ...(this.usage ?? {}), ...usage }
          this.onUsageObserved()
        }
        const agentText = extractAgentMessage(event.parsed)
        if (agentText) {
          this.lastAgentMessage = agentText
          this.agentTextAll += `\n${agentText}`
        }
        if (message) this.pushEvent('agent_log', 'ag-codex', message)
        break
      }
      case 'stderr': {
        this.transcript?.append(JSON.stringify({ luthor: 'stderr', text: event.text }))
        this.pushEvent('agent_log', 'ag-codex', `[stderr] ${event.text}`)
        break
      }
      case 'exit': {
        void this.finishRun(event.code, event.cancelled)
        break
      }
    }
  }

  private async finishRun(code: number | null, cancelled: boolean): Promise<void> {
    if (!this.snapshot || this.isTerminal()) return
    const { run } = this.snapshot
    const agent = this.snapshot.agents[0]

    // Pergunta ESTRUTURADA (marcador explícito, não heurística de texto):
    // o processo terminou pedindo uma decisão → awaiting_user, nunca completed.
    const needsInput = !cancelled && code === 0 ? parseNeedsInput(this.agentTextAll) : null

    if (cancelled) {
      run.state = assertTransition(run.state, 'cancelled')
      if (agent) agent.state = 'failed'
      this.pushEvent('run_state_changed', null, `Run cancelado pelo usuário (exit ${code ?? '—'})`)
    } else if (needsInput) {
      run.state = assertTransition(run.state, 'awaiting_user')
      if (agent) agent.state = 'question_pending'
      this.snapshot.questions.push({
        id: `q-${run.id}`,
        runId: run.id,
        agentId: 'ag-codex',
        text: needsInput.question,
        options: (needsInput.options ?? []).map((label, i) => ({ id: `opt-${i}`, label })),
        allowFreeText: true,
        status: 'pending',
        answer: null,
        createdAt: this.now()
      })
      this.pushEvent(
        'question_opened',
        'ag-codex',
        `O executor precisa da sua resposta: ${needsInput.question}`
      )
      this.pushEvent(
        'run_state_changed',
        null,
        'O processo Codex ENCERROU aguardando sua decisão (não está pausado em memória). Responda para iniciar uma continuação.'
      )
    } else if (code === 0) {
      run.state = assertTransition(run.state, 'verifying')
      run.state = assertTransition(run.state, 'completed')
      if (agent) agent.state = 'completed'
      this.pushEvent(
        'run_completed',
        null,
        this.lastAgentMessage
          ? `Run concluído. Resposta final: ${this.lastAgentMessage.slice(0, 400)}`
          : 'Run concluído (exit 0).'
      )
    } else {
      run.state = assertTransition(run.state, 'failed')
      if (agent) agent.state = 'failed'
      this.pushEvent('agent_failed', 'ag-codex', `Processo terminou com exit ${code ?? 'desconhecido'}`)
    }

    const finishedAt = this.now()
    // Congela a duração de instâncias/run já terminais (bug do tempo correndo).
    this.freezeTerminalTimestamps(finishedAt)

    if (this.meta && this.transcript) {
      this.transcript.writeMeta({
        runId: run.id,
        taskTitle: this.snapshot.task.title,
        workspacePath: this.snapshot.workspace.path,
        provider: 'codex_cli',
        cliVersion: this.meta.cliVersion,
        startedAt: this.meta.startedAt,
        finishedAt,
        exitCode: code,
        cancelled,
        preExistingGitChanges: this.meta.preExisting
      })
    }

    // Aguardando resposta não é um run terminal: sem "Resultado" ainda.
    if (needsInput) return

    // Resumo Git de LEITURA pós-run (arquivos alterados). null se sem Git.
    const changed = this.meta ? await this.collectChangedFiles(this.meta.cwd) : null

    // Monta o resultado auditável final (nada estimado; nullable = "não informado").
    const result: RunResult = {
      provider: 'codex_cli',
      cliVersion: this.meta?.cliVersion ?? null,
      model: this.model,
      finalMessage: this.lastAgentMessage,
      startedAt: this.meta?.startedAt ?? finishedAt,
      finishedAt,
      exitCode: code,
      cancelled,
      preExistingGitChanges: this.gitAvailable ? (this.meta?.preExisting ?? false) : null,
      changedFiles: changed?.files ?? null,
      changedFilesTruncated: changed?.truncated ?? false,
      usage: this.usage
    }
    // Só re-emite se o snapshot ainda é este run (não foi substituído).
    if (this.snapshot && this.snapshot.run.id === run.id) {
      this.snapshot.result = result
      this.pushEvent('run_state_changed', null, 'Resultado do run disponível na aba Resultado.')
    }
  }

  /**
   * Responder à pergunta estruturada inicia uma CONTINUAÇÃO auditável:
   * uma NOVA execução real com a tarefa original + a resposta do usuário +
   * contexto necessário limitado. NÃO usa "resume" da CLI (não verificado).
   */
  async answerAndContinue(answer: string): Promise<RunSnapshot | null> {
    if (!this.snapshot || this.snapshot.run.state !== 'awaiting_user') return this.getSnapshot()
    const question = this.snapshot.questions.find((q) => q.status === 'pending')
    if (!question || !this.lastStart) return this.getSnapshot()

    // Marca a pergunta como respondida e registra a continuação no histórico.
    question.status = 'answered'
    question.answer = answer.trim()
    this.pushEvent('question_answered', 'ag-codex', `Sua resposta: ${answer.trim().slice(0, 300)}`)
    const fromRunId = this.snapshot.run.id
    this.pushEvent(
      'user_direction',
      null,
      `Nova execução iniciada como continuação do run ${fromRunId}.`
    )

    // Contexto necessário limitado da tentativa anterior (sem segredos).
    const priorContext = (this.lastAgentMessage ?? '').replace(/@@LUTHOR_NEEDS_INPUT@@[\s\S]*$/, '').trim().slice(0, 1200)

    // Libera o run atual e inicia a continuação real.
    const start = this.lastStart
    this.snapshot = null
    return this.start({
      text: start.originalText,
      workspace: start.workspace,
      cliStatus: start.cliStatus,
      model: start.model,
      contextRefs: start.contextRefs,
      profileName: start.profileName,
      continuationOf: {
        originalText: start.originalText,
        question: question.text,
        answer: answer.trim(),
        priorContext,
        fromRunId
      }
    })
  }

  /** Aguarda gravações do transcript (testes/encerramento). */
  flush(): Promise<unknown> {
    return this.transcript?.flush() ?? Promise.resolve()
  }

  private pushEvent(type: RunEventType, agentId: string | null, message: string): void {
    if (!this.snapshot) return
    const event: RunEvent = {
      id: `revt-${++this.eventSeq}`,
      runId: this.snapshot.run.id,
      agentId,
      type,
      message,
      at: this.now()
    }
    this.snapshot.events.push(event)
    if (this.snapshot.events.length > MAX_EVENTS) this.snapshot.events.shift()
    this.snapshot.run.updatedAt = event.at
    if (agentId) {
      const agent = this.snapshot.agents.find((a) => a.id === agentId)
      if (agent) {
        agent.lastEventAt = event.at
        agent.lastEventMessage = message.slice(0, 200)
      }
    }
    // Congela SEMPRE antes de emitir: nenhum snapshot terminal sai com
    // finishedAt null (evita a janela em que a duração ainda "corre").
    this.freezeTerminalTimestamps(event.at)
    this.emitPayload({ event, snapshot: this.getSnapshot()! })
  }
}

// ── Extração conservadora dos eventos JSONL da CLI ─────────────────────────
// O formato varia entre versões; nada é assumido. Melhor esforço, sem inventar.

function firstString(obj: Record<string, unknown> | null, keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function extractModel(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null
  const direct = firstString(parsed, ['model'])
  if (direct) return direct
  for (const value of Object.values(parsed)) {
    if (typeof value === 'object' && value !== null) {
      const nested = firstString(value as Record<string, unknown>, ['model'])
      if (nested) return nested
    }
  }
  return null
}

/**
 * Extrai uso/tokens SOMENTE se a CLI emitir um objeto estruturado de números.
 * Procura chaves usuais (usage, token_usage, token_count) e coleta pares
 * numéricos. null = nada verificável → a UI mostra "não informado".
 * NUNCA estima nem soma valores heurísticos.
 */
export function extractUsage(parsed: Record<string, unknown> | null): Record<string, number> | null {
  if (!parsed) return null
  const containers: unknown[] = [parsed['usage'], parsed['token_usage'], parsed['token_count']]
  const item = parsed['item']
  if (typeof item === 'object' && item !== null) {
    const rec = item as Record<string, unknown>
    containers.push(rec['usage'], rec['token_usage'], rec['token_count'])
  }
  for (const container of containers) {
    if (typeof container !== 'object' || container === null) continue
    const numbers: Record<string, number> = {}
    for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) numbers[key] = value
    }
    if (Object.keys(numbers).length > 0) return numbers
  }
  return null
}

export function extractAgentMessage(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null
  const item = parsed['item']
  if (typeof item === 'object' && item !== null) {
    const record = item as Record<string, unknown>
    if (record['type'] === 'agent_message' || record['item_type'] === 'agent_message') {
      return firstString(record, ['text', 'message', 'content'])
    }
  }
  return firstString(parsed, ['last_agent_message'])
}

/** Uma linha legível por evento da CLI; null = sem nada útil a mostrar. */
export function summarizeCliEvent(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null
  const type = firstString(parsed, ['type', 'event', 'kind']) ?? 'evento'
  const text =
    extractAgentMessage(parsed) ??
    firstString(parsed, ['message', 'text', 'delta', 'error']) ??
    (() => {
      const item = parsed['item']
      if (typeof item === 'object' && item !== null) {
        return firstString(item as Record<string, unknown>, ['text', 'command', 'title', 'status'])
      }
      return null
    })()
  if (!text) return `[${type}]`
  return `[${type}] ${text.slice(0, 500)}`
}
