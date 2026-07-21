import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc/contract'
import type {
  AnswerQuestionInput,
  CreateProfileInput,
  LuthorApi,
  NewTaskInput,
  SimEventPayload,
  UpdateProfileInput,
  UserDirectionInput
} from '@shared/ipc/contract'

/**
 * Ponte segura main <-> renderer.
 * contextIsolation: true / nodeIntegration: false — o renderer só enxerga
 * a superfície tipada LuthorApi, nada de Node ou Electron.
 */
const api: LuthorApi = {
  workspaces: {
    state: () => ipcRenderer.invoke(IpcChannels.workspaceState),
    openDialog: () => ipcRenderer.invoke(IpcChannels.workspaceOpenDialog),
    setActive: (workspaceId: string) =>
      ipcRenderer.invoke(IpcChannels.workspaceSetActive, workspaceId),
    remove: (workspaceId: string) => ipcRenderer.invoke(IpcChannels.workspaceRemove, workspaceId)
  },
  run: {
    snapshot: () => ipcRenderer.invoke(IpcChannels.runSnapshot)
  },
  sim: {
    pauseAll: () => ipcRenderer.invoke(IpcChannels.simPauseAll),
    resumeAll: () => ipcRenderer.invoke(IpcChannels.simResumeAll),
    cancelRun: () => ipcRenderer.invoke(IpcChannels.simCancelRun),
    pauseAgent: (agentId: string) => ipcRenderer.invoke(IpcChannels.simPauseAgent, agentId),
    resumeAgent: (agentId: string) => ipcRenderer.invoke(IpcChannels.simResumeAgent, agentId),
    answerQuestion: (input: AnswerQuestionInput) =>
      ipcRenderer.invoke(IpcChannels.simAnswerQuestion, input),
    answerQuestions: (inputs: AnswerQuestionInput[]) =>
      ipcRenderer.invoke(IpcChannels.simAnswerQuestions, inputs),
    addUserDirection: (input: UserDirectionInput) =>
      ipcRenderer.invoke(IpcChannels.simUserDirection, input),
    startNewTask: (input: NewTaskInput) => ipcRenderer.invoke(IpcChannels.simNewTask, input),
    onEvent: (cb: (payload: SimEventPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: SimEventPayload): void =>
        cb(payload)
      ipcRenderer.on(IpcChannels.simEvent, listener)
      return () => ipcRenderer.removeListener(IpcChannels.simEvent, listener)
    }
  },
  profiles: {
    list: () => ipcRenderer.invoke(IpcChannels.profilesList),
    create: (input: CreateProfileInput) => ipcRenderer.invoke(IpcChannels.profileCreate, input),
    update: (input: UpdateProfileInput) => ipcRenderer.invoke(IpcChannels.profileUpdate, input),
    duplicate: (profileId: string) => ipcRenderer.invoke(IpcChannels.profileDuplicate, profileId),
    remove: (profileId: string) => ipcRenderer.invoke(IpcChannels.profileDelete, profileId)
  },
  connections: {
    list: () => ipcRenderer.invoke(IpcChannels.connectionsList),
    refresh: () => ipcRenderer.invoke(IpcChannels.connectionsRefresh),
    chooseCodexBinary: () => ipcRenderer.invoke(IpcChannels.codexChooseBinary),
    clearCodexBinary: () => ipcRenderer.invoke(IpcChannels.codexClearBinary)
  },
  codex: {
    capabilities: () => ipcRenderer.invoke(IpcChannels.codexCapabilities),
    pickContext: (kind: 'file' | 'folder') =>
      ipcRenderer.invoke(IpcChannels.codexPickContext, { kind }),
    suggestContext: (query: string) =>
      ipcRenderer.invoke(IpcChannels.codexSuggestContext, { query })
  }
}

contextBridge.exposeInMainWorld('luthor', api)
