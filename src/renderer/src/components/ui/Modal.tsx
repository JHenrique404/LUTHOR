import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Ações fixas abaixo da área rolável — nunca saem da janela. */
  footer?: ReactNode
}

/** Modal acessível: role dialog, Esc fecha, foco entra ao abrir. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer
}: ModalProps): React.JSX.Element | null {
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
        className="pixel-frame anim-slide-in relative flex max-h-[85vh] w-[560px] max-w-[92vw] flex-col bg-night-800 [--px-border:var(--color-warn)]"
      >
        {/* Cabeçalho e footer fixos; SÓ o miolo rola (viewports baixas). */}
        <div className="shrink-0 border-b-2 border-night-600 px-5 py-3">
          <h2 className="font-pixel text-warn text-xs tracking-wider uppercase">{title}</h2>
        </div>
        <div data-testid="modal-scroll-area" className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t-2 border-night-600 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  )
}
