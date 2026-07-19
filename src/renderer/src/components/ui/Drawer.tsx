import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Painel lateral acessível: role dialog, Esc fecha, foco entra ao abrir. */
export function Drawer({ open, onClose, title, children }: DrawerProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Depende só de `open` — re-renders não roubam o foco (ver Modal.tsx).
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Fechar painel"
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="pixel-frame anim-drawer-in absolute top-2 right-2 bottom-2 flex w-[420px] max-w-[90vw] flex-col overflow-hidden bg-night-800 [--px-border:var(--color-night-500)]"
      >
        <div className="flex items-center justify-between border-b-2 border-night-600 px-4 py-3">
          <h2 className="font-pixel text-xs tracking-wider uppercase">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="font-pixel cursor-pointer px-2 text-ink-dim hover:text-ink"
          >
            X
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
