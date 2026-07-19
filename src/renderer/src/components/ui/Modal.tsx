import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Modal acessível: role dialog, Esc fecha, foco entra ao abrir. */
export function Modal({ open, onClose, title, children }: ModalProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // O efeito depende SÓ de `open`: re-renders (novo onClose inline, snapshot
  // da simulação a cada evento) não podem roubar o foco de quem está digitando.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="pixel-frame anim-slide-in relative w-[520px] max-w-[92vw] bg-night-800 [--px-border:var(--color-warn)]"
      >
        <div className="border-b-2 border-night-600 px-5 py-3">
          <h2 className="font-pixel text-warn text-xs tracking-wider uppercase">{title}</h2>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
