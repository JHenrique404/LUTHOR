import type { Agent, AgentProfile, PlanStep, Run, Task } from '@shared/domain'
import { AGENT_STATE_LABELS, RUN_STATE_LABELS } from '@shared/domain'
import { AGENT_STATE_STYLE, RUN_STATE_STYLE } from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { RunProgressSummary } from '@renderer/components/ui/RunProgressSummary'
import { AgentAvatar } from './AgentAvatar'

interface OrchestratorDeskProps {
  orchestrator: Agent
  profile?: AgentProfile
  task: Task
  run: Run
  steps: PlanStep[]
  onSelect: (agentId: string) => void
}

/** Mesa do orquestrador — bloco roxo central da Agent Office. */
export function OrchestratorDesk({
  orchestrator,
  profile,
  task,
  run,
  steps,
  onSelect
}: OrchestratorDeskProps): React.JSX.Element {
  const agentStyle = AGENT_STATE_STYLE[orchestrator.state]
  const runStyle = RUN_STATE_STYLE[run.state]

  return (
    <PixelPanel
      frameColor="var(--color-orch)"
      className="bg-orch-soft/60"
      aria-label="Mesa do orquestrador"
    >
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => onSelect(orchestrator.id)}
          className="flex cursor-pointer items-center gap-3"
          aria-label="Abrir detalhes do Orquestrador"
        >
          <AgentAvatar role="orchestrator" size={56} />
          <div className="text-left">
            <h2 className="font-pixel text-orch text-sm tracking-wider uppercase">Orquestrador</h2>
            <p className="text-xs text-ink-dim">
              {profile?.name ?? orchestrator.profileId} · {profile?.model ?? '—'} · esforço{' '}
              {orchestrator.effort}
            </p>
          </div>
        </button>

        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[10px] uppercase text-ink-faint">Tarefa atual</p>
          <p className="truncate text-sm text-ink" title={task.title}>
            {task.title}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <PixelBadge className={`${runStyle.bg} ${runStyle.text}`} title="Estado do run">
              <StatusDot colorClass={runStyle.dot} animClass={runStyle.anim} />
              run: {RUN_STATE_LABELS[run.state]}
            </PixelBadge>
            <PixelBadge className={`${agentStyle.bg} ${agentStyle.text}`} title="Estado do orquestrador">
              <StatusDot colorClass={agentStyle.dot} animClass={agentStyle.anim} />
              {AGENT_STATE_LABELS[orchestrator.state]}
            </PixelBadge>
          </div>
          <RunProgressSummary steps={steps} />
        </div>
      </div>
    </PixelPanel>
  )
}
