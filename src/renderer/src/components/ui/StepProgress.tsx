import type { PlanStep } from '@shared/domain'
import { verifiedProgress } from '@shared/domain'
import { STEP_STATUS_STYLE } from '@renderer/lib/state-ui'

interface StepProgressProps {
  steps: PlanStep[]
}

/**
 * Progresso derivado dos steps: "3 de 5 etapas verificadas".
 * Nunca mostra porcentagem inventada.
 */
export function StepProgress({ steps }: StepProgressProps): React.JSX.Element {
  const { verified, total } = verifiedProgress(steps)
  const sorted = [...steps].sort((a, b) => a.index - b.index)
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1" aria-hidden="true">
        {sorted.map((step) => {
          const style = STEP_STATUS_STYLE[step.status]
          return (
            <span
              key={step.id}
              title={`${step.index}. ${step.title}`}
              className={`inline-block h-3 w-5 ${step.status === 'verified' ? style.dot : `${style.dot} opacity-40`} ${style.anim}`}
            />
          )
        })}
      </div>
      <span className="font-pixel text-exec text-[11px]">
        {verified} de {total} etapas verificadas
      </span>
    </div>
  )
}
