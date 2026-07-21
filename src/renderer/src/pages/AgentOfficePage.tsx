import { useEffect, useState } from 'react'
import type { Agent, ProviderCapabilities } from '@shared/domain'
import { RUN_STATE_LABELS, verifiedProgress } from '@shared/domain'
import { isTerminal } from '@shared/state-machine/run-state'
import { useRunStore } from '@renderer/stores/run-store'
import { useNow } from '@renderer/lib/use-now'
import { RUN_STATE_STYLE } from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { OrchestratorDesk } from '@renderer/components/office/OrchestratorDesk'
import { AgentCard } from '@renderer/components/office/AgentCard'
import { SquadCard } from '@renderer/components/office/SquadCard'
import { AgentDrawer } from '@renderer/components/office/AgentDrawer'
import { DecisionBox } from '@renderer/components/office/DecisionBox'
import { ComposerModal } from '@renderer/components/office/ComposerModal'
import type { ComposerKind } from '@renderer/components/office/ComposerModal'
import { EventTicker } from '@renderer/components/office/EventTicker'

interface ComposerState {
  kind: ComposerKind
  continuedFromRunId?: string
}

/** Estados em que o run aceita "Direcionar run". */
const DIRECTABLE_RUN_STATES = ['running', 'awaiting_user', 'paused']

/** Agent Office: painel principal vivo com o run demo simulado. */
export function AgentOfficePage(): React.JSX.Element {
  const {
    snapshot,
    lastEvent,
    pauseAll,
    resumeAll,
    cancelRun,
    pauseAgent,
    resumeAgent,
    answerQuestions,
    addUserDirection,
    startNewTask
  } = useRunStore()
  const now = useNow(1000)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [decisionBoxOpen, setDecisionBoxOpen] = useState(false)
  const [decisionInitialId, setDecisionInitialId] = useState<string | null>(null)
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [codexAvailability, setCodexAvailability] = useState<{ ok: boolean; reason?: string }>({
    ok: false,
    reason: 'verificando a CLI do Codex…'
  })
  const [codexCapabilities, setCodexCapabilities] = useState<ProviderCapabilities | null>(null)

  useEffect(() => {
    void window.luthor?.connections.list().then((list) => {
      const codex = list.find((c) => c.id === 'codex')
      if (codex) setCodexAvailability({ ok: codex.status === 'configured', reason: codex.detail })
    })
    void window.luthor?.codex?.capabilities().then(setCodexCapabilities)
  }, [])

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-pixel anim-pulse text-xs text-ink-dim">Carregando central…</p>
      </div>
    )
  }

  const orchestrator = snapshot.agents.find((a) => a.role === 'orchestrator')
  const workers = snapshot.agents.filter((a) => a.role !== 'orchestrator')
  const soloWorkers = workers.filter((a) => a.squadId === null)
  const squads = new Map<string, Agent[]>()
  for (const worker of workers) {
    if (!worker.squadId) continue
    squads.set(worker.squadId, [...(squads.get(worker.squadId) ?? []), worker])
  }

  const paused = snapshot.run.state === 'paused'
  const terminal = isTerminal(snapshot.run.state)
  const realRun = snapshot.run.executor === 'codex_cli'
  const cancelling = snapshot.run.cancelRequested && !terminal
  const directable = !realRun && DIRECTABLE_RUN_STATES.includes(snapshot.run.state)
  const runStyle = RUN_STATE_STYLE[snapshot.run.state]
  const pendingQuestions = snapshot.questions.filter((q) => q.status === 'pending')
  const progress = verifiedProgress(snapshot.steps)

  const openDecisionBox = (questionId?: string): void => {
    setDecisionInitialId(questionId ?? null)
    setDecisionBoxOpen(true)
  }

  return (
    <div className="scanlines relative flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-pixel text-cyan-glow text-lg tracking-widest">AGENT OFFICE</h1>
          <p className="text-xs text-ink-faint">
            workspace ativo: <span className="text-exec">{snapshot.workspace.name}</span> · run{' '}
            <span className="font-logs">{snapshot.run.id}</span> ·{' '}
            {realRun ? (
              <span className="font-pixel text-exec">EXECUTOR REAL · CODEX CLI</span>
            ) : (
              <span className="text-warn">agentes simulados</span>
            )}{' '}
            · um run por vez
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PixelButton
            variant={pendingQuestions.length > 0 ? 'warn' : 'ghost'}
            className={pendingQuestions.length > 0 ? 'anim-blink' : ''}
            onClick={() => openDecisionBox()}
            disabled={pendingQuestions.length === 0}
            aria-label={`Caixa de Decisões, ${pendingQuestions.length} perguntas pendentes`}
          >
            Decisões ({pendingQuestions.length})
          </PixelButton>
          {/* "Nova tarefa" é o caminho permanente para falar com o orquestrador —
              disponível mesmo com run terminado. */}
          <PixelButton variant="orch" onClick={() => setComposer({ kind: 'new_task' })}>
            Nova tarefa
          </PixelButton>
          {directable && (
            <PixelButton variant="orch" onClick={() => setComposer({ kind: 'instruction' })}>
              Direcionar run
            </PixelButton>
          )}
          {/* Run REAL: a CLI não suporta pausa — só cancelamento gracioso. */}
          {!terminal && realRun && (
            <PixelButton
              variant="danger"
              disabled={cancelling}
              onClick={() => void cancelRun()}
              title="Interrompe graciosamente; força o encerramento após 5s"
            >
              {cancelling ? 'Cancelando…' : 'Cancelar run'}
            </PixelButton>
          )}
          {!terminal && !realRun && (
            <PixelButton
              variant={paused ? 'primary' : 'danger'}
              onClick={() => void (paused ? resumeAll() : pauseAll())}
            >
              {paused ? 'Retomar' : 'Pausar tudo'}
            </PixelButton>
          )}
          {terminal && (
            <PixelBadge
              className={`${runStyle.bg} ${runStyle.text} px-3 py-1.5 text-xs`}
              title="Estado final do run"
            >
              <StatusDot colorClass={runStyle.dot} />
              {RUN_STATE_LABELS[snapshot.run.state]}
            </PixelBadge>
          )}
        </div>
      </header>

      {terminal && (
        <PixelPanel
          title="Resumo do run"
          titleAccent="var(--color-cyan-glow)"
          frameColor="var(--color-night-500)"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-dim">
              <span className="text-ink">{snapshot.task.title}</span> —{' '}
              {RUN_STATE_LABELS[snapshot.run.state].toLowerCase()} com {progress.verified} de{' '}
              {progress.total} etapas verificadas. As instâncias de agentes permanecem no
              histórico deste run.
            </p>
            <PixelButton
              variant="orch"
              onClick={() =>
                setComposer({ kind: 'new_task', continuedFromRunId: snapshot.run.id })
              }
            >
              Continuar a partir deste run
            </PixelButton>
          </div>
        </PixelPanel>
      )}

      {orchestrator && (
        <OrchestratorDesk
          orchestrator={orchestrator}
          profile={snapshot.profiles.find((p) => p.id === orchestrator.profileId)}
          task={snapshot.task}
          run={snapshot.run}
          steps={snapshot.steps}
          onSelect={setSelectedAgentId}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {[...squads.entries()].map(([squadId, members]) => (
          <SquadCard
            key={squadId}
            members={members}
            profile={snapshot.profiles.find((p) => p.id === members[0]?.profileId)}
            lastEvent={lastEvent}
            now={now}
            onSelect={setSelectedAgentId}
          />
        ))}
        {soloWorkers.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            profile={snapshot.profiles.find((p) => p.id === agent.profileId)}
            pendingQuestion={pendingQuestions.find((q) => q.agentId === agent.id)}
            lastEvent={lastEvent}
            now={now}
            onSelect={setSelectedAgentId}
            onOpenQuestion={(questionId) => openDecisionBox(questionId)}
          />
        ))}
      </div>

      <EventTicker events={snapshot.events} />

      {selectedAgentId && (
        <AgentDrawer
          snapshot={snapshot}
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
          onPauseAgent={(id) => void pauseAgent(id)}
          onResumeAgent={(id) => void resumeAgent(id)}
        />
      )}

      {decisionBoxOpen && (
        <DecisionBox
          questions={pendingQuestions}
          agents={snapshot.agents}
          initialQuestionId={decisionInitialId}
          onClose={() => setDecisionBoxOpen(false)}
          onSubmit={(inputs) => void answerQuestions(inputs)}
        />
      )}

      {composer && (
        <ComposerModal
          kind={composer.kind}
          agents={snapshot.agents}
          continuedFromRunId={composer.continuedFromRunId}
          codexAvailability={codexAvailability}
          codexCapabilities={codexCapabilities}
          onPickContext={(k) =>
            window.luthor?.codex?.pickContext(k) ?? Promise.resolve({ status: 'cancelled' as const })
          }
          onClose={() => setComposer(null)}
          onSubmitNewTask={(input) => void startNewTask(input)}
          onSubmitInstruction={(input) => void addUserDirection(input)}
        />
      )}
    </div>
  )
}
