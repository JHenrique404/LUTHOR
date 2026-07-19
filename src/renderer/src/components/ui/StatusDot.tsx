interface StatusDotProps {
  colorClass: string
  animClass?: string
  label?: string
}

/** Quadradinho de status (pixel), com animação ligada ao estado real. */
export function StatusDot({ colorClass, animClass = '', label }: StatusDotProps): React.JSX.Element {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 ${colorClass} ${animClass}`}
      role="img"
      aria-label={label}
    />
  )
}
