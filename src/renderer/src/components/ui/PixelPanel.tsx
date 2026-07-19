import type { HTMLAttributes, ReactNode } from 'react'

interface PixelPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Cor da moldura pixel (CSS color). Default: grafite. */
  frameColor?: string
  title?: string
  titleAccent?: string
}

/** Painel base com moldura pixel (cantos recortados via box-shadow). */
export function PixelPanel({
  children,
  frameColor,
  title,
  titleAccent,
  className = '',
  ...rest
}: PixelPanelProps): React.JSX.Element {
  return (
    <div
      className={`pixel-frame p-4 ${className}`}
      style={frameColor ? ({ '--px-border': frameColor } as React.CSSProperties) : undefined}
      {...rest}
    >
      {title && (
        <h2
          className="font-pixel mb-3 text-xs tracking-wider uppercase"
          style={titleAccent ? { color: titleAccent } : undefined}
        >
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}
