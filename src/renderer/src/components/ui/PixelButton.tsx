import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'orch' | 'warn' | 'danger' | 'ghost'

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-exec-soft text-exec [--px-border:var(--color-exec)] hover:bg-exec/20',
  orch: 'bg-orch-soft text-orch [--px-border:var(--color-orch)] hover:bg-orch/20',
  warn: 'bg-warn-soft text-warn [--px-border:var(--color-warn)] hover:bg-warn/20',
  danger: 'bg-alert-soft text-alert [--px-border:var(--color-alert)] hover:bg-alert/20',
  ghost: 'bg-night-800 text-ink-dim [--px-border:var(--color-night-500)] hover:text-ink'
}

/** Botão pixel: moldura recortada, rótulo em fonte pixelada. */
export function PixelButton({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: PixelButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={`pixel-frame font-pixel cursor-pointer px-3 py-1.5 text-[11px] tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}
