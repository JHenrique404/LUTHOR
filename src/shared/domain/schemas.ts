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
