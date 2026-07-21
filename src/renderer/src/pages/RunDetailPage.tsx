import { useState } from 'react'
import {
  AGENT_ROLE_LABELS,
  AGENT_STATE_LABELS,
  RUN_STATE_LABELS,
  STEP_STATUS_LABELS
} from '@shared/domain'
import { useRunStore } from '@renderer/stores/run-store'
import { useNow } from '@renderer/lib/use-now'
import {
  AGENT_STATE_STYLE,
  RUN_STATE_STYLE,
  STEP_STATUS_STYLE,
  formatClock,
  formatElapsed
} from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelTabs } from '@renderer/components/ui/PixelTabs'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { StepProgress } from '@renderer/components/ui/StepProgress'
import { RunResultPanel } from '@renderer/components/office/RunResultPanel'

/** Detalhe do Run: resultado (real), plano, agentes, logs, checkpoints e perguntas. */
export function RunDetailPage(): React.JSX.Element {
  const { snapshot } = useRunStore()
  const realRun = snapshot?.run.executor === 'codex_cli'
  const [tab, setTab] = useState(realRun ? 'result' : 'plan')
  const [logFilter, setLogFilter] = useState('')
  const now = useNow(1000)

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-pixel anim-pulse text-xs text-ink-dim">Carregando run…</p>
      </div>
    )
  }

  const runStyle = RUN_STATE_STYLE[snapshot.run.state]

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-pixel text-cyan-glow text-lg tracking-widest">RUN</h1>
          <PixelBadge className={`${runStyle.bg} ${runStyle.text}`}>
            <StatusDot colorClass={runStyle.dot} animClass={runStyle.anim} />
            {RUN_STATE_LABELS[snapshot.run.state]}
          </PixelBadge>
          {realRun ? (
            <span className="font-pixel text-exec text-[10px] uppercase">executor real · codex</span>
          ) : (
            <span className="text-warn text-xs">dados simulados</span>
          )}
        </div>
        <p className="text-sm text-ink">{snapshot.task.title}</p>
        {!realRun && <StepProgress steps={snapshot.steps} />}
      </header>

      <PixelTabs
        active={tab}
        onChange={setTab}
        tabs={[
          ...(realRun
            ? [
                {
                  id: 'result',
                  label: 'Resultado',
                  content: <RunResultPanel snapshot={snapshot} />
                }
              ]
            : []),
          {
            id: 'plan',
            label: 'Plano',
            content: (
              <ol className="space-y-2">
                {[...snapshot.steps]
                  .sort((a, b) => a.index - b.index)
                  .map((step) => {
                    const style = STEP_STATUS_STYLE[step.status]
                    const agent = snapshot.agents.find((a) => a.id === step.assignedAgentId)
                    return (
                      <li
                        key={step.id}
                        className="pixel-frame flex items-center justify-between gap-3 px-4 py-2 [--px-border:var(--color-night-500)]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-pixel text-xs text-ink-faint">{step.index}</span>
                          <span className="text-sm text-ink">{step.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {agent && (
                            <span className="text-[11px] text-ink-faint">
                              {AGENT_ROLE_LABELS[agent.role]}
                            </span>
                          )}
                          <PixelBadge className={`${style.bg} ${style.text}`}>
                            <StatusDot colorClass={style.dot} animClass={style.anim} />
                            {STEP_STATUS_LABELS[step.status]}
                          </PixelBadge>
                        </div>
                      </li>
                    )
                  })}
              </ol>
            )
          },
          {
            id: 'agents',
            label: 'Agentes',
            content: (
              <div className="space-y-2">
                <p className="text-[11px] text-ink-faint">
                  Instâncias temporárias criadas para ESTE run a partir dos perfis
                  reutilizáveis de Configurações. Concluídas permanecem no histórico.
                </p>
                <ul className="space-y-2">
                  {snapshot.agents.map((agent) => {
                    const style = AGENT_STATE_STYLE[agent.state]
                    const profile = snapshot.profiles.find((p) => p.id === agent.profileId)
                    return (
                      <li
                        key={agent.id}
                        className="pixel-frame space-y-2 px-4 py-2 [--px-border:var(--color-night-500)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-pixel min-w-0 text-xs text-ink">
                            {AGENT_ROLE_LABELS[agent.role]} · {agent.name}
                          </p>
                          <PixelBadge className={`${style.bg} ${style.text} max-w-full`}>
                            <StatusDot colorClass={style.dot} animClass={style.anim} />
                            <span className="truncate">{AGENT_STATE_LABELS[agent.state]}</span>
                          </PixelBadge>
                        </div>
                        <p className="truncate text-[11px] text-ink-dim">{agent.subtask}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                          <span>
                            modelo <span className="text-ink-dim">{profile?.model ?? '—'}</span>
                          </span>
                          <span>
                            esforço <span className="text-ink-dim">{agent.effort}</span>
                          </span>
                          <span>
                            tempo{' '}
                            <span className="font-pixel text-ink-dim">
                              {formatElapsed(agent.startedAt, now)}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            último evento:{' '}
                            <span className="text-ink-dim">{agent.lastEventMessage}</span>
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          },
          {
            id: 'logs',
            label: 'Logs',
            content: (
              <div className="space-y-2">
                <label className="block">
                  <span className="font-pixel mb-1 block text-[9px] uppercase text-ink-faint">
                    Filtrar logs
                  </span>
                  <input
                    type="search"
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    placeholder="Ex.: erro, stderr, verificada…"
                    className="pixel-frame-inset w-full max-w-sm bg-night-950 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                  />
                </label>
                <pre className="pixel-frame-inset font-logs max-h-[50vh] overflow-y-auto bg-night-950 p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-dim">
                  {snapshot.events
                    .map((e) => {
                      const agent = snapshot.agents.find((a) => a.id === e.agentId)
                      const who = agent ? AGENT_ROLE_LABELS[agent.role] : 'sistema'
                      return `[${formatClock(e.at)}] [${who}] ${e.message}`
                    })
                    .filter((line) =>
                      logFilter.trim().length === 0
                        ? true
                        : line.toLowerCase().includes(logFilter.trim().toLowerCase())
                    )
                    .join('\n')}
                </pre>
              </div>
            )
          },
          {
            id: 'checkpoints',
            label: 'Checkpoints',
            content: (
              <ul className="space-y-2">
                {[...snapshot.checkpoints].reverse().map((cp) => (
                  <li
                    key={cp.id}
                    className="pixel-frame flex items-center justify-between gap-3 px-4 py-2 [--px-border:var(--color-exec)]"
                  >
                    <span className="text-sm text-ink">{cp.label}</span>
                    <span className="font-pixel text-[10px] text-ink-faint">
                      etapa {cp.stepIndex || '—'} · {formatClock(cp.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          },
          {
            id: 'directions',
            label: 'Instruções',
            content: (
              <ul className="space-y-2">
                {snapshot.events
                  .filter((e) => e.type === 'user_direction')
                  .reverse()
                  .map((e) => (
                    <li
                      key={e.id}
                      className="pixel-frame space-y-1 px-4 py-3 [--px-border:var(--color-orch)]"
                    >
                      <p className="font-pixel text-[10px] uppercase text-orch">
                        você · {formatClock(e.at)}
                      </p>
                      <p className="text-sm text-ink">{e.message}</p>
                    </li>
                  ))}
                {snapshot.events.filter((e) => e.type === 'user_direction').length === 0 && (
                  <li className="text-sm text-ink-faint">
                    Nenhuma instrução registrada. Use “Nova tarefa” ou “+ Instrução” na Agent
                    Office.
                  </li>
                )}
              </ul>
            )
          },
          {
            id: 'questions',
            label: 'Perguntas',
            content: (
              <ul className="space-y-2">
                {snapshot.questions.map((q) => {
                  const agent = snapshot.agents.find((a) => a.id === q.agentId)
                  return (
                    <li
                      key={q.id}
                      className="pixel-frame space-y-1 px-4 py-3 [--px-border:var(--color-warn)]"
                    >
                      <p className="font-pixel text-[10px] uppercase text-warn">
                        {agent ? AGENT_ROLE_LABELS[agent.role] : 'agente'} ·{' '}
                        {q.status === 'pending' ? 'pendente' : 'respondida'}
                      </p>
                      <p className="text-sm text-ink">{q.text}</p>
                      {q.answer && (
                        <p className="text-xs text-ink-dim">
                          Resposta: <span className="text-exec">{q.answer}</span>
                        </p>
                      )}
                    </li>
                  )
                })}
                {snapshot.questions.length === 0 && (
                  <li className="text-sm text-ink-faint">Nenhuma pergunta até agora.</li>
                )}
              </ul>
            )
          }
        ]}
      />
    </div>
  )
}
