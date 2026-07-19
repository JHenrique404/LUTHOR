import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc/contract'
import type {
  AnswerQuestionInput,
  CreateProfileInput,
  LuthorApi,
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
    list: () => ipcRenderer.invoke(IpcChannels.workspaceList),
    openDialog: () => ipcRenderer.invoke(IpcChannels.workspaceOpenDialog)
  },
  run: {
    snapshot: () => ipcRenderer.invoke(IpcChannels.runSnapshot)
  },
  sim: {
    pauseAll: () => ipcRenderer.invoke(IpcChannels.simPauseAll),
    resumeAll: () => ipcRenderer.invoke(IpcChannels.simResumeAll),
    pauseAgent: (agentId: string) => ipcRenderer.invoke(IpcChannels.simPauseAgent, agentId),
    resumeAgent: (agentId: string) => ipcRenderer.invoke(IpcChannels.simResumeAgent, agentId),
    answerQuestion: (input: AnswerQuestionInput) =>
      ipcRenderer.invoke(IpcChannels.simAnswerQuestion, input),
    answerQuestions: (inputs: AnswerQuestionInput[]) =>
      ipcRenderer.invoke(IpcChannels.simAnswerQuestions, inputs),
    addUserDirection: (input: UserDirectionInput) =>
      ipcRenderer.invoke(IpcChannels.simUserDirection, input),
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
    list: () => ipcRenderer.invoke(IpcChannels.connectionsList)
  }
}

contextBridge.exposeInMainWorld('luthor', api)
