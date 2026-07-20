import { create } from 'zustand'
import type { Workspace } from '@shared/domain'
import type { WorkspaceError } from '@shared/ipc/contract'
import { useRunStore } from './run-store'

/**
 * Estado do registro de workspaces no renderer (Fase 2A).
 * Toda mutação acontece no main via IPC; aqui só refletimos o resultado
 * e traduzimos erros em feedback claro para a UI.
 */

export interface WorkspaceFeedback {
  kind: 'notice' | 'error'
  message: string
}

interface WorkspaceStoreState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  /** false quando window.luthor não existe (ex.: testes/preview no navegador). */
  bridgeAvailable: boolean
  initialized: boolean
  feedback: WorkspaceFeedback | null
  init: () => Promise<void>
  refresh: () => Promise<void>
  openDialog: () => Promise<void>
  setActive: (workspaceId: string) => Promise<void>
  remove: (workspaceId: string) => Promise<void>
  clearFeedback: () => void
}

function describeError(error: WorkspaceError): WorkspaceFeedback {
  return { kind: 'error', message: error.message }
}

/** Workspace ativo mudou no main: o snapshot do run precisa acompanhar. */
async function syncRunSnapshot(): Promise<void> {
  await useRunStore.getState().refreshSnapshot()
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  bridgeAvailable: typeof window !== 'undefined' && window.luthor !== undefined,
  initialized: false,
  feedback: null,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })
    await get().refresh()
  },

  refresh: async () => {
    const api = window.luthor
    if (!api) return
    const state = await api.workspaces.state()
    set({ workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId })
  },

  openDialog: async () => {
    const api = window.luthor
    if (!api) return
    const result = await api.workspaces.openDialog()
    if (result.status === 'cancelled') return
    if (result.status === 'error') {
      set({ feedback: describeError(result) })
      return
    }
    set({
      workspaces: result.state.workspaces,
      activeWorkspaceId: result.state.activeWorkspaceId,
      feedback: !result.activated
        ? {
            kind: 'notice',
            message: `"${result.workspace.name}" foi cadastrado, mas o run simulado ativo impediu a ativação. Conclua ou cancele o run para trocar de workspace.`
          }
        : result.alreadyRegistered
          ? { kind: 'notice', message: `"${result.workspace.name}" já estava cadastrado — selecionado como ativo.` }
          : null
    })
    if (result.activated) await syncRunSnapshot()
  },

  setActive: async (workspaceId) => {
    const api = window.luthor
    if (!api) return
    const result = await api.workspaces.setActive(workspaceId)
    if (result.status === 'error') {
      set({ feedback: describeError(result) })
      return
    }
    set({
      workspaces: result.state.workspaces,
      activeWorkspaceId: result.state.activeWorkspaceId,
      feedback: null
    })
    await syncRunSnapshot()
  },

  remove: async (workspaceId) => {
    const api = window.luthor
    if (!api) return
    const result = await api.workspaces.remove(workspaceId)
    if (result.status === 'error') {
      set({ feedback: describeError(result) })
      return
    }
    set({
      workspaces: result.state.workspaces,
      activeWorkspaceId: result.state.activeWorkspaceId,
      feedback: null
    })
    await syncRunSnapshot()
  },

  clearFeedback: () => set({ feedback: null })
}))
