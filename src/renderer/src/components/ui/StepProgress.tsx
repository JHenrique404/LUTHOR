import type { PlanStep, StepStatus } from '@shared/domain'
import { STEP_STATUS_LABELS, verifiedProgress } from '@shared/domain'

interface StepProgressProps {
  steps: PlanStep[]
}

/**
 * Cor de cada bloco derivada EXCLUSIVAMENTE do status real da etapa:
 * - verified: cor de sucesso (verde), sem animação
 * - in_progress: ciano vazado (borda), claramente distinto de sucesso
 * - pending: neutro escuro
 * - failed: coral
 * Nada de nth-child, animação decorativa ou estado visual residual.
 */
const BLOCK_CLASS: Record<StepStatus, string> = {
  verified: 'bg-exec',
  in_progress: 'border-2 border-cyan-glow bg-night-700',
  pending: 'bg-night-600',
  failed: 'bg-alert'
}

/**
 * Progresso derivado dos steps: "3 de 5 etapas verificadas".
 * Nunca mostra porcentagem inventada.
 */
export function StepProgress({ steps }: StepProgressProps): React.JSX.Element {
  const { verified, total } = verifiedProgress(steps)
  const sorted = [...steps].sort((a, b) => a.index - b.index)
  const label = `${verified} de ${total} etapas verificadas`

  return (
    <div className="flex items-center gap-3">
      <div role="img" aria-label={label} className="flex items-center gap-1">
        {sorted.map((step) => (
          <span
            key={step.id}
            data-step-status={step.status}
            title={`${step.index}. ${step.title} — ${STEP_STATUS_LABELS[step.status]}`}
            className={`inline-block h-3 w-5 ${BLOCK_CLASS[step.status]}`}
          />
        ))}
      </div>
      <span className="font-pixel text-exec text-[11px]" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}
