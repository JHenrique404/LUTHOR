import type {
  AgentProfile,
  ProviderKind,
  RunEvent,
  RunSnapshot,
  Workspace
} from '../domain/schemas'
import type {
  AnswerQuestionInput,
  CreateProfileInput,
  NewTaskInput,
  UpdateProfileInput,
  UserDirectionInput
} from './schemas'

// Tipos derivados dos schemas de validação IPC (runtime + compile time).
export type {
  AnswerQuestionInput,
  CreateProfileInput,
  NewTaskInput,
  UpdateProfileInput,
  UserDirectionInput
} from './schemas'

/**
 * Contrato IPC main <-> renderer.
 * Canais nomeados aqui são a única superfície de comunicação;
 * o preload expõe exatamente a interface LuthorApi via contextBridge.
 */
export const IpcChannels = {
  workspaceState: 'luthor:workspace:state',
  workspaceOpenDialog: 'luthor:workspace:open-dialog',
  workspaceSetActive: 'luthor:workspace:set-active',
  workspaceRemove: 'luthor:workspace:remove',
  runSnapshot: 'luthor:run:snapshot',
  simCancelRun: 'luthor:sim:cancel-run',
  simPauseAll: 'luthor:sim:pause-all',
  simResumeAll: 'luthor:sim:resume-all',
  simPauseAgent: 'luthor:sim:pause-agent',
  simResumeAgent: 'luthor:sim:resume-agent',
  simAnswerQuestion: 'luthor:sim:answer-question',
  simAnswerQuestions: 'luthor:sim:answer-questions',
  simUserDirection: 'luthor:sim:user-direction',
  simNewTask: 'luthor:sim:new-task',
  profilesList: 'luthor:profiles:list',
  profileCreate: 'luthor:profiles:create',
  profileUpdate: 'luthor:profiles:update',
  profileDuplicate: 'luthor:profiles:duplicate',
  profileDelete: 'luthor:profiles:delete',
  connectionsList: 'luthor:connections:list',
  /** main -> renderer (webContents.send) */
  simEvent: 'luthor:sim:event'
} as const

/** Payload emitido pelo SimulationEngine a cada evento. */
export interface SimEventPayload {
  event: RunEvent
  snapshot: RunSnapshot
}

/** Status mockado de uma conexão de provider (Fase 1: sempre não configurado). */
export interface ConnectionStatus {
  id: ProviderKind
  name: string
  status: 'not_configured' | 'configured' | 'error'
  detail: string
}

// ── Workspaces (Fase 2A: registro local real e persistente) ──────────────

/** Estado completo do registro de workspaces (persistido no main). */
export interface WorkspacesState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}

export type WorkspaceErrorCode =
  /** Caminho relativo, vazio ou malformado. */
  | 'invalid_path'
  /** Pasta não existe (ou deixou de existir). */
  | 'path_not_found'
  /** Caminho existe mas não é um diretório. */
  | 'not_a_directory'
  /** Run simulado ativo: troca/remoção do workspace ativo bloqueada. */
  | 'blocked_by_active_run'
  /** workspaceId não cadastrado. */
  | 'unknown_workspace'

export interface WorkspaceError {
  status: 'error'
  code: WorkspaceErrorCode
  message: string
}

export type OpenWorkspaceResult =
  | {
      status: 'ok'
      workspace: Workspace
      /** true = a pasta já estava cadastrada (deduplicada por caminho canônico). */
      alreadyRegistered: boolean
      /** false quando um run ativo impediu a ativação (workspace fica só registrado). */
      activated: boolean
      state: WorkspacesState
    }
  | { status: 'cancelled' }
  | WorkspaceError

export type WorkspaceMutationResult = { status: 'ok'; state: WorkspacesState } | WorkspaceError

/** API tipada exposta no renderer como window.luthor. */
export interface LuthorApi {
  workspaces: {
    /** Registro completo: lista + workspace ativo. */
    state(): Promise<WorkspacesState>
    /**
     * Abre dialog nativo, valida e registra a pasta escolhida no main.
     * Nada dentro do workspace é lido, inspecionado ou executado.
     */
    openDialog(): Promise<OpenWorkspaceResult>
    /** Troca o workspace ativo (bloqueada enquanto houver run simulado ativo). */
    setActive(workspaceId: string): Promise<WorkspaceMutationResult>
    /** Remove só o REGISTRO do workspace — nenhum arquivo é tocado. */
    remove(workspaceId: string): Promise<WorkspaceMutationResult>
  }
  run: {
    snapshot(): Promise<RunSnapshot>
  }
  sim: {
    pauseAll(): Promise<RunSnapshot>
    resumeAll(): Promise<RunSnapshot>
    /** Cancela o run simulado ativo (libera a troca de workspace). */
    cancelRun(): Promise<RunSnapshot>
    pauseAgent(agentId: string): Promise<RunSnapshot>
    resumeAgent(agentId: string): Promise<RunSnapshot>
    answerQuestion(input: AnswerQuestionInput): Promise<RunSnapshot>
    /** Caixa de Decisões: envia várias respostas de uma vez. */
    answerQuestions(inputs: AnswerQuestionInput[]): Promise<RunSnapshot>
    /** Composer: registra instrução como evento simulado no run atual. */
    addUserDirection(input: UserDirectionInput): Promise<RunSnapshot>
    /** "Nova tarefa": cria um novo run simulado (substitui o run ativo na Fase 1). */
    startNewTask(input: NewTaskInput): Promise<RunSnapshot>
    onEvent(cb: (payload: SimEventPayload) => void): () => void
  }
  profiles: {
    list(): Promise<AgentProfile[]>
    create(input: CreateProfileInput): Promise<AgentProfile[]>
    update(input: UpdateProfileInput): Promise<AgentProfile[]>
    duplicate(profileId: string): Promise<AgentProfile[]>
    remove(profileId: string): Promise<AgentProfile[]>
  }
  connections: {
    list(): Promise<ConnectionStatus[]>
  }
}
