import { useState } from 'react'
import type { Agent, ProviderCapabilities } from '@shared/domain'
import { AGENT_ROLE_LABELS } from '@shared/domain'
import type { NewTaskInput, PickContextResult, UserDirectionInput } from '@shared/ipc/contract'
import { Modal } from '@renderer/components/ui/Modal'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'

type ScopeType = UserDirectionInput['scopeType']
export type ComposerKind = 'new_task' | 'instruction'

interface ContextRef {
  relPath: string
  kind: 'file' | 'folder'
}

interface ComposerModalProps {
  kind: ComposerKind
  agents: Agent[]
  /** "Continuar a partir deste run": vínculo conceitual mockado. */
  continuedFromRunId?: string
  /** Executor real (Codex): disponível só quando a CLI está pronta. */
  codexAvailability?: { ok: boolean; reason?: string }
  /** Capacidades honestas do provider Codex (modelos/esforço/imagens…). */
  codexCapabilities?: ProviderCapabilities | null
  /** Picker de contexto no main (dialog nativo limitado ao workspace). */
  onPickContext?: (kind: 'file' | 'folder') => Promise<PickContextResult>
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
  codexAvailability,
  codexCapabilities,
  onPickContext,
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
  // Modelo só é selecionável quando a CLI enumera modelos de verdade.
  const [model, setModel] = useState('')
  const [contextRefs, setContextRefs] = useState<ContextRef[]>([])
  const [contextError, setContextError] = useState<string | null>(null)

  const isNewTask = kind === 'new_task'
  const title = isNewTask ? 'Nova tarefa' : 'Direcionar run'
  const canSubmit =
    text.trim().length >= 3 && (isNewTask || scopeType !== 'agent' || agentId.length > 0)

  const enumeratedModels = codexCapabilities?.availableModels ?? []
  const canSelectModel = enumeratedModels.length > 0

  const addContext = async (refKind: 'file' | 'folder'): Promise<void> => {
    setContextError(null)
    if (!onPickContext) return
    const result = await onPickContext(refKind)
    if (result.status === 'ok') {
      setContextRefs((refs) =>
        refs.some((r) => r.relPath === result.ref.relPath && r.kind === result.ref.kind)
          ? refs
          : [...refs, result.ref]
      )
    } else if (result.status === 'blocked') {
      setContextError(result.message)
    } else if (result.status === 'no_workspace') {
      setContextError(result.message)
    }
  }

  const removeContext = (ref: ContextRef): void => {
    setContextRefs((refs) => refs.filter((r) => !(r.relPath === ref.relPath && r.kind === ref.kind)))
  }

  const submit = (): void => {
    if (!canSubmit) return
    if (isNewTask) {
      onSubmitNewTask({
        text: text.trim(),
        mode,
        continuedFromRunId,
        codexModel: mode === 'codex' && canSelectModel && model ? model : undefined,
        contextRefs: mode === 'codex' && contextRefs.length > 0 ? contextRefs : undefined
      })
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
              Modo de execução
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'standard', label: 'Simulado: fluxo padrão', disabled: false },
                  {
                    id: 'squad_demo',
                    label: 'Simulado: corrigir cinco bugs (squad)',
                    disabled: false
                  },
                  {
                    id: 'codex',
                    label: 'EXECUTOR CODEX (real)',
                    disabled: !(codexAvailability?.ok ?? false)
                  }
                ] as const
              ).map((m) => (
                <label
                  key={m.id}
                  className={`pixel-frame flex items-center gap-2 px-3 py-1.5 text-xs ${
                    m.disabled
                      ? 'cursor-not-allowed text-ink-faint opacity-60 [--px-border:var(--color-night-600)]'
                      : mode === m.id
                        ? m.id === 'codex'
                          ? 'cursor-pointer bg-exec-soft text-exec [--px-border:var(--color-exec)]'
                          : 'cursor-pointer bg-orch-soft text-orch [--px-border:var(--color-orch)]'
                        : 'cursor-pointer text-ink-dim [--px-border:var(--color-night-500)] hover:text-ink'
                  }`}
                >
                  <input
                    type="radio"
                    name="composer-mode"
                    value={m.id}
                    checked={mode === m.id}
                    disabled={m.disabled}
                    onChange={() => setMode(m.id)}
                    className="accent-(--color-orch)"
                  />
                  {m.label}
                </label>
              ))}
            </div>
            {!codexAvailability?.ok && (
              <p className="mt-2 text-[11px] text-ink-faint">
                Executor real indisponível:{' '}
                {codexAvailability?.reason ?? 'verificando a CLI do Codex…'}
              </p>
            )}
            {mode === 'codex' && (
              <p className="mt-2 text-[11px] leading-relaxed text-warn">
                Modo REAL: o Codex CLI vai trabalhar de verdade dentro do workspace ativo
                (sandbox workspace-write). Nada fora da pasta é alterado sem confirmação da
                própria CLI.
              </p>
            )}
          </fieldset>
        )}

        {isNewTask && mode === 'codex' && (
          <fieldset className="space-y-3">
            <legend className="font-pixel mb-1 text-[10px] uppercase text-ink-faint">
              Perfil de execução (Codex)
            </legend>

            {/* Modelo: só oferecemos escolha quando a CLI enumera modelos.
                Codex atual não enumera → "Usar padrão da CLI". */}
            {canSelectModel ? (
              <label className="block">
                <span className="font-pixel mb-1 block text-[9px] uppercase text-ink-faint">
                  Modelo
                </span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="pixel-frame-inset w-full bg-night-950 px-3 py-2 text-sm text-ink"
                >
                  <option value="">Usar padrão da CLI</option>
                  {enumeratedModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="pixel-frame-inset bg-night-950 p-2 text-[11px] leading-relaxed text-ink-dim">
                <span className="font-pixel text-[9px] uppercase text-exec">Usar padrão da CLI</span>
                <br />
                Esta versão do Codex não expõe uma lista de modelos verificável, e o esforço não é
                configurável de forma confirmada — o run usa o padrão da CLI. O perfil exibido no
                run reflete a configuração efetiva.
              </div>
            )}

            {/* Contexto: @arquivo / @pasta limitados ao workspace. */}
            {codexCapabilities?.supportsFileReferences && (
              <div className="space-y-2">
                <span className="font-pixel block text-[9px] uppercase text-ink-faint">
                  Contexto (arquivos/pastas do workspace)
                </span>
                <div className="flex flex-wrap gap-2">
                  <PixelButton variant="ghost" onClick={() => void addContext('file')}>
                    + @arquivo
                  </PixelButton>
                  <PixelButton variant="ghost" onClick={() => void addContext('folder')}>
                    + @pasta
                  </PixelButton>
                </div>
                {contextError && (
                  <p className="pixel-frame-inset bg-night-950 p-2 text-[11px] text-alert">
                    {contextError}
                  </p>
                )}
                {contextRefs.length > 0 && (
                  <ul className="space-y-1">
                    {contextRefs.map((ref) => (
                      <li
                        key={`${ref.kind}:${ref.relPath}`}
                        className="pixel-frame flex items-center justify-between gap-2 px-2 py-1 text-xs [--px-border:var(--color-night-500)]"
                      >
                        <span className="font-logs truncate text-cyan-glow">
                          {ref.kind === 'folder' ? '@pasta' : '@arquivo'} {ref.relPath}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeContext(ref)}
                          aria-label={`Remover ${ref.relPath} do contexto`}
                          className="font-pixel shrink-0 cursor-pointer px-1 text-ink-faint hover:text-alert"
                        >
                          X
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] leading-relaxed text-ink-faint">
                  Só caminhos dentro do workspace; .env, chaves, .git, node_modules, binários e
                  arquivos grandes são bloqueados. O Codex decide o que abrir.
                </p>
              </div>
            )}

            {/* Imagens: detectado mas não suportado nesta fase. */}
            {codexCapabilities?.imageFlagDetected && !codexCapabilities.supportsImages && (
              <p className="pixel-frame-inset bg-night-950 p-2 text-[11px] leading-relaxed text-warn">
                Anexos de imagem: o executor atual ainda não confirmou suporte nesta fase — nada é
                aceito e descartado silenciosamente. Disponível numa fase futura.
              </p>
            )}
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
          {!isNewTask
            ? 'Registra apenas um evento simulado no run atual — nenhuma IA real é chamada.'
            : mode === 'codex'
              ? 'Cria um run REAL no workspace ativo, executado pelo Codex CLI da sua máquina.'
              : 'Cria um novo run simulado no workspace ativo — nenhuma IA real é chamada.'}
        </p>

        <div className="flex justify-end gap-2">
          <PixelButton variant="ghost" onClick={onClose}>
            Cancelar
          </PixelButton>
          <PixelButton
            variant={isNewTask && mode === 'codex' ? 'primary' : 'orch'}
            type="submit"
            disabled={!canSubmit}
          >
            {!isNewTask ? 'Registrar instrução' : mode === 'codex' ? 'Executar de verdade' : 'Criar run'}
          </PixelButton>
        </div>
      </form>
    </Modal>
  )
}
