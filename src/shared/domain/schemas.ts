import { z } from 'zod'

/**
 * Modelo de domínio do LUTHOR (Fase 1).
 * Schemas Zod são a fonte de verdade — tipos derivam via z.infer.
 */

export const RunStateSchema = z.enum([
  'draft',
  'planning',
  'running',
  'awaiting_user',
  'paused',
  'verifying',
  'completed',
  'failed',
  'cancelled'
])
export type RunState = z.infer<typeof RunStateSchema>

export const AgentStateSchema = z.enum([
  'planning',
  'waiting',
  'executing',
  'verifying',
  'question_pending',
  'paused',
  'completed',
  'failed'
])
export type AgentState = z.infer<typeof AgentStateSchema>

export const AgentRoleSchema = z.enum([
  'orchestrator',
  'frontend',
  'backend',
  'researcher',
  'verifier',
  /** Membro genérico de squad dinâmica criada pelo orquestrador. */
  'worker'
])
export type AgentRole = z.infer<typeof AgentRoleSchema>

export const ProviderKindSchema = z.enum(['claude_code', 'codex', 'local_node'])
export type ProviderKind = z.infer<typeof ProviderKindSchema>

export const EffortSchema = z.enum(['low', 'medium', 'high'])
export type Effort = z.infer<typeof EffortSchema>

export const StepStatusSchema = z.enum(['pending', 'in_progress', 'verified', 'failed'])
export type StepStatus = z.infer<typeof StepStatusSchema>

/**
 * writeScope/worktreeRef preparam a futura estratégia de worktrees Git:
 * dois agentes `writer` nunca podem compartilhar a mesma working copy.
 * Na Fase 1 a regra é validada em memória (ver validateWriterIsolation).
 */
export const WriteScopeSchema = z.enum(['read_only', 'writer'])
export type WriteScope = z.infer<typeof WriteScopeSchema>

/**
 * `demo` = dado de exemplo seedado (pasta pode nem existir; removível a
 * qualquer momento). `user` = pasta real escolhida pelo usuário via diálogo
 * nativo e validada no processo main. Os dois nunca se misturam na UI.
 */
export const WorkspaceOriginSchema = z.enum(['demo', 'user'])
export type WorkspaceOrigin = z.infer<typeof WorkspaceOriginSchema>

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  path: z.string().min(1),
  origin: WorkspaceOriginSchema,
  createdAt: z.number(),
  lastOpenedAt: z.number()
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export const TaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string().min(1),
  prompt: z.string(),
  createdAt: z.number()
})
export type Task = z.infer<typeof TaskSchema>

/** Quem executa o run: simulação da Fase 1 ou o executor real (Fase 2B). */
export const RunExecutorSchema = z.enum(['simulated', 'codex_cli'])
export type RunExecutor = z.infer<typeof RunExecutorSchema>

export const RunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  state: RunStateSchema,
  executor: RunExecutorSchema.default('simulated'),
  /** Cancelamento gracioso solicitado; aguardando o processo encerrar. */
  cancelRequested: z.boolean().default(false),
  startedAt: z.number(),
  /** Congelado ao entrar em estado terminal. null enquanto ativo. */
  finishedAt: z.number().nullable().default(null),
  updatedAt: z.number()
})
export type Run = z.infer<typeof RunSchema>

export const PlanStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  index: z.number().int().min(1),
  title: z.string().min(1),
  status: StepStatusSchema,
  assignedAgentId: z.string().nullable()
})
export type PlanStep = z.infer<typeof PlanStepSchema>

export const AgentProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  provider: ProviderKindSchema,
  model: z.string().min(1),
  effortDefault: EffortSchema,
  description: z.string(),
  /** Perfis inativos não podem ser atribuídos a novos agentes. */
  active: z.boolean()
})
export type AgentProfile = z.infer<typeof AgentProfileSchema>

/**
 * INSTÂNCIA de agente: trabalhador temporário criado para um run específico.
 * Não confundir com AgentProfile (configuração reutilizável em Configurações):
 * o orquestrador cria instâncias a partir de um perfil quando o run precisa.
 */
export const AgentSchema = z.object({
  id: z.string(),
  runId: z.string(),
  role: AgentRoleSchema,
  name: z.string().min(1),
  /** Perfil reutilizável que originou esta instância. */
  profileId: z.string(),
  /** Instâncias criadas em grupo pelo orquestrador compartilham squadId. */
  squadId: z.string().nullable(),
  state: AgentStateSchema,
  subtask: z.string(),
  effort: EffortSchema,
  writeScope: WriteScopeSchema,
  worktreeRef: z.string().nullable(),
  startedAt: z.number(),
  /**
   * Congelado quando a instância atinge estado terminal (completed/failed).
   * null = ainda ativa. Corrige o bug de duração que continuava correndo.
   */
  finishedAt: z.number().nullable().default(null),
  lastEventAt: z.number(),
  lastEventMessage: z.string()
})
export type Agent = z.infer<typeof AgentSchema>

export const CheckpointSchema = z.object({
  id: z.string(),
  runId: z.string(),
  label: z.string().min(1),
  stepIndex: z.number().int(),
  createdAt: z.number()
})
export type Checkpoint = z.infer<typeof CheckpointSchema>

export const QuestionOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1)
})
export type QuestionOption = z.infer<typeof QuestionOptionSchema>

export const QuestionSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  text: z.string().min(1),
  options: z.array(QuestionOptionSchema),
  allowFreeText: z.boolean(),
  status: z.enum(['pending', 'answered']),
  answer: z.string().nullable(),
  createdAt: z.number()
})
export type Question = z.infer<typeof QuestionSchema>

export const RunEventTypeSchema = z.enum([
  'task_received',
  'plan_created',
  'agent_started',
  'agent_log',
  'step_started',
  'step_verified',
  'question_opened',
  'question_answered',
  'agent_paused',
  'agent_resumed',
  'run_paused',
  'run_resumed',
  'agent_completed',
  'agent_failed',
  'checkpoint_created',
  'run_state_changed',
  'run_completed',
  /** Instrução ou nova tarefa registrada pelo usuário (Fase 1: só evento simulado). */
  'user_direction'
])
export type RunEventType = z.infer<typeof RunEventTypeSchema>

export const RunEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string().nullable(),
  type: RunEventTypeSchema,
  message: z.string(),
  at: z.number()
})
export type RunEvent = z.infer<typeof RunEventSchema>

/** Arquivo tocado no workspace após um run real (Git somente leitura). */
export const ChangedFileSchema = z.object({
  path: z.string(),
  /** Código porcelain do Git (M, A, ??, …). */
  status: z.string(),
  /** true = já estava alterado ANTES do run (não atribuível ao executor). */
  preExisting: z.boolean()
})
export type ChangedFile = z.infer<typeof ChangedFileSchema>

/** Uso por run: SOMENTE números emitidos estruturadamente pela CLI. */
export const RunUsageSchema = z.record(z.string(), z.number())

/**
 * Resultado final de um run REAL — nada aqui é estimado ou inventado:
 * cada campo nullable fica null quando a CLI/Git não informou.
 */
export const RunResultSchema = z.object({
  provider: z.string(),
  cliVersion: z.string().nullable(),
  /** Modelo APENAS se a CLI o informou nos eventos. */
  model: z.string().nullable(),
  /** Resposta final completa da IA (sem truncamento artificial). */
  finalMessage: z.string().nullable(),
  startedAt: z.number(),
  finishedAt: z.number(),
  exitCode: z.number().nullable(),
  cancelled: z.boolean(),
  /** null = Git indisponível na pasta. */
  preExistingGitChanges: z.boolean().nullable(),
  /** null = Git indisponível; lista via leitura pós-run. */
  changedFiles: z.array(ChangedFileSchema).nullable(),
  changedFilesTruncated: z.boolean(),
  /** null = uso por run não informado pela CLI. */
  usage: RunUsageSchema.nullable()
})
export type RunResult = z.infer<typeof RunResultSchema>

/** Snapshot completo de um run, enviado do main para o renderer a cada evento. */
export const RunSnapshotSchema = z.object({
  workspace: WorkspaceSchema,
  task: TaskSchema,
  run: RunSchema,
  steps: z.array(PlanStepSchema),
  agents: z.array(AgentSchema),
  questions: z.array(QuestionSchema),
  checkpoints: z.array(CheckpointSchema),
  events: z.array(RunEventSchema),
  profiles: z.array(AgentProfileSchema),
  /** Resultado auditável de um run REAL. null em runs simulados/em andamento. */
  result: RunResultSchema.nullable().default(null),
  /**
   * Configuração EFETIVA aplicada ao run real (não decorativa): o que
   * de fato foi passado à CLI. null em runs simulados.
   */
  effectiveConfig: z
    .object({
      profileId: z.string(),
      profileName: z.string(),
      /** Modelo aplicado via flag; null = padrão da CLI. */
      appliedModel: z.string().nullable(),
      /** Esforço aplicado via config; null = padrão da CLI. */
      appliedEffort: z.string().nullable(),
      /** Referências de contexto (caminhos relativos ao workspace). */
      contextRefs: z.array(z.object({ relPath: z.string(), kind: z.enum(['file', 'folder']) }))
    })
    .nullable()
    .default(null)
})
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>

/**
 * Limites de concorrência do workspace — SIMULADOS na Fase 1.
 * Nenhum processo real existe; o valor só informa a decisão do orquestrador
 * mockado (fila da squad) e a UI. A Fase 2 aplica isso a processos reais.
 */
export const SIMULATED_WORKSPACE_LIMITS = {
  maxProcesses: 3,
  maxWriters: 2
} as const

/** Progresso derivado — nunca porcentagem inventada. */
export function verifiedProgress(steps: PlanStep[]): { verified: number; total: number } {
  return {
    verified: steps.filter((s) => s.status === 'verified').length,
    total: steps.length
  }
}

/** Estados terminais de uma instância de agente. */
export const TERMINAL_AGENT_STATES: AgentState[] = ['completed', 'failed']

export function isAgentTerminal(state: AgentState): boolean {
  return TERMINAL_AGENT_STATES.includes(state)
}

/**
 * Duração honesta: quando terminal, usa finishedAt (congelado); enquanto
 * ativo, usa `now`. NUNCA usa "agora" para um agente/run já terminal —
 * corrige o bug do tempo que continuava correndo após concluir.
 */
export function durationMs(
  startedAt: number,
  finishedAt: number | null,
  isTerminal: boolean,
  now: number
): number {
  // Terminal: SEMPRE congelado. Nunca cai para `now` (nem se finishedAt for
  // null por algum motivo) — a duração exibida não pode crescer após terminal.
  if (isTerminal) return Math.max(0, (finishedAt ?? startedAt) - startedAt)
  return Math.max(0, now - startedAt)
}

/**
 * Resumo HONESTO de execução real (sem inventar PlanStep). Deriva dos estados
 * das instâncias reais — usado quando o run não tem plano com etapas reais.
 */
export function executionSummary(agents: Agent[]): {
  running: number
  awaiting: number
  completed: number
  failed: number
} {
  return {
    running: agents.filter((a) => a.state === 'executing' || a.state === 'verifying').length,
    awaiting: agents.filter((a) => a.state === 'question_pending' || a.state === 'waiting').length,
    completed: agents.filter((a) => a.state === 'completed').length,
    failed: agents.filter((a) => a.state === 'failed').length
  }
}

/** Marcador estruturado que o executor emite quando precisa de decisão do usuário. */
export const NEEDS_INPUT_MARKER = '@@LUTHOR_NEEDS_INPUT@@'

export interface ParsedNeedsInput {
  question: string
  context?: string
  options?: string[]
}

/**
 * Extrai o marcador estruturado de necessidade de resposta do texto do agente.
 * NÃO usa heurística de "parece uma pergunta" — só o marcador explícito conta.
 * Retorna null quando ausente/malformado.
 */
export function parseNeedsInput(text: string | null | undefined): ParsedNeedsInput | null {
  if (!text) return null
  const idx = text.indexOf(NEEDS_INPUT_MARKER)
  if (idx < 0) return null
  const after = text.slice(idx + NEEDS_INPUT_MARKER.length).trim()
  // JSON logo após o marcador (primeiro objeto balanceado).
  const start = after.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let end = -1
  for (let i = start; i < after.length; i++) {
    if (after[i] === '{') depth++
    else if (after[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return null
  try {
    const raw = JSON.parse(after.slice(start, end + 1)) as Record<string, unknown>
    const question = typeof raw.question === 'string' ? raw.question.trim() : ''
    if (!question) return null
    const context = typeof raw.context === 'string' ? raw.context.trim() : undefined
    const options = Array.isArray(raw.options)
      ? raw.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 8)
      : undefined
    return { question, context, options: options && options.length > 0 ? options : undefined }
  } catch {
    return null
  }
}

/** Instrução anexada ao prompt real: como pedir uma decisão de forma estruturada. */
export const NEEDS_INPUT_INSTRUCTION = [
  '',
  'IMPORTANTE: se faltar uma decisão, arquivo, requisito ou informação indispensável',
  'para concluir com segurança, NÃO pergunte em texto livre nem conclua adivinhando.',
  `Em vez disso, emita UMA linha começando exatamente com ${NEEDS_INPUT_MARKER} seguida de`,
  'um objeto JSON com as chaves: "question" (a pergunta), "context" (breve, sem segredos)',
  'e "options" (lista opcional de escolhas). Exemplo:',
  `${NEEDS_INPUT_MARKER} {"question":"Em qual arquivo adicionar as linhas?","options":["README.md","src/index.ts"]}`
].join('\n')

/**
 * Regra de isolamento de escrita (preparação para worktrees Git):
 * todo agente `writer` precisa de um worktreeRef próprio; dois writers
 * jamais podem apontar para a mesma working copy.
 * Retorna lista de violações (vazia = ok).
 */
export function validateWriterIsolation(agents: Agent[]): string[] {
  const violations: string[] = []
  const seen = new Map<string, Agent>()
  for (const agent of agents) {
    if (agent.writeScope !== 'writer') continue
    if (!agent.worktreeRef) {
      violations.push(`Agente writer "${agent.name}" sem worktreeRef próprio`)
      continue
    }
    const other = seen.get(agent.worktreeRef)
    if (other) {
      violations.push(
        `Agentes writers "${other.name}" e "${agent.name}" compartilham a working copy "${agent.worktreeRef}"`
      )
    }
    seen.set(agent.worktreeRef, agent)
  }
  return violations
}
