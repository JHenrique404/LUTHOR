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

/** Token textual legível de uma referência (@relPath, pastas com "/"). */
function refToken(ref: ContextRef): string {
  return ref.kind === 'folder' ? `@${ref.relPath.replace(/\/$/, '')}/` : `@${ref.relPath}`
}

/** Comandos locais do Composer (barra "/"). Não são comandos do provider. */
const SLASH_COMMANDS: Array<{ id: string; label: string; hint: string; enabled: boolean }> = [
  { id: 'arquivo', label: '/arquivo', hint: 'Anexar arquivo (seletor nativo)', enabled: true },
  { id: 'pasta', label: '/pasta', hint: 'Anexar pasta (seletor nativo)', enabled: true },
  { id: 'skill', label: '/skill', hint: 'Skills seguras — em breve', enabled: false },
  { id: 'plan', label: '/plan', hint: 'Modo plano — em breve', enabled: false },
  { id: 'goal', label: '/goal', hint: 'Objetivos — em breve', enabled: false }
]

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

type Dropdown =
  | { kind: 'context'; items: ContextRef[]; tokenStart: number; tokenEnd: number }
  | { kind: 'slash'; query: string; tokenStart: number; tokenEnd: number }
  | null

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
  const [model, setModel] = useState('')
  const [contextRefs, setContextRefs] = useState<ContextRef[]>([])
  const [contextError, setContextError] = useState<string | null>(null)
  const [dropdown, setDropdown] = useState<Dropdown>(null)
  const [imageWarning, setImageWarning] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isNewTask = kind === 'new_task'
  const title = isNewTask ? 'Nova tarefa' : 'Direcionar run'
  const canSubmit =
    text.trim().length >= 3 && (isNewTask || scopeType !== 'agent' || agentId.length > 0)

  const enumeratedModels = codexCapabilities?.availableModels ?? []
  const canSelectModel = enumeratedModels.length > 0
  const codexMode = isNewTask && mode === 'codex'
  const IMAGE_NOTICE =
    'Imagens ainda não são suportadas pelo executor Codex desta fase. Nada será enviado ou descartado silenciosamente.'

  /** Só a escolha explícita cria a referência efetiva enviada ao executor. */
  const addRef = (ref: ContextRef, tokenStart?: number, tokenEnd?: number): void => {
    setContextRefs((refs) =>
      refs.some((r) => r.relPath === ref.relPath && r.kind === ref.kind) ? refs : [...refs, ref]
    )
    // Insere o token textual legível, integrado à frase.
    setText((prev) => {
      const token = refToken(ref)
      if (tokenStart !== undefined && tokenEnd !== undefined) {
        const before = prev.slice(0, tokenStart)
        const after = prev.slice(tokenEnd)
        // Espaço após o token para o usuário continuar a frase.
        const sep = after === '' ? ' ' : after.startsWith(' ') ? '' : ' '
        return `${before}${token}${sep}${after}`
      }
      // Sem posição (veio do botão): anexa ao fim.
      const sep = prev.length === 0 || prev.endsWith(' ') ? '' : ' '
      return `${prev}${sep}${token} `
    })
    setDropdown(null)
    textareaRef.current?.focus()
  }

  const pickNative = async (
    refKind: 'file' | 'folder',
    tokenStart?: number,
    tokenEnd?: number
  ): Promise<void> => {
    setContextError(null)
    if (!onPickContext) return
    const result = await onPickContext(refKind)
    if (result.status === 'ok') addRef(result.ref, tokenStart, tokenEnd)
    else if (result.status === 'blocked' || result.status === 'no_workspace')
      setContextError(result.message)
  }

  /**
   * Remover chip: tira o token correspondente do texto quando ainda presente
   * verbatim; se o texto foi editado (token ausente), remove só a chip.
   */
  const removeContext = (ref: ContextRef): void => {
    setContextRefs((refs) => refs.filter((r) => !(r.relPath === ref.relPath && r.kind === ref.kind)))
    const token = refToken(ref)
    setText((prev) => {
      const idx = prev.indexOf(token)
      if (idx < 0) return prev // texto editado: não mexe destrutivamente
      const after = prev.slice(idx + token.length)
      const trimmedAfter = after.startsWith(' ') ? after.slice(1) : after
      return `${prev.slice(0, idx)}${trimmedAfter}`
    })
  }

  /** Detecta o token ativo (@… ou /…) imediatamente antes do caret. */
  const detectToken = (
    value: string,
    caret: number
  ): { trigger: '@' | '/'; query: string; start: number; end: number } | null => {
    const upto = value.slice(0, caret)
    const m = /(^|\s)([@/])([^\s@/]*)$/.exec(upto)
    if (!m) return null
    const trigger = m[2] as '@' | '/'
    const query = m[3]
    const start = caret - query.length - 1
    return { trigger, query, start, end: caret }
  }

  const onTextChange = async (value: string, caret: number): Promise<void> => {
    // Atalho: "/arquivo " ou "/pasta " (com espaço) executa direto.
    const done = /(^|\s)\/(arquivo|pasta)\s$/.exec(value)
    if (done) {
      const stripped = value.replace(/\/(arquivo|pasta)\s$/, '').trimEnd()
      const at = stripped.length + (stripped.length && !stripped.endsWith(' ') ? 1 : 0)
      setText(stripped)
      setDropdown(null)
      await pickNative(done[2] === 'pasta' ? 'folder' : 'file', at, at)
      return
    }
    setText(value)
    const token = detectToken(value, caret)
    if (!token) {
      setDropdown(null)
      return
    }
    if (token.trigger === '/') {
      setDropdown({ kind: 'slash', query: token.query, tokenStart: token.start, tokenEnd: token.end })
      return
    }
    // '@' só busca contexto no modo Codex com capacidade de referências.
    if (codexMode && codexCapabilities?.supportsFileReferences && onSuggestContext) {
      const list = await onSuggestContext(token.query)
      setDropdown({
        kind: 'context',
        items: list.slice(0, 20),
        tokenStart: token.start,
        tokenEnd: token.end
      })
      return
    }
    setDropdown(null)
  }

  const runSlashCommand = async (id: string): Promise<void> => {
    if (dropdown?.kind !== 'slash') return
    const { tokenStart, tokenEnd } = dropdown
    // Remove o texto "/cmd" antes de abrir o seletor.
    setText((prev) => `${prev.slice(0, tokenStart)}${prev.slice(tokenEnd)}`)
    setDropdown(null)
    if (id === 'arquivo') await pickNative('file', tokenStart, tokenStart)
    else if (id === 'pasta') await pickNative('folder', tokenStart, tokenStart)
    // skill/plan/goal: preparados, não funcionais nesta rodada.
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
        codexModel: codexMode && canSelectModel && model ? model : undefined,
        // Referências EFETIVAS = chips (escolha explícita), nunca o texto cru.
        contextRefs: codexMode && contextRefs.length > 0 ? contextRefs : undefined
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

  const slashItems =
    dropdown?.kind === 'slash'
      ? SLASH_COMMANDS.filter((c) => c.id.startsWith(dropdown.query.toLowerCase()))
      : []

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

        {codexMode && (
          <fieldset className="space-y-3">
            <legend className="font-pixel mb-1 text-[10px] uppercase text-ink-faint">
              Executor de execução real
            </legend>

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

            {codexCapabilities?.supportsFileReferences && (
              <div className="space-y-2">
                <span className="font-pixel block text-[9px] uppercase text-ink-faint">
                  Contexto (arquivos/pastas do workspace)
                </span>
                <div className="flex flex-wrap gap-2">
                  <PixelButton variant="ghost" onClick={() => void pickNative('file')}>
                    + @arquivo
                  </PixelButton>
                  <PixelButton variant="ghost" onClick={() => void pickNative('folder')}>
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
                        <span className="font-logs truncate text-cyan-glow">{refToken(ref)}</span>
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
                  Digite <code className="text-ink-dim">@</code> para buscar ou{' '}
                  <code className="text-ink-dim">/</code> para os comandos. O token aparece na
                  frase e fica vinculado à chip. Caminho digitado à mão NÃO anexa — só a escolha
                  explícita. .env, chaves, .git, node_modules, binários e arquivos grandes são
                  bloqueados.
                </p>
              </div>
            )}

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
              onChange={(e) => void onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyUp={(e) => {
                const el = e.currentTarget
                void onTextChange(el.value, el.selectionStart ?? el.value.length)
              }}
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
                  ? 'Ex.: Analise @src/teste.ts e faça X  (@ contexto · / comandos)'
                  : 'Ex.: Priorize cobertura de testes no middleware…'
              }
              className="pixel-frame-inset w-full resize-none bg-night-950 p-3 text-sm text-ink placeholder:text-ink-faint"
            />
          </label>

          {dropdown?.kind === 'context' && dropdown.items.length > 0 && (
            <ul
              role="listbox"
              aria-label="Sugestões de contexto"
              className="pixel-frame-inset absolute z-10 mt-1 max-h-48 w-full overflow-y-auto bg-night-950 [--px-border:var(--color-cyan-glow)]"
            >
              {dropdown.items.map((s) => (
                <li key={`${s.kind}:${s.relPath}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => addRef(s, dropdown.tokenStart, dropdown.tokenEnd)}
                    className="font-logs flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[11px] text-ink-dim hover:bg-night-800 hover:text-cyan-glow"
                  >
                    <span className="text-ink-faint">{s.kind === 'folder' ? '📁' : '📄'}</span>
                    {refToken(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {dropdown?.kind === 'slash' && (
            <ul
              role="listbox"
              aria-label="Comandos do Composer"
              className="pixel-frame-inset absolute z-10 mt-1 w-full overflow-y-auto bg-night-950 [--px-border:var(--color-orch)]"
            >
              {slashItems.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    aria-disabled={!c.enabled}
                    disabled={!c.enabled}
                    onClick={() => void runSlashCommand(c.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] ${
                      c.enabled
                        ? 'cursor-pointer text-ink-dim hover:bg-night-800 hover:text-orch'
                        : 'cursor-not-allowed text-ink-faint opacity-60'
                    }`}
                  >
                    <span className="font-logs">{c.label}</span>
                    <span className="text-[10px] text-ink-faint">{c.hint}</span>
                  </button>
                </li>
              ))}
              {slashItems.length === 0 && (
                <li className="px-3 py-1.5 text-[11px] text-ink-faint">Nenhum comando.</li>
              )}
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
