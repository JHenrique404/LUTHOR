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
  UpdateProfileInput,
  UserDirectionInput
} from './schemas'

// Tipos derivados dos schemas de validação IPC (runtime + compile time).
export type {
  AnswerQuestionInput,
  CreateProfileInput,
  UpdateProfileInput,
  UserDirectionInput
} from './schemas'

/**
 * Contrato IPC main <-> renderer.
 * Canais nomeados aqui são a única superfície de comunicação;
 * o preload expõe exatamente a interface LuthorApi via contextBridge.
 */
export const IpcChannels = {
  workspaceList: 'luthor:workspace:list',
  workspaceOpenDialog: 'luthor:workspace:open-dialog',
  runSnapshot: 'luthor:run:snapshot',
  simPauseAll: 'luthor:sim:pause-all',
  simResumeAll: 'luthor:sim:resume-all',
  simPauseAgent: 'luthor:sim:pause-agent',
  simResumeAgent: 'luthor:sim:resume-agent',
  simAnswerQuestion: 'luthor:sim:answer-question',
  simAnswerQuestions: 'luthor:sim:answer-questions',
  simUserDirection: 'luthor:sim:user-direction',
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

/** API tipada exposta no renderer como window.luthor. */
export interface LuthorApi {
  workspaces: {
    list(): Promise<Workspace[]>
    /** Abre dialog nativo, registra a pasta escolhida. Não inspeciona nem executa nada no workspace. */
    openDialog(): Promise<Workspace | null>
  }
  run: {
    snapshot(): Promise<RunSnapshot>
  }
  sim: {
    pauseAll(): Promise<RunSnapshot>
    resumeAll(): Promise<RunSnapshot>
    pauseAgent(agentId: string): Promise<RunSnapshot>
    resumeAgent(agentId: string): Promise<RunSnapshot>
    answerQuestion(input: AnswerQuestionInput): Promise<RunSnapshot>
    /** Caixa de Decisões: envia várias respostas de uma vez. */
    answerQuestions(inputs: AnswerQuestionInput[]): Promise<RunSnapshot>
    /** Composer: registra nova tarefa/instrução como evento simulado. */
    addUserDirection(input: UserDirectionInput): Promise<RunSnapshot>
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
