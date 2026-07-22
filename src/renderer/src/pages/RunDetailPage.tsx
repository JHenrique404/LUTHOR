import { useEffect, useState } from 'react'
import type { ProviderCapabilities } from '@shared/domain'
import {
  AGENT_ROLE_LABELS,
  AGENT_STATE_LABELS,
  RUN_STATE_LABELS,
  STEP_STATUS_LABELS,
  executionSummary,
  isAgentTerminal
} from '@shared/domain'
import { useRunStore } from '@renderer/stores/run-store'
import { useNow } from '@renderer/lib/use-now'
import {
  AGENT_STATE_STYLE,
  RUN_STATE_STYLE,
  STEP_STATUS_STYLE,
  formatClock,
  formatDuration
} from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelTabs } from '@renderer/components/ui/PixelTabs'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { StepProgress } from '@renderer/components/ui/StepProgress'
import { RunResultPanel } from '@renderer/components/office/RunResultPanel'
import { ComposerModal } from '@renderer/components/office/ComposerModal'

/** Detalhe do Run: resultado (real), plano, agentes, logs, checkpoints e perguntas. */
export function RunDetailPage(): React.JSX.Element {
  const { snapshot, startNewTask } = useRunStore()
  const realRun = snapshot?.run.executor === 'codex_cli'
  const [tab, setTab] = useState(realRun ? 'result' : 'execution')
  const [logFilter, setLogFilter] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [codexAvailability, setCodexAvailability] = useState<{ ok: boolean; reason?: string }>({
    ok: false,
    reason: 'verificando a CLI do Codex…'
  })
  const [codexCapabilities, setCodexCapabilities] = useState<ProviderCapabilities | null>(null)
  const now = useNow(1000)

  useEffect(() => {
    void window.luthor?.connections.list().then((list) => {
      const codex = list.find((c) => c.id === 'codex')
      if (codex) setCodexAvailability({ ok: codex.status === 'configured', reason: codex.detail })
    })
    void window.luthor?.codex?.capabilities().then(setCodexCapabilities)
  }, [])

  if (!snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="font-pixel text-cyan-glow text-lg tracking-widest">RUN</h1>
        <p className="max-w-md text-sm text-ink-dim">
          Nenhum run ainda. Crie uma <strong>Nova tarefa</strong> na Agent Office para ver aqui o
          resultado, a execução e os logs.
        </p>
      </div>
    )
  }

  const runStyle = RUN_STATE_STYLE[snapshot.run.state]

  // Abas condicionais: nunca mostrar área vazia ou obscura (item 14).
  const workers = snapshot.agents.filter((a) => a.role !== 'orchestrator')
  const execSummary = executionSummary(workers)
  const hasMultipleAgents = snapshot.agents.length > 1
  const directionEvents = snapshot.events.filter((e) => e.type === 'user_direction')
  const hasDecisions = snapshot.questions.length > 0 || directionEvents.length > 0
  const hasCheckpoints = snapshot.checkpoints.length > 0

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
          {/* "Nova tarefa" sempre disponível — cria um NOVO run, não mexe neste. */}
          <PixelButton variant="orch" className="ml-auto" onClick={() => setComposerOpen(true)}>
            Nova tarefa
          </PixelButton>
        </div>
        <p className="text-sm text-ink">{snapshot.task.title}</p>
        {/* Barra de etapas verificadas SÓ com plano real com etapas. */}
        {snapshot.steps.length > 0 && <StepProgress steps={snapshot.steps} />}
      </header>

      {composerOpen && (
        <ComposerModal
          kind="new_task"
          agents={snapshot.agents}
          continuedFromRunId={snapshot.run.id}
          codexAvailability={codexAvailability}
          codexCapabilities={codexCapabilities}
          onPickContext={(k) =>
            window.luthor?.codex?.pickContext(k) ?? Promise.resolve({ status: 'cancelled' as const })
          }
          onSuggestContext={(q) => window.luthor?.codex?.suggestContext(q) ?? Promise.resolve([])}
          onClose={() => setComposerOpen(false)}
          onSubmitNewTask={(input) => void startNewTask(input)}
          onSubmitInstruction={() => {}}
        />
      )}

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
          // "Execução": progresso HONESTO das instâncias reais (sem "0 de 0").
          {
            id: 'execution',
            label: 'Execução',
            content: (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2" aria-label="Resumo de execução">
                  {[
                    { n: execSummary.running, t: 'em andamento', c: 'bg-exec-soft text-exec' },
                    { n: execSummary.awaiting, t: 'aguardando resposta', c: 'bg-warn-soft text-warn' },
                    { n: execSummary.completed, t: 'concluída(s)', c: 'bg-night-700 text-ink-dim' },
                    { n: execSummary.failed, t: 'com falha', c: 'bg-alert-soft text-alert' }
                  ]
                    .filter((x) => x.n > 0)
                    .map((x) => (
                      <PixelBadge key={x.t} className={x.c}>
                        {x.n} {x.t}
                      </PixelBadge>
                    ))}
                  {workers.length === 0 && (
                    <span className="text-sm text-ink-faint">Preparando execução…</span>
                  )}
                </div>
                <ul className="space-y-2">
                  {workers.map((agent) => {
                    const style = AGENT_STATE_STYLE[agent.state]
                    return (
                      <li
                        key={agent.id}
                        className="pixel-frame flex flex-wrap items-center justify-between gap-2 px-4 py-2 [--px-border:var(--color-night-500)]"
                      >
                        <span className="font-pixel min-w-0 truncate text-xs text-ink">
                          {agent.name}
                        </span>
                        <PixelBadge className={`${style.bg} ${style.text}`}>
                          <StatusDot colorClass={style.dot} animClass={style.anim} />
                          {AGENT_STATE_LABELS[agent.state]}
                        </PixelBadge>
                        <span className="font-pixel text-[10px] text-ink-faint">
                          {formatDuration(
                            agent.startedAt,
                            agent.finishedAt,
                            isAgentTerminal(agent.state),
                            now
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="text-[11px] text-ink-faint">
                  Progresso real de execução — sem plano de etapas inventado. A barra de “etapas
                  verificadas” só aparece quando existe um plano real.
                </p>
              </div>
            )
          },
          // Aba Plano só existe quando há um plano REAL com etapas (sem "0 de 0").
          ...(snapshot.steps.length > 0
            ? [
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
                                <span className="font-pixel text-xs text-ink-faint">
                                  {step.index}
                                </span>
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
                }
              ]
            : []),
          // "Agentes" só quando há mais de uma instância (além da execução mínima).
          ...(hasMultipleAgents
            ? [
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
                              {formatDuration(
                                agent.startedAt,
                                agent.finishedAt,
                                isAgentTerminal(agent.state),
                                now
                              )}
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
          }
              ]
            : []),
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
                {snapshot.events.length === 0 ? (
                  <p className="pixel-frame-inset bg-night-950 p-4 text-sm text-ink-faint">
                    Ainda sem logs. Aqui aparece o passo a passo técnico do run (eventos da CLI,
                    stderr, transições de estado) conforme ele avança.
                  </p>
                ) : (
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
                )}
              </div>
            )
          },
          // "Decisões" (perguntas + instruções/continuações) só quando existir algo.
          ...(hasDecisions
            ? [
                {
                  id: 'decisions',
                  label: 'Decisões',
                  content: (
                    <div className="space-y-3">
                      {snapshot.questions.length === 0 && directionEvents.length === 0 && (
                        <p className="text-sm text-ink-faint">
                          Perguntas do executor, suas respostas e continuações aparecem aqui.
                        </p>
                      )}
                      {snapshot.questions.map((q) => {
                        const agent = snapshot.agents.find((a) => a.id === q.agentId)
                        return (
                          <div
                            key={q.id}
                            className="pixel-frame space-y-1 px-4 py-3 [--px-border:var(--color-warn)]"
                          >
                            <p className="font-pixel text-[10px] uppercase text-warn">
                              {agent ? agent.name : 'agente'} ·{' '}
                              {q.status === 'pending' ? 'aguardando sua resposta' : 'respondida'}
                            </p>
                            <p className="text-sm text-ink">{q.text}</p>
                            {q.answer && (
                              <p className="text-xs text-ink-dim">
                                Resposta: <span className="text-exec">{q.answer}</span>
                              </p>
                            )}
                          </div>
                        )
                      })}
                      {directionEvents
                        .slice()
                        .reverse()
                        .map((e) => (
                          <div
                            key={e.id}
                            className="pixel-frame space-y-1 px-4 py-3 [--px-border:var(--color-orch)]"
                          >
                            <p className="font-pixel text-[10px] uppercase text-orch">
                              você · {formatClock(e.at)}
                            </p>
                            <p className="text-sm text-ink">{e.message}</p>
                          </div>
                        ))}
                    </div>
                  )
                }
              ]
            : []),
          // "Checkpoints" só com marco/decisão explicitamente registrada.
          ...(hasCheckpoints
            ? [
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
                }
              ]
            : [])
        ]}
      />
    </div>
  )
}
