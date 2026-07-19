import { useState } from 'react'
import type { Agent, AgentProfile, RunEvent } from '@shared/domain'
import { AGENT_STATE_LABELS, SIMULATED_WORKSPACE_LIMITS } from '@shared/domain'
import { AGENT_STATE_STYLE, formatElapsed } from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { AgentAvatar } from './AgentAvatar'

interface SquadCardProps {
  members: Agent[]
  profile?: AgentProfile
  lastEvent?: RunEvent | null
  now: number
  onSelect: (agentId: string) => void
}

/**
 * Card agregado de squad dinâmica: resumo compacto + expansão para as
 * instâncias individuais. Evita poluir a Agent Office com cards soltos.
 */
export function SquadCard({
  members,
  profile,
  lastEvent,
  now,
  onSelect
}: SquadCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const active = members.filter((m) => m.state === 'executing' || m.state === 'verifying')
  const queued = members.filter((m) => m.state === 'waiting')
  const completed = members.filter((m) => m.state === 'completed')
  const justEmitted = members.some((m) => m.id === lastEvent?.agentId)

  return (
    <div
      className={`pixel-frame col-span-full flex flex-col gap-2 p-3 ${justEmitted ? 'anim-flash' : ''}`}
      style={{ '--px-border': 'var(--color-exec)' } as React.CSSProperties}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        className="flex cursor-pointer flex-wrap items-center gap-3 text-left"
      >
        <AgentAvatar role="worker" size={40} className="shrink-0" />
        <span className="font-pixel text-exec text-xs">
          Squad Sonnet · {active.length} ativo{active.length === 1 ? '' : 's'} · {queued.length} na
          fila · {completed.length} concluído{completed.length === 1 ? '' : 's'}
        </span>
        <span className="text-[11px] text-ink-faint">
          perfil {profile?.name ?? 'sonnet-worker'} · limites simulados:{' '}
          {SIMULATED_WORKSPACE_LIMITS.maxProcesses} processos ·{' '}
          {SIMULATED_WORKSPACE_LIMITS.maxWriters} escritores
        </span>
        <span className="font-pixel ml-auto text-[10px] text-ink-dim">
          {expanded ? '[-] recolher' : '[+] expandir'}
        </span>
      </button>

      {expanded && (
        <ul className="space-y-1 border-t-2 border-night-700 pt-2">
          {members.map((member) => {
            const style = AGENT_STATE_STYLE[member.state]
            return (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => onSelect(member.id)}
                  aria-label={`Abrir detalhes de ${member.name}`}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-left hover:bg-night-700"
                >
                  <span className="font-pixel w-24 shrink-0 text-[11px] text-ink">
                    {member.name}
                  </span>
                  <PixelBadge className={`${style.bg} ${style.text}`}>
                    <StatusDot colorClass={style.dot} animClass={style.anim} />
                    {AGENT_STATE_LABELS[member.state]}
                  </PixelBadge>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-dim">
                    {member.subtask}
                  </span>
                  <span className="font-pixel shrink-0 text-[10px] text-ink-faint">
                    {formatElapsed(member.startedAt, now)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
