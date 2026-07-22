import type { MenuItemConstructorOptions } from 'electron'
import type { RunExecutor, RunState } from '@shared/domain'

export interface TrayMenuHandlers {
  onOpen: () => void
  onPauseAll: () => void
  onResumeAll: () => void
  onQuit: () => void
  /** Cancelamento gracioso do run REAL (executor codex_cli). */
  onCancelRun?: () => void
}

/** Estados em que "Pausar tudo" faz sentido na bandeja (só simulação). */
const PAUSABLE_RUN_STATES: RunState[] = ['running', 'awaiting_user', 'verifying']
const ACTIVE_RUN_STATES: RunState[] = ['running', 'awaiting_user', 'verifying', 'planning']

/**
 * Template do menu da bandeja, puro e testável (só tipos do Electron).
 * Pausar/Retomar só aparecem quando aplicáveis; sem trabalho ativo, somem.
 * Run REAL não tem pausa (a CLI não suporta): oferece "Cancelar run".
 */
export function buildTrayMenuTemplate(
  runState: RunState,
  handlers: TrayMenuHandlers,
  executor: RunExecutor = 'simulated'
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { label: 'Abrir LUTHOR', click: handlers.onOpen }
  ]
  if (executor === 'codex_cli') {
    if (ACTIVE_RUN_STATES.includes(runState) && handlers.onCancelRun) {
      items.push({ label: 'Cancelar run', click: handlers.onCancelRun })
    }
  } else {
    if (PAUSABLE_RUN_STATES.includes(runState)) {
      items.push({ label: 'Pausar tudo', click: handlers.onPauseAll })
    }
    if (runState === 'paused') {
      items.push({ label: 'Retomar tudo', click: handlers.onResumeAll })
    }
  }
  items.push({ type: 'separator' }, { label: 'Sair do LUTHOR', click: handlers.onQuit })
  return items
}
