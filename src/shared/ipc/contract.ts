import type {
  AgentProfile,
  ProviderKind,
  RunEvent,
  RunSnapshot,
  Workspace
} from '../domain/schemas'
import type { ProviderCapabilities } from '../domain/provider-capabilities'
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
  connectionsRefresh: 'luthor:connections:refresh',
  codexChooseBinary: 'luthor:codex:choose-binary',
  codexClearBinary: 'luthor:codex:clear-binary',
  codexCapabilities: 'luthor:codex:capabilities',
  codexPickContext: 'luthor:codex:pick-context',
  /** main -> renderer (webContents.send) */
  simEvent: 'luthor:sim:event'
} as const

/** Resultado do picker de contexto (@arquivo/@pasta). */
export type PickContextResult =
  | { status: 'ok'; ref: { relPath: string; kind: 'file' | 'folder' } }
  | { status: 'blocked'; message: string }
  | { status: 'cancelled' }
  | { status: 'no_workspace'; message: string }

/** Payload emitido pelo SimulationEngine a cada evento. */
export interface SimEventPayload {
  event: RunEvent
  snapshot: RunSnapshot
}

/**
 * Status de uma conexão de provider.
 * Fase 2B: o Codex é detectado DE VERDADE no main (binário, versão, auth);
 * os demais continuam mockados. Nunca expõe credenciais — só o estado.
 */
export interface ConnectionStatus {
  id: ProviderKind
  name: string
  status: 'not_configured' | 'configured' | 'needs_auth' | 'error'
  detail: string
  /** Versão real informada pela CLI, quando detectada. */
  version?: string | null
  /** true/false quando a checagem de auth é suportada; null = não verificado. */
  authenticated?: boolean | null
  /** Nome do executável resolvido (só o arquivo — nunca o PATH completo). */
  binaryLabel?: string | null
  /** 'manual' = caminho escolhido pelo usuário (fallback da detecção). */
  binarySource?: 'auto' | 'manual' | null
  /** Resumo das capacidades reais detectadas na CLI. */
  capabilitiesSummary?: string[]
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
    /** Reexecuta a detecção real (binário/versão/auth do Codex). */
    refresh(): Promise<ConnectionStatus[]>
    /**
     * Fallback manual: dialog nativo para escolher o codex.exe (só .exe;
     * validado no main). Usado apenas quando a detecção automática falha.
     */
    chooseCodexBinary(): Promise<ConnectionStatus[]>
    /** Remove o caminho manual e volta à detecção automática. */
    clearCodexBinary(): Promise<ConnectionStatus[]>
  }
  codex: {
    /** Capacidades honestas do provider (modelos, esforço, uso, imagens…). */
    capabilities(): Promise<ProviderCapabilities>
    /**
     * Picker de contexto: dialog nativo limitado ao workspace ativo; valida
     * denylist (.env/chaves/.git/node_modules/binários/grandes) e devolve
     * caminho RELATIVO. Nenhuma leitura ampla — só stat do item.
     */
    pickContext(kind: 'file' | 'folder'): Promise<PickContextResult>
  }
}
