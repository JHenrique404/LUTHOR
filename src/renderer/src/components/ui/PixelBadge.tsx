import type { ReactNode } from 'react'

interface PixelBadgeProps {
  children: ReactNode
  className?: string
  title?: string
}

/** Selo curto em fonte pixelada (estados, modelos, contadores). */
export function PixelBadge({ children, className = '', title }: PixelBadgeProps): React.JSX.Element {
  return (
    <span
      title={title}
      className={`font-pixel inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] tracking-wide uppercase ${className}`}
    >
      {children}
    </span>
  )
}
