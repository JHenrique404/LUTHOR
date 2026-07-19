import type { RunEvent } from '@shared/domain'
import { formatClock } from '@renderer/lib/state-ui'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

interface EventTickerProps {
  events: RunEvent[]
  limit?: number
}

const EVENT_COLOR: Partial<Record<RunEvent['type'], string>> = {
  step_verified: 'text-exec',
  run_completed: 'text-exec',
  agent_completed: 'text-exec',
  question_opened: 'text-warn',
  question_answered: 'text-warn',
  run_paused: 'text-alert',
  agent_paused: 'text-alert',
  agent_failed: 'text-alert',
  run_resumed: 'text-cyan-glow',
  agent_started: 'text-cyan-glow',
  plan_created: 'text-orch',
  user_direction: 'text-orch'
}

/** Feed ao vivo de eventos simulados (aria-live para leitores de tela). */
export function EventTicker({ events, limit = 8 }: EventTickerProps): React.JSX.Element {
  const recent = [...events].slice(-limit).reverse()
  return (
    <PixelPanel title="Feed de eventos" titleAccent="var(--color-cyan-glow)">
      <ol aria-live="polite" aria-label="Eventos recentes do run" className="space-y-1.5">
        {recent.map((event, i) => (
          <li
            key={event.id}
            className={`font-logs flex gap-2 text-[11px] leading-snug ${i === 0 ? 'anim-slide-in' : ''}`}
          >
            <span className="shrink-0 text-ink-faint">{formatClock(event.at)}</span>
            <span className={EVENT_COLOR[event.type] ?? 'text-ink-dim'}>{event.message}</span>
          </li>
        ))}
        {recent.length === 0 && <li className="text-xs text-ink-faint">Sem eventos ainda.</li>}
      </ol>
    </PixelPanel>
  )
}
