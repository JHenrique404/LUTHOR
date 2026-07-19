import type { RunSnapshot } from '@shared/domain'
import {
  AGENT_ROLE_LABELS,
  AGENT_STATE_LABELS,
  STEP_STATUS_LABELS
} from '@shared/domain'
import { AGENT_STATE_STYLE, formatClock } from '@renderer/lib/state-ui'
import { Drawer } from '@renderer/components/ui/Drawer'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { AgentAvatar } from './AgentAvatar'

interface AgentDrawerProps {
  snapshot: RunSnapshot
  agentId: string | null
  onClose: () => void
  onPauseAgent: (agentId: string) => void
  onResumeAgent: (agentId: string) => void
}

const PAUSABLE_STATES = ['planning', 'waiting', 'executing', 'verifying']

/** Painel lateral do agente: histórico, plano e logs simulados. */
export function AgentDrawer({
  snapshot,
  agentId,
  onClose,
  onPauseAgent,
  onResumeAgent
}: AgentDrawerProps): React.JSX.Element | null {
  const agent = snapshot.agents.find((a) => a.id === agentId)
  if (!agent) return null

  const profile = snapshot.profiles.find((p) => p.id === agent.profileId)
  const style = AGENT_STATE_STYLE[agent.state]
  const assignedSteps = snapshot.steps.filter((s) => s.assignedAgentId === agent.id)
  const history = snapshot.events.filter((e) => e.agentId === agent.id).slice(-30).reverse()
  const logs = history.filter((e) => e.type === 'agent_log')

  return (
    <Drawer open onClose={onClose} title={`${AGENT_ROLE_LABELS[agent.role]} — ${agent.name}`}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <AgentAvatar role={agent.role} size={56} />
          <div className="space-y-1">
            <PixelBadge className={`${style.bg} ${style.text}`}>
              <StatusDot colorClass={style.dot} animClass={style.anim} />
              {AGENT_STATE_LABELS[agent.state]}
            </PixelBadge>
            <p className="text-sm text-ink">{agent.subtask}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs text-ink-dim">
          <div>
            <dt className="font-pixel text-[9px] uppercase text-ink-faint">Perfil</dt>
            <dd>{profile?.name ?? agent.profileId}</dd>
          </div>
          <div>
            <dt className="font-pixel text-[9px] uppercase text-ink-faint">Modelo</dt>
            <dd>{profile?.model ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-pixel text-[9px] uppercase text-ink-faint">Esforço</dt>
            <dd>{agent.effort}</dd>
          </div>
          <div>
            <dt className="font-pixel text-[9px] uppercase text-ink-faint">Escrita</dt>
            <dd>
              {agent.writeScope === 'writer'
                ? `writer · ${agent.worktreeRef ?? 'sem worktree'}`
                : 'somente leitura'}
            </dd>
          </div>
        </dl>

        <div>
          {PAUSABLE_STATES.includes(agent.state) && (
            <PixelButton variant="danger" onClick={() => onPauseAgent(agent.id)}>
              Pausar agente
            </PixelButton>
          )}
          {agent.state === 'paused' && (
            <PixelButton variant="primary" onClick={() => onResumeAgent(agent.id)}>
              Retomar agente
            </PixelButton>
          )}
        </div>

        {assignedSteps.length > 0 && (
          <section aria-label="Plano do agente">
            <h3 className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">Plano</h3>
            <ul className="space-y-1 text-xs">
              {assignedSteps.map((step) => (
                <li key={step.id} className="flex items-center justify-between gap-2">
                  <span className="text-ink-dim">
                    {step.index}. {step.title}
                  </span>
                  <PixelBadge className="bg-night-700 text-ink-dim">
                    {STEP_STATUS_LABELS[step.status]}
                  </PixelBadge>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Histórico do agente">
          <h3 className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">Histórico</h3>
          <ol className="space-y-1">
            {history.map((event) => (
              <li key={event.id} className="font-logs flex gap-2 text-[11px]">
                <span className="shrink-0 text-ink-faint">{formatClock(event.at)}</span>
                <span className="text-ink-dim">{event.message}</span>
              </li>
            ))}
            {history.length === 0 && (
              <li className="text-xs text-ink-faint">Sem eventos deste agente ainda.</li>
            )}
          </ol>
        </section>

        <section aria-label="Logs simulados do agente">
          <h3 className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">
            Logs (simulados)
          </h3>
          <pre className="pixel-frame-inset font-logs max-h-48 overflow-y-auto bg-night-950 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-dim">
            {logs.length > 0
              ? logs.map((l) => `[${formatClock(l.at)}] ${l.message}`).join('\n')
              : 'Sem logs ainda.'}
          </pre>
        </section>
      </div>
    </Drawer>
  )
}
