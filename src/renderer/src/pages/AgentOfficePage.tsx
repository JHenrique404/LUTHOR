import { useState } from 'react'
import { RUN_STATE_LABELS } from '@shared/domain'
import { isTerminal } from '@shared/state-machine/run-state'
import type { UserDirectionInput } from '@shared/ipc/contract'
import { useRunStore } from '@renderer/stores/run-store'
import { useNow } from '@renderer/lib/use-now'
import { RUN_STATE_STYLE } from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { StatusDot } from '@renderer/components/ui/StatusDot'
import { OrchestratorDesk } from '@renderer/components/office/OrchestratorDesk'
import { AgentCard } from '@renderer/components/office/AgentCard'
import { AgentDrawer } from '@renderer/components/office/AgentDrawer'
import { DecisionBox } from '@renderer/components/office/DecisionBox'
import { ComposerModal } from '@renderer/components/office/ComposerModal'
import { EventTicker } from '@renderer/components/office/EventTicker'

/** Agent Office: painel principal vivo com o run demo simulado. */
export function AgentOfficePage(): React.JSX.Element {
  const {
    snapshot,
    lastEvent,
    pauseAll,
    resumeAll,
    pauseAgent,
    resumeAgent,
    answerQuestions,
    addUserDirection
  } = useRunStore()
  const now = useNow(1000)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [decisionBoxOpen, setDecisionBoxOpen] = useState(false)
  const [decisionInitialId, setDecisionInitialId] = useState<string | null>(null)
  const [composerKind, setComposerKind] = useState<UserDirectionInput['kind'] | null>(null)

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-pixel anim-pulse text-xs text-ink-dim">Carregando central…</p>
      </div>
    )
  }

  const orchestrator = snapshot.agents.find((a) => a.role === 'orchestrator')
  const workers = snapshot.agents.filter((a) => a.role !== 'orchestrator')
  const paused = snapshot.run.state === 'paused'
  const terminal = isTerminal(snapshot.run.state)
  const runStyle = RUN_STATE_STYLE[snapshot.run.state]
  const pendingQuestions = snapshot.questions.filter((q) => q.status === 'pending')

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
            workspace ativo: <span className="text-ink-dim">{snapshot.workspace.name}</span> · run{' '}
            <span className="font-logs">{snapshot.run.id}</span> ·{' '}
            <span className="text-warn">dados simulados</span> · Fase 1: um run por vez
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
          {!terminal && (
            <>
              <PixelButton variant="orch" onClick={() => setComposerKind('new_task')}>
                Nova tarefa
              </PixelButton>
              <PixelButton variant="orch" onClick={() => setComposerKind('instruction')}>
                + Instrução
              </PixelButton>
              <PixelButton
                variant={paused ? 'primary' : 'danger'}
                onClick={() => void (paused ? resumeAll() : pauseAll())}
              >
                {paused ? 'Retomar' : 'Pausar tudo'}
              </PixelButton>
            </>
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
        {workers.map((agent) => (
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

      {composerKind && (
        <ComposerModal
          kind={composerKind}
          agents={snapshot.agents}
          onClose={() => setComposerKind(null)}
          onSubmit={(input) => void addUserDirection(input)}
        />
      )}
    </div>
  )
}
