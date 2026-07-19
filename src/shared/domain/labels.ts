import type { AgentRole, AgentState, ProviderKind, RunState, StepStatus } from './schemas'

export const RUN_STATE_LABELS: Record<RunState, string> = {
  draft: 'Rascunho',
  planning: 'Planejando',
  running: 'Executando',
  awaiting_user: 'Aguardando você',
  paused: 'Pausado',
  verifying: 'Verificando',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado'
}

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  planning: 'Planejando',
  waiting: 'Aguardando',
  executing: 'Executando',
  verifying: 'Verificando',
  question_pending: 'Pergunta pendente',
  paused: 'Pausado',
  completed: 'Concluído',
  failed: 'Falhou'
}

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  orchestrator: 'Orquestrador',
  frontend: 'Frontend',
  backend: 'Backend',
  researcher: 'Pesquisador',
  verifier: 'Verificador'
}

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  verified: 'Verificada',
  failed: 'Falhou'
}

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  local_node: 'Node Local'
}
