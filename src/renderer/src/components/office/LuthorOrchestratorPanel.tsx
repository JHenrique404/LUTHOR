import type { RunSnapshot } from '@shared/domain'
import { executionSummary } from '@shared/domain'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

interface LuthorOrchestratorPanelProps {
  snapshot: RunSnapshot
}

/**
 * Orquestrador LUTHOR: camada LOCAL de controle e encaminhamento visual —
 * SEM IA própria nesta fase. Não é um agente Opus/Claude falso.
 * Mostra progresso de EXECUÇÃO real honesto (nunca "0 de 0 etapas verificadas"
 * quando o Codex não produziu um plano de etapas).
 */
export function LuthorOrchestratorPanel({
  snapshot
}: LuthorOrchestratorPanelProps): React.JSX.Element {
  const workers = snapshot.agents.filter((a) => a.role !== 'orchestrator')
  const summary = executionSummary(workers)

  const chips = [
    { n: summary.running, label: summary.running === 1 ? 'execução em andamento' : 'execuções em andamento', cls: 'bg-exec-soft text-exec' },
    { n: summary.awaiting, label: 'aguardando resposta', cls: 'bg-warn-soft text-warn' },
    { n: summary.completed, label: summary.completed === 1 ? 'execução concluída' : 'execuções concluídas', cls: 'bg-night-700 text-ink-dim' },
    { n: summary.failed, label: 'com falha', cls: 'bg-alert-soft text-alert' }
  ].filter((c) => c.n > 0)

  return (
    <PixelPanel
      title="Orquestrador LUTHOR"
      titleAccent="var(--color-orch)"
      frameColor="var(--color-orch)"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink">{snapshot.task.title}</p>
          <p className="mt-1 text-[11px] text-ink-faint">
            Camada local de controle e encaminhamento ·{' '}
            <span className="text-warn">sem IA própria nesta fase</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Progresso de execução real">
          {chips.length > 0 ? (
            chips.map((c) => (
              <PixelBadge key={c.label} className={c.cls}>
                {c.n} {c.label}
              </PixelBadge>
            ))
          ) : (
            <PixelBadge className="bg-night-700 text-ink-faint">preparando execução…</PixelBadge>
          )}
        </div>
      </div>
    </PixelPanel>
  )
}
