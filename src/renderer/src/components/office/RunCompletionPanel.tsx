import type { RunSnapshot } from '@shared/domain'
import { RUN_STATE_LABELS } from '@shared/domain'
import { RUN_STATE_STYLE, formatDuration } from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'
import { StatusDot } from '@renderer/components/ui/StatusDot'

interface RunCompletionPanelProps {
  snapshot: RunSnapshot
  onViewResult: () => void
  onNewTask: () => void
  /** Recuperação: abrir Nova tarefa preenchida com a pergunta/resposta final. */
  onAnswerAndContinue: () => void
}

const PREVIEW_MAX = 320

/**
 * Painel COMPACTO de conclusão do run real, logo abaixo da mesa do orquestrador.
 * Mostra estado, duração congelada e o começo da resposta — NÃO duplica o texto
 * completo (a aba Resultado é a fonte auditável).
 */
export function RunCompletionPanel({
  snapshot,
  onViewResult,
  onNewTask,
  onAnswerAndContinue
}: RunCompletionPanelProps): React.JSX.Element {
  const { run, result } = snapshot
  const style = RUN_STATE_STYLE[run.state]
  const finalMessage = result?.finalMessage ?? null
  const preview =
    finalMessage && finalMessage.length > PREVIEW_MAX
      ? `${finalMessage.slice(0, PREVIEW_MAX).trimEnd()}…`
      : finalMessage
  // Heurística só para OFERECER recuperação (não altera estado): resposta
  // termina com "?" — pode ter sido uma pergunta não estruturada.
  const looksLikeQuestion = !!finalMessage && /\?\s*$/.test(finalMessage.trim())

  return (
    <PixelPanel title="Conclusão do run real" titleAccent="var(--color-exec)" frameColor="var(--color-exec)">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PixelBadge className={`${style.bg} ${style.text}`}>
            <StatusDot colorClass={style.dot} />
            {RUN_STATE_LABELS[run.state]}
          </PixelBadge>
          <PixelBadge className="bg-night-700 text-ink-dim" title="Duração final congelada">
            duração {formatDuration(run.startedAt, run.finishedAt, true)}
          </PixelBadge>
          {result?.cliVersion && (
            <PixelBadge className="bg-night-700 text-ink-faint">{result.cliVersion}</PixelBadge>
          )}
        </div>

        {preview ? (
          <p className="pixel-frame-inset bg-night-950 p-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-dim">
            {preview}
          </p>
        ) : (
          <p className="text-sm text-ink-faint">
            A CLI não emitiu uma resposta final estruturada para este run.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <PixelButton variant="primary" onClick={onViewResult}>
            Ver resultado completo
          </PixelButton>
          <PixelButton variant="orch" onClick={onNewTask}>
            Nova tarefa
          </PixelButton>
          {looksLikeQuestion && (
            <PixelButton
              variant="warn"
              onClick={onAnswerAndContinue}
              title="Abre Nova tarefa preenchida — o processo original NÃO será retomado"
            >
              Responder e continuar deste resultado
            </PixelButton>
          )}
        </div>
      </div>
    </PixelPanel>
  )
}
