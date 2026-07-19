import { useEffect, useState } from 'react'
import type { Agent, Question } from '@shared/domain'
import { AGENT_ROLE_LABELS } from '@shared/domain'
import type { AnswerQuestionInput } from '@shared/ipc/contract'
import { Modal } from '@renderer/components/ui/Modal'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'

interface Draft {
  optionId?: string
  freeText: string
}

interface DecisionBoxProps {
  /** Perguntas pendentes de todos os agentes. */
  questions: Question[]
  agents: Agent[]
  initialQuestionId?: string | null
  onClose: () => void
  onSubmit: (inputs: AnswerQuestionInput[]) => void
}

function draftToInput(questionId: string, draft: Draft | undefined): AnswerQuestionInput | null {
  if (!draft) return null
  const freeText = draft.freeText.trim()
  if (!draft.optionId && freeText.length === 0) return null
  return {
    questionId,
    optionId: draft.optionId,
    freeText: freeText.length > 0 ? freeText : undefined
  }
}

/**
 * Caixa de Decisões: consolida as perguntas pendentes de todos os agentes.
 * Rascunhos por pergunta; envio em lote ("Enviar N respostas").
 */
export function DecisionBox({
  questions,
  agents,
  initialQuestionId,
  onClose,
  onSubmit
}: DecisionBoxProps): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [selectedId, setSelectedId] = useState<string | null>(initialQuestionId ?? null)

  // Seleção segue a lista: pergunta respondida some, seleciona a próxima.
  const selected = questions.find((q) => q.id === selectedId) ?? questions[0] ?? null
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  const readyInputs = questions
    .map((q) => draftToInput(q.id, drafts[q.id]))
    .filter((i): i is AnswerQuestionInput => i !== null)

  const setDraft = (questionId: string, patch: Partial<Draft>): void => {
    setDrafts((d) => {
      const prev = d[questionId] ?? { freeText: '' }
      return { ...d, [questionId]: { ...prev, ...patch } }
    })
  }

  const agentOf = (q: Question): Agent | undefined => agents.find((a) => a.id === q.agentId)
  const draft = selected ? (drafts[selected.id] ?? { freeText: '' }) : { freeText: '' }

  const submit = (): void => {
    if (readyInputs.length === 0) return
    onSubmit(readyInputs)
    setDrafts({})
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Caixa de Decisões — ${questions.length} pendente(s)`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-faint">
            Rascunhos ficam salvos ao navegar entre perguntas.
          </p>
          <div className="flex gap-2">
            <PixelButton variant="ghost" onClick={onClose}>
              Depois
            </PixelButton>
            <PixelButton variant="warn" onClick={submit} disabled={readyInputs.length === 0}>
              Enviar {readyInputs.length} resposta{readyInputs.length === 1 ? '' : 's'}
            </PixelButton>
          </div>
        </div>
      }
    >
      {questions.length === 0 ? (
        <p className="text-sm text-ink-dim">Nenhuma pergunta pendente. Os agentes seguem trabalhando.</p>
      ) : (
        <div className="flex gap-4">
          <nav aria-label="Perguntas pendentes" className="w-44 shrink-0 space-y-1">
            {questions.map((q) => {
              const agent = agentOf(q)
              const hasDraft = draftToInput(q.id, drafts[q.id]) !== null
              const isSelected = selected?.id === q.id
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedId(q.id)}
                  aria-current={isSelected}
                  className={`pixel-frame block w-full cursor-pointer px-2 py-2 text-left ${
                    isSelected
                      ? 'bg-warn-soft [--px-border:var(--color-warn)]'
                      : 'bg-night-800 [--px-border:var(--color-night-500)] hover:[--px-border:var(--color-warn)]'
                  }`}
                >
                  <span className="font-pixel block text-[9px] uppercase text-warn">
                    {agent ? AGENT_ROLE_LABELS[agent.role] : 'agente'}
                    {hasDraft && <span className="text-exec"> · rascunho</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] text-ink-dim">{q.text}</span>
                </button>
              )
            })}
          </nav>

          {selected && (
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <PixelBadge className="bg-warn-soft text-warn">
                  {agentOf(selected) ? AGENT_ROLE_LABELS[agentOf(selected)!.role] : 'agente'}
                </PixelBadge>
                <p className="mt-2 text-sm leading-relaxed text-ink">{selected.text}</p>
              </div>

              <fieldset className="space-y-2">
                <legend className="font-pixel mb-1 text-[10px] uppercase text-ink-faint">
                  Opções
                </legend>
                {selected.options.map((option) => (
                  <label
                    key={option.id}
                    className={`pixel-frame flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${
                      draft.optionId === option.id
                        ? 'bg-warn-soft text-warn [--px-border:var(--color-warn)]'
                        : 'text-ink-dim [--px-border:var(--color-night-500)] hover:text-ink'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`decision-${selected.id}`}
                      value={option.id}
                      checked={draft.optionId === option.id}
                      onChange={() => setDraft(selected.id, { optionId: option.id })}
                      className="accent-(--color-warn)"
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>

              {selected.allowFreeText && (
                <div>
                  <label
                    htmlFor={`decision-free-${selected.id}`}
                    className="font-pixel mb-1 block text-[10px] uppercase text-ink-faint"
                  >
                    Ou responda com suas palavras
                  </label>
                  <textarea
                    id={`decision-free-${selected.id}`}
                    value={draft.freeText}
                    onChange={(e) => setDraft(selected.id, { freeText: e.target.value })}
                    rows={3}
                    placeholder="Resposta livre (opcional)…"
                    className="pixel-frame-inset w-full resize-none bg-night-950 p-3 text-sm text-ink placeholder:text-ink-faint"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </Modal>
  )
}
