import type { AgentRole } from '@shared/domain'

/**
 * Avatares pixel-art ORIGINAIS do LUTHOR, desenhados como grades de
 * retângulos SVG — nenhum asset de terceiros.
 * Legenda: '.' transparente | a acento do papel | d sombra | w branco | e olho
 */

const SHADE = '#141a33'
const WHITE = '#e8ecf8'
const EYE = '#070b16'

const ROLE_ACCENT: Record<AgentRole, string> = {
  orchestrator: '#a583ff',
  backend: '#37e6a0',
  frontend: '#45d8e8',
  researcher: '#f6c245',
  verifier: '#6ea8fe',
  worker: '#8ae67e'
}

/* Cada papel tem silhueta própria (coroa, chave, pincel, lupa, escudo). */
const ROLE_MAP: Record<AgentRole, string[]> = {
  orchestrator: [
    '..a..aa..a..',
    '..a..aa..a..',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '.awweaawwea.',
    '.aaaaaaaaaa.',
    '..aaaddaaaa.',
    '..dadaaadad.',
    '...aaaaaa...',
    '..aa.dd.aa..',
    '..a......a..',
    '..d......d..'
  ],
  backend: [
    '............',
    '.d.aaaaaa.d.',
    '.daaaaaaaad.',
    '..aweaawea..',
    '..aaaaaaaa..',
    '..aaddddaa..',
    '.aaadaaadaa.',
    '.a.aaaaaa.a.',
    '...adddda...',
    '...aa..aa...',
    '..dd....dd..',
    '............'
  ],
  frontend: [
    '............',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '..aweaawea..',
    '..aaaaaaaa..',
    '...aaaaaa.w.',
    '..aadddda.w.',
    '.a.aaaaaa.a.',
    '...adddda.a.',
    '...aa..aa.d.',
    '..dd....dd..',
    '............'
  ],
  researcher: [
    '............',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '..aweaawea..',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '..aadddaaww.',
    '.a.aaaaa.w.w',
    '...addda.ww.',
    '...aa..aa.d.',
    '..dd....dd..',
    '............'
  ],
  verifier: [
    '............',
    '...aaaaaa...',
    '..aaaaaaaa..',
    '..aweaawea..',
    '..aaaaaaaa..',
    '.aaaaaaaaaa.',
    '.aaaaaaawaa.',
    '.aaaawawaaa.',
    '..aaaawaaa..',
    '...aaaaaa...',
    '....aaaa....',
    '.....aa.....'
  ],
  worker: [
    '............',
    '..d.aaaa.d..',
    '..daaaaaad..',
    '..aweaawea..',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '..aaddddaa..',
    '.a.aaaaaa.a.',
    '.a.adddda.a.',
    '...aa..aa...',
    '..dd....dd..',
    '............'
  ]
}

interface AgentAvatarProps {
  role: AgentRole
  size?: number
  className?: string
}

export function AgentAvatar({ role, size = 48, className = '' }: AgentAvatarProps): React.JSX.Element {
  const map = ROLE_MAP[role]
  const accent = ROLE_ACCENT[role]
  const colorOf: Record<string, string> = { a: accent, d: SHADE, w: WHITE, e: EYE }

  return (
    <svg
      viewBox={`0 0 ${map[0].length} ${map.length}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {map.flatMap((row, y) =>
        row.split('').map((ch, x) => {
          const fill = colorOf[ch]
          if (!fill) return null
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
        })
      )}
    </svg>
  )
}

export { ROLE_ACCENT }
