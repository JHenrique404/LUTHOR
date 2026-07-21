import { useEffect, useRef, useState } from 'react'
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
  /** "Continuar a partir deste run": vínculo conceitual (prefill, sem memória oculta). */
  continuedFromRunId?: string
  /** Texto pré-preenchido (ex.: "Responder e continuar deste resultado"). */
  prefillText?: string
  /** Executor real (Codex): disponível só quando a CLI está pronta. */
  codexAvailability?: { ok: boolean; reason?: string }
  /** Capacidades honestas do provider Codex (modelos/esforço/imagens…). */
  codexCapabilities?: ProviderCapabilities | null
  /** Picker de contexto no main (dialog nativo limitado ao workspace). */
  onPickContext?: (kind: 'file' | 'folder') => Promise<PickContextResult>
  /** Autocomplete `@`: sugestões sob demanda dentro do workspace ativo. */
  onSuggestContext?: (query: string) => Promise<ContextRef[]>
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
 * Composer: "Nova tarefa" cria um NOVO run (simulado ou executor real Codex);
 * "Direcionar run" registra instrução no run atual (simulado).
 */
export function ComposerModal({
  kind,
  agents,
  continuedFromRunId,
  prefillText,
  codexAvailability,
  codexCapabilities,
  onPickContext,
  onSuggestContext,
  onClose,
  onSubmitNewTask,
  onSubmitInstruction
}: ComposerModalProps): React.JSX.Element {
  const [scopeType, setScopeType] = useState<ScopeType>('orchestrator')
  const directableWorkers = agents.filter(
    (a) => a.role !== 'orchestrator' && DIRECTABLE_STATES.includes(a.state)
  )
  const [agentId, setAgentId] = useState(directableWorkers[0]?.id ?? '')
  const [text, setText] = useState(prefillText ?? '')
  const [mode, setMode] = useState<NewTaskInput['mode']>('standard')
  // Modelo só é selecionável quando a CLI enumera modelos de verdade.
  const [model, setModel] = useState('')
  const [contextRefs, setContextRefs] = useState<ContextRef[]>([])
  const [contextError, setContextError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<ContextRef[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [imageWarning, setImageWarning] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isNewTask = kind === 'new_task'
  const title = isNewTask ? 'Nova tarefa' : 'Direcionar run'
  const canSubmit =
    text.trim().length >= 3 && (isNewTask || scopeType !== 'agent' || agentId.length > 0)

  const enumeratedModels = codexCapabilities?.availableModels ?? []
  const canSelectModel = enumeratedModels.length > 0
  const IMAGE_NOTICE =
    'Imagens ainda não são suportadas pelo executor Codex desta fase. Nada será enviado ou descartado silenciosamente.'

  const addRef = (ref: ContextRef): void => {
    setContextRefs((refs) =>
      refs.some((r) => r.relPath === ref.relPath && r.kind === ref.kind) ? refs : [...refs, ref]
    )
  }

  const addContext = async (refKind: 'file' | 'folder'): Promise<void> => {
    setContextError(null)
    if (!onPickContext) return
    const result = await onPickContext(refKind)
    if (result.status === 'ok') addRef(result.ref)
    else if (result.status === 'blocked' || result.status === 'no_workspace')
      setContextError(result.message)
  }

  const removeContext = (ref: ContextRef): void => {
    setContextRefs((refs) => refs.filter((r) => !(r.relPath === ref.relPath && r.kind === ref.kind)))
  }

  /** Token `@…` ativo no fim do texto (sem espaço). null se não houver. */
  const activeAtToken = (value: string): string | null => {
    const m = /(?:^|\s)@([^\s@]*)$/.exec(value)
    return m ? m[1] : null
  }

  const onTextChange = async (value: string): Promise<void> => {
    // Atalhos locais do composer (NÃO comandos do provider): /arquivo /pasta.
    const slash = /(?:^|\s)(\/arquivo|\/pasta)\s$/.exec(value)
    if (slash) {
      const stripped = value.replace(/(\/arquivo|\/pasta)\s$/, '').trimEnd()
      setText(stripped)
      await addContext(slash[1] === '/pasta' ? 'folder' : 'file')
      return
    }
    setText(value)
    // Autocomplete `@`: só com executor Codex e capacidade de referências.
    if (isNewTask && mode === 'codex' && onSuggestContext) {
      const token = activeAtToken(value)
      if (token !== null) {
        const list = await onSuggestContext(token)
        setSuggestions(list.slice(0, 20))
        setSuggestOpen(true)
        return
      }
    }
    setSuggestOpen(false)
  }

  /** Insere a referência escolhida e remove o token `@…` do texto. */
  const chooseSuggestion = (ref: ContextRef): void => {
    addRef(ref)
    setText((v) => v.replace(/(?:^|\s)@([^\s@]*)$/, (match) => (/^\s/.test(match) ? match[0] : '')))
    setSuggestOpen(false)
    textareaRef.current?.focus()
  }

  const showImageNotice = (): void => setImageWarning(IMAGE_NOTICE)

  useEffect(() => {
    if (prefillText) textareaRef.current?.focus()
  }, [prefillText])

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
          <PixelBadge className="bg-orch-soft text-orch" title="Vínculo conceitual — sem memória automática">
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
          </fieldset>
        )}

        {isNewTask && mode === 'codex' && (
          <fieldset className="space-y-3">
            <legend className="font-pixel mb-1 text-[10px] uppercase text-ink-faint">
              Executor de execução real
            </legend>

            {/* Resumo honesto do que será usado — sem opções inexistentes. */}
            <dl className="pixel-frame-inset space-y-1 bg-night-950 p-3 text-[11px] [--px-border:var(--color-exec)]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint">Executor</dt>
                <dd className="font-pixel text-exec">Codex CLI</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint">Modelo</dt>
                <dd className="text-ink-dim">
                  {canSelectModel ? 'selecionável abaixo' : 'padrão da CLI'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint">Esforço</dt>
                <dd className="text-ink-dim">não configurável nesta versão detectada</dd>
              </div>
            </dl>
            <p className="text-[10px] leading-relaxed text-ink-faint">
              Novos provedores e orquestração chegam na Fase 2C.
            </p>

            {canSelectModel && (
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
                  <ul className="flex flex-wrap gap-1">
                    {contextRefs.map((ref) => (
                      <li
                        key={`${ref.kind}:${ref.relPath}`}
                        className="pixel-frame flex items-center gap-1 px-2 py-1 text-xs [--px-border:var(--color-cyan-glow)]"
                      >
                        <span className="font-logs truncate text-cyan-glow">
                          {`@${ref.relPath}`}
                          <span className="ml-1 text-[9px] text-ink-faint">
                            {ref.kind === 'folder' ? 'pasta' : 'arquivo'}
                          </span>
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
                  Digite <code className="text-ink-dim">@</code> para buscar,{' '}
                  <code className="text-ink-dim">/arquivo</code> ou{' '}
                  <code className="text-ink-dim">/pasta</code> para o seletor nativo. Só itens
                  escolhidos viram referência — caminho digitado à mão não anexa nada. .env, chaves,
                  .git, node_modules, binários e arquivos grandes são bloqueados.
                </p>
              </div>
            )}

            {/* Imagens: controle desabilitado + aviso honesto. */}
            <div className="space-y-1">
              <PixelButton
                variant="ghost"
                disabled
                aria-disabled="true"
                title={IMAGE_NOTICE}
                onClick={showImageNotice}
              >
                Anexar imagem (indisponível)
              </PixelButton>
              <p aria-live="polite" className="text-[10px] leading-relaxed text-warn">
                {imageWarning ?? IMAGE_NOTICE}
              </p>
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

        <div className="relative">
          <label className="block">
            <span className="font-pixel mb-1 block text-[10px] uppercase text-ink-faint">
              {isNewTask ? 'Descreva a tarefa' : 'Instrução para o run atual'}
            </span>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => void onTextChange(e.target.value)}
              onPaste={(e) => {
                if (Array.from(e.clipboardData.items).some((i) => i.type.startsWith('image/'))) {
                  e.preventDefault()
                  showImageNotice()
                }
              }}
              onDrop={(e) => {
                if (Array.from(e.dataTransfer.files).some((f) => f.type.startsWith('image/'))) {
                  e.preventDefault()
                  showImageNotice()
                }
              }}
              rows={4}
              placeholder={
                isNewTask
                  ? 'Ex.: Adicionar logout… (@ para contexto, /arquivo ou /pasta)'
                  : 'Ex.: Priorize cobertura de testes no middleware…'
              }
              className="pixel-frame-inset w-full resize-none bg-night-950 p-3 text-sm text-ink placeholder:text-ink-faint"
            />
          </label>
          {suggestOpen && suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Sugestões de contexto"
              className="pixel-frame-inset absolute z-10 mt-1 max-h-48 w-full overflow-y-auto bg-night-950 [--px-border:var(--color-cyan-glow)]"
            >
              {suggestions.map((s) => (
                <li key={`${s.kind}:${s.relPath}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => chooseSuggestion(s)}
                    className="font-logs flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[11px] text-ink-dim hover:bg-night-800 hover:text-cyan-glow"
                  >
                    <span className="text-ink-faint">{s.kind === 'folder' ? '📁' : '📄'}</span>@
                    {s.relPath}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
