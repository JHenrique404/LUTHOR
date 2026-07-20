import { create } from 'zustand'
import type { RunEvent, RunSnapshot } from '@shared/domain'
import type { AnswerQuestionInput, NewTaskInput, UserDirectionInput } from '@shared/ipc/contract'

interface RunStoreState {
  snapshot: RunSnapshot | null
  /** Último evento recebido — usado para disparar animações pontuais. */
  lastEvent: RunEvent | null
  /** false quando window.luthor não existe (ex.: testes). */
  bridgeAvailable: boolean
  initialized: boolean
  init: () => Promise<void>
  /** Re-busca o snapshot (ex.: após troca de workspace ativo). */
  refreshSnapshot: () => Promise<void>
  pauseAll: () => Promise<void>
  resumeAll: () => Promise<void>
  /** Cancela o run simulado ativo (libera a troca de workspace). */
  cancelRun: () => Promise<void>
  pauseAgent: (agentId: string) => Promise<void>
  resumeAgent: (agentId: string) => Promise<void>
  answerQuestion: (input: AnswerQuestionInput) => Promise<void>
  answerQuestions: (inputs: AnswerQuestionInput[]) => Promise<void>
  addUserDirection: (input: UserDirectionInput) => Promise<void>
  startNewTask: (input: NewTaskInput) => Promise<void>
}

let unsubscribe: (() => void) | null = null

export const useRunStore = create<RunStoreState>((set, get) => ({
  snapshot: null,
  lastEvent: null,
  bridgeAvailable: typeof window !== 'undefined' && window.luthor !== undefined,
  initialized: false,

  init: async () => {
    const api = window.luthor
    if (!api) {
      // Preview no navegador comum (sem Electron), apenas em dev: snapshot
      // estático para inspecionar a UI. Tree-shaken do build de produção.
      if (import.meta.env.DEV && !get().snapshot) {
        const { createBrowserPreviewSnapshot } = await import('@renderer/lib/browser-preview')
        set({ snapshot: createBrowserPreviewSnapshot(), initialized: true })
      }
      return
    }
    if (get().initialized) return
    set({ initialized: true })
    unsubscribe?.()
    unsubscribe = api.sim.onEvent(({ event, snapshot }) => {
      set({ snapshot, lastEvent: event })
    })
    const snapshot = await api.run.snapshot()
    set({ snapshot })
  },

  refreshSnapshot: async () => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.run.snapshot() })
  },

  pauseAll: async () => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.pauseAll() })
  },

  cancelRun: async () => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.cancelRun() })
  },

  resumeAll: async () => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.resumeAll() })
  },

  pauseAgent: async (agentId) => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.pauseAgent(agentId) })
  },

  resumeAgent: async (agentId) => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.resumeAgent(agentId) })
  },

  answerQuestion: async (input) => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.answerQuestion(input) })
  },

  answerQuestions: async (inputs) => {
    const api = window.luthor
    if (!api || inputs.length === 0) return
    set({ snapshot: await api.sim.answerQuestions(inputs) })
  },

  addUserDirection: async (input) => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.addUserDirection(input) })
  },

  startNewTask: async (input) => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.startNewTask(input) })
  }
}))
