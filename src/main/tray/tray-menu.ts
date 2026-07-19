import type { MenuItemConstructorOptions } from 'electron'
import type { RunState } from '@shared/domain'

export interface TrayMenuHandlers {
  onOpen: () => void
  onPauseAll: () => void
  onResumeAll: () => void
  onQuit: () => void
}

/** Estados em que "Pausar tudo" faz sentido na bandeja. */
const PAUSABLE_RUN_STATES: RunState[] = ['running', 'awaiting_user', 'verifying']

/**
 * Template do menu da bandeja, puro e testável (só tipos do Electron).
 * Pausar/Retomar só aparecem quando aplicáveis; sem trabalho ativo, somem.
 */
export function buildTrayMenuTemplate(
  runState: RunState,
  handlers: TrayMenuHandlers
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { label: 'Abrir LUTHOR', click: handlers.onOpen }
  ]
  if (PAUSABLE_RUN_STATES.includes(runState)) {
    items.push({ label: 'Pausar tudo', click: handlers.onPauseAll })
  }
  if (runState === 'paused') {
    items.push({ label: 'Retomar tudo', click: handlers.onResumeAll })
  }
  items.push({ type: 'separator' }, { label: 'Sair do LUTHOR', click: handlers.onQuit })
  return items
}
