import { create } from 'zustand'
import type { RunEvent, RunSnapshot } from '@shared/domain'
import type { AnswerQuestionInput, UserDirectionInput } from '@shared/ipc/contract'

interface RunStoreState {
  snapshot: RunSnapshot | null
  /** Último evento recebido — usado para disparar animações pontuais. */
  lastEvent: RunEvent | null
  /** false quando window.luthor não existe (ex.: testes). */
  bridgeAvailable: boolean
  initialized: boolean
  init: () => Promise<void>
  pauseAll: () => Promise<void>
  resumeAll: () => Promise<void>
  pauseAgent: (agentId: string) => Promise<void>
  resumeAgent: (agentId: string) => Promise<void>
  answerQuestion: (input: AnswerQuestionInput) => Promise<void>
  answerQuestions: (inputs: AnswerQuestionInput[]) => Promise<void>
  addUserDirection: (input: UserDirectionInput) => Promise<void>
}

let unsubscribe: (() => void) | null = null

export const useRunStore = create<RunStoreState>((set, get) => ({
  snapshot: null,
  lastEvent: null,
  bridgeAvailable: typeof window !== 'undefined' && window.luthor !== undefined,
  initialized: false,

  init: async () => {
    const api = window.luthor
    if (!api || get().initialized) return
    set({ initialized: true })
    unsubscribe?.()
    unsubscribe = api.sim.onEvent(({ event, snapshot }) => {
      set({ snapshot, lastEvent: event })
    })
    const snapshot = await api.run.snapshot()
    set({ snapshot })
  },

  pauseAll: async () => {
    const api = window.luthor
    if (!api) return
    set({ snapshot: await api.sim.pauseAll() })
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
  }
}))
