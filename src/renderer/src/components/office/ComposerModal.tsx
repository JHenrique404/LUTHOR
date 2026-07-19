import { useState } from 'react'
import type { Agent } from '@shared/domain'
import { AGENT_ROLE_LABELS } from '@shared/domain'
import type { NewTaskInput, UserDirectionInput } from '@shared/ipc/contract'
import { Modal } from '@renderer/components/ui/Modal'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'

type ScopeType = UserDirectionInput['scopeType']
export type ComposerKind = 'new_task' | 'instruction'

interface ComposerModalProps {
  kind: ComposerKind
  agents: Agent[]
  /** "Continuar a partir deste run": vínculo conceitual mockado. */
  continuedFromRunId?: string
  onClose: () => void
  onSubmitNewTask: (input: NewTaskInput) => void
  onSubmitInstruction: (input: UserDirectionInput) => void
}

const SCOPES: Array<{ id: ScopeType; label: string }> = [
  { id: 'orchestrator', label: 'Orquestrador' },
  { id: 'all', label: 'Todos os agentes' },
  { id: 'agent', label: 'Agente específico' }
]

/** Instâncias concluídas/falhadas ficam no histórico — não recebem instruções. */
const DIRECTABLE_STATES = [
  'planning',
  'waiting',
  'executing',
  'verifying',
  'question_pending',
  'paused'
]

/**
 * Composer do orquestrador (Fase 1, tudo simulado):
 * - "Nova tarefa" cria um NOVO run no workspace ativo (fluxo padrão ou demo squad).
 * - "Direcionar run" registra instrução no run ATUAL, sem criar run novo.
 */
export function ComposerModal({
  kind,
  agents,
  continuedFromRunId,
  onClose,
  onSubmitNewTask,
  onSubmitInstruction
}: ComposerModalProps): React.JSX.Element {
  const [scopeType, setScopeType] = useState<ScopeType>('orchestrator')
  const directableWorkers = agents.filter(
    (a) => a.role !== 'orchestrator' && DIRECTABLE_STATES.includes(a.state)
  )
  const [agentId, setAgentId] = useState(directableWorkers[0]?.id ?? '')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<NewTaskInput['mode']>('standard')

  const isNewTask = kind === 'new_task'
  const title = isNewTask ? 'Nova tarefa' : 'Direcionar run'
  const canSubmit =
    text.trim().length >= 3 && (isNewTask || scopeType !== 'agent' || agentId.length > 0)

  const submit = (): void => {
    if (!canSubmit) return
    if (isNewTask) {
      onSubmitNewTask({ text: text.trim(), mode, continuedFromRunId })
    } else {
      onSubmitInstruction({
        kind: 'instruction',
        scopeType,
        agentId: scopeType === 'agent' ? agentId : undefined,
        text: text.trim()
      })
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-4"
      >
        {isNewTask && continuedFromRunId && (
          <PixelBadge className="bg-orch-soft text-orch" title="Contexto simulado do run anterior">
            continuação de {continuedFromRunId}
          </PixelBadge>
        )}

        {isNewTask && (
          <fieldset>
            <legend className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">
              Modo de simulação
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'standard', label: 'Fluxo padrão' },
                  { id: 'squad_demo', label: 'Demo: corrigir cinco bugs (squad)' }
                ] as const
              ).map((m) => (
                <label
                  key={m.id}
                  className={`pixel-frame flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${
                    mode === m.id
                      ? 'bg-orch-soft text-orch [--px-border:var(--color-orch)]'
                      : 'text-ink-dim [--px-border:var(--color-night-500)] hover:text-ink'
                  }`}
                >
                  <input
                    type="radio"
                    name="composer-mode"
                    value={m.id}
                    checked={mode === m.id}
                    onChange={() => setMode(m.id)}
                    className="accent-(--color-orch)"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!isNewTask && (
          <fieldset>
            <legend className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">Escopo</legend>
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((scope) => (
                <label
                  key={scope.id}
                  className={`pixel-frame flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${
                    scopeType === scope.id
                      ? 'bg-orch-soft text-orch [--px-border:var(--color-orch)]'
                      : 'text-ink-dim [--px-border:var(--color-night-500)] hover:text-ink'
                  }`}
                >
                  <input
                    type="radio"
                    name="composer-scope"
                    value={scope.id}
                    checked={scopeType === scope.id}
                    onChange={() => setScopeType(scope.id)}
                    className="accent-(--color-orch)"
                  />
                  {scope.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!isNewTask && scopeType === 'agent' && (
          <label className="block">
            <span className="font-pixel mb-1 block text-[10px] uppercase text-ink-faint">
              Agente (instâncias ativas deste run)
            </span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="pixel-frame-inset w-full bg-night-950 px-3 py-2 text-sm text-ink"
            >
              {directableWorkers.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {AGENT_ROLE_LABELS[agent.role]} · {agent.name} — {agent.subtask}
                </option>
              ))}
            </select>
            {directableWorkers.length === 0 && (
              <p className="mt-1 text-[11px] text-ink-faint">
                Nenhuma instância ativa. Agentes concluídos ficam no histórico — use “Nova
                tarefa” para o orquestrador criar novas instâncias.
              </p>
            )}
          </label>
        )}

        <label className="block">
          <span className="font-pixel mb-1 block text-[10px] uppercase text-ink-faint">
            {isNewTask ? 'Descreva a tarefa' : 'Instrução para o run atual'}
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={
              isNewTask
                ? 'Ex.: Adicionar logout em todas as sessões ativas…'
                : 'Ex.: Priorize cobertura de testes no middleware…'
            }
            className="pixel-frame-inset w-full resize-none bg-night-950 p-3 text-sm text-ink placeholder:text-ink-faint"
          />
        </label>

        <p className="text-[11px] text-ink-faint">
          {isNewTask
            ? 'Fase 1: cria um novo run simulado no workspace ativo — nenhuma IA real é chamada.'
            : 'Fase 1: registra apenas um evento simulado no run atual — nenhuma IA real é chamada.'}
        </p>

        <div className="flex justify-end gap-2">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancelar
          </PixelButton>
          <PixelButton variant="orch" type="submit" disabled={!canSubmit}>
            {isNewTask ? 'Criar run' : 'Registrar instrução'}
          </PixelButton>
        </div>
      </form>
    </Modal>
  )
}
