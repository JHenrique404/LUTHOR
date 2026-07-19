import type { Agent, AgentProfile, Question, RunEvent } from '@shared/domain'
import { AGENT_ROLE_LABELS, AGENT_STATE_LABELS } from '@shared/domain'
import { AGENT_STATE_STYLE, formatElapsed } from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { AgentAvatar, ROLE_ACCENT } from './AgentAvatar'

interface AgentCardProps {
  agent: Agent
  profile?: AgentProfile
  pendingQuestion?: Question
  lastEvent?: RunEvent | null
  now: number
  onSelect: (agentId: string) => void
  onOpenQuestion: (questionId: string) => void
}

/** Card de agente na Agent Office — dados reais simulados, nunca decoração. */
export function AgentCard({
  agent,
  profile,
  pendingQuestion,
  lastEvent,
  now,
  onSelect,
  onOpenQuestion
}: AgentCardProps): React.JSX.Element {
  const style = AGENT_STATE_STYLE[agent.state]
  const justEmitted = lastEvent?.agentId === agent.id
  const accent = ROLE_ACCENT[agent.role]

  return (
    <div
      key={justEmitted ? lastEvent?.id : undefined}
      className={`pixel-frame flex flex-col gap-2 p-3 text-left ${justEmitted ? 'anim-flash' : ''}`}
      style={{ '--px-border': 'var(--color-night-500)' } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => onSelect(agent.id)}
        className="flex cursor-pointer items-start gap-3 text-left"
        aria-label={`Abrir detalhes do agente ${agent.name}`}
      >
        <AgentAvatar role={agent.role} size={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          {/* flex-wrap + min-w-0: badge de estado nunca vaza do card — quebra linha. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-pixel text-xs" style={{ color: accent }}>
              {AGENT_ROLE_LABELS[agent.role]}
            </span>
            <PixelBadge className={`${style.bg} ${style.text} max-w-full`}>
              <StatusDot colorClass={style.dot} animClass={style.anim} />
              <span className="truncate">{AGENT_STATE_LABELS[agent.state]}</span>
            </PixelBadge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-ink" title={agent.subtask}>
            {agent.subtask}
          </p>
        </div>
      </button>

      <dl className="grid grid-cols-3 gap-x-2 text-[11px] text-ink-dim">
        <div>
          <dt className="font-pixel text-[9px] uppercase text-ink-faint">Modelo</dt>
          <dd className="truncate" title={profile ? `${profile.name} (${profile.model})` : agent.profileId}>
            {profile?.model ?? agent.profileId}
          </dd>
        </div>
        <div>
          <dt className="font-pixel text-[9px] uppercase text-ink-faint">Esforço</dt>
          <dd>{agent.effort}</dd>
        </div>
        <div>
          <dt className="font-pixel text-[9px] uppercase text-ink-faint">Tempo</dt>
          <dd className="font-pixel">{formatElapsed(agent.startedAt, now)}</dd>
        </div>
      </dl>

      <p className="font-logs truncate border-t-2 border-night-700 pt-2 text-[11px] text-ink-dim" title={agent.lastEventMessage}>
        <span className="text-ink-faint">último evento:</span> {agent.lastEventMessage}
      </p>

      {pendingQuestion && (
        <button
          type="button"
          onClick={() => onOpenQuestion(pendingQuestion.id)}
          className="pixel-frame font-pixel anim-blink cursor-pointer bg-warn-soft px-2 py-1 text-[10px] uppercase text-warn [--px-border:var(--color-warn)]"
        >
          ? Pergunta pendente — responder
        </button>
      )}
    </div>
  )
}
