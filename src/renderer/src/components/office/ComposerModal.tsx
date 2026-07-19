import { useState } from 'react'
import type { Agent } from '@shared/domain'
import { AGENT_ROLE_LABELS } from '@shared/domain'
import type { UserDirectionInput } from '@shared/ipc/contract'
import { Modal } from '@renderer/components/ui/Modal'
import { PixelButton } from '@renderer/components/ui/PixelButton'

type ScopeType = UserDirectionInput['scopeType']

interface ComposerModalProps {
  kind: UserDirectionInput['kind']
  agents: Agent[]
  onClose: () => void
  onSubmit: (input: UserDirectionInput) => void
}

const SCOPES: Array<{ id: ScopeType; label: string }> = [
  { id: 'orchestrator', label: 'Orquestrador' },
  { id: 'all', label: 'Todos os agentes' },
  { id: 'agent', label: 'Agente específico' }
]

/**
 * Composer do orquestrador (Fase 1): registra a direção como evento simulado
 * no feed. Na Fase 2 vira contexto real para o orquestrador.
 */
export function ComposerModal({
  kind,
  agents,
  onClose,
  onSubmit
}: ComposerModalProps): React.JSX.Element {
  const [scopeType, setScopeType] = useState<ScopeType>('orchestrator')
  const workers = agents.filter((a) => a.role !== 'orchestrator')
  const [agentId, setAgentId] = useState(workers[0]?.id ?? '')
  const [text, setText] = useState('')

  const title = kind === 'new_task' ? 'Nova tarefa' : 'Adicionar instrução ao run'
  const canSubmit = text.trim().length >= 3 && (scopeType !== 'agent' || agentId.length > 0)

  const submit = (): void => {
    if (!canSubmit) return
    onSubmit({
      kind,
      scopeType,
      agentId: scopeType === 'agent' ? agentId : undefined,
      text: text.trim()
    })
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

        {scopeType === 'agent' && (
          <label className="block">
            <span className="font-pixel mb-1 block text-[10px] uppercase text-ink-faint">
              Agente
            </span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="pixel-frame-inset w-full bg-night-950 px-3 py-2 text-sm text-ink"
            >
              {workers.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {AGENT_ROLE_LABELS[agent.role]} — {agent.subtask}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="font-pixel mb-1 block text-[10px] uppercase text-ink-faint">
            {kind === 'new_task' ? 'Descreva a tarefa' : 'Instrução'}
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={
              kind === 'new_task'
                ? 'Ex.: Adicionar logout em todas as sessões ativas…'
                : 'Ex.: Priorize cobertura de testes no middleware…'
            }
            className="pixel-frame-inset w-full resize-none bg-night-950 p-3 text-sm text-ink placeholder:text-ink-faint"
          />
        </label>

        <p className="text-[11px] text-ink-faint">
          Fase 1: registra apenas um evento simulado no feed — nenhuma IA real é chamada.
        </p>

        <div className="flex justify-end gap-2">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancelar
          </PixelButton>
          <PixelButton variant="orch" type="submit" disabled={!canSubmit}>
            Registrar
          </PixelButton>
        </div>
      </form>
    </Modal>
  )
}
