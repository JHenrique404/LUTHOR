import type { PlanStep } from '@shared/domain'

interface RunProgressSummaryProps {
  steps: PlanStep[]
}

type AggBlock = 'verified' | 'active' | 'neutral'

/**
 * RESUMO AGREGADO do avanço do run (barra superior do Agent Office).
 *
 * Diferente do StepProgress (mapa 1:1 das etapas, usado onde a ORDEM importa),
 * aqui o avanço é apresentado de forma contínua: N etapas verificadas = N
 * primeiros blocos verdes, da esquerda para a direita — mesmo que a etapa
 * verificada seja a #5. Os números NUNCA são falsificados: contagens e texto
 * vêm direto dos steps; só a disposição é agregada.
 *
 * No máximo UM indicador ciano (trabalho em andamento) após os verdes; nunca
 * parece etapa concluída.
 */
export function RunProgressSummary({ steps }: RunProgressSummaryProps): React.JSX.Element {
  const total = steps.length
  const verified = steps.filter((s) => s.status === 'verified').length
  const inProgress = steps.filter((s) => s.status === 'in_progress').length
  const queued = steps.filter((s) => s.status === 'pending').length
  const failed = steps.filter((s) => s.status === 'failed').length

  const blocks: AggBlock[] = Array.from({ length: total }, (_, i) => {
    if (i < verified) return 'verified'
    if (i === verified && inProgress > 0) return 'active'
    return 'neutral'
  })

  const label = [
    `${verified} de ${total} etapas verificadas`,
    inProgress > 0 ? `${inProgress} em execução` : null,
    queued > 0 ? `${queued} na fila` : null,
    failed > 0 ? `${failed} ${failed === 1 ? 'falhou' : 'falharam'}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  const BLOCK_CLASS: Record<AggBlock, string> = {
    verified: 'bg-exec',
    active: 'border-2 border-cyan-glow bg-night-700',
    neutral: 'bg-night-600'
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div role="img" aria-label={label} className="flex items-center gap-1">
        {blocks.map((block, i) => (
          <span
            key={i}
            data-agg-block={block}
            className={`inline-block h-3 w-5 ${BLOCK_CLASS[block]}`}
          />
        ))}
      </div>
      <span className="font-pixel text-exec text-[11px]" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}
