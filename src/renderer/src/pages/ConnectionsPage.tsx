import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '@shared/ipc/contract'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'
import { StatusDot } from '@renderer/components/ui/StatusDot'

const STATUS_LABEL: Record<ConnectionStatus['status'], string> = {
  not_configured: 'Não detectado',
  configured: 'Pronto',
  needs_auth: 'Precisa autenticar',
  error: 'Erro'
}

const STATUS_CLASS: Record<ConnectionStatus['status'], string> = {
  configured: 'bg-exec-soft text-exec',
  needs_auth: 'bg-warn-soft text-warn',
  not_configured: 'bg-night-700 text-ink-faint',
  error: 'bg-alert-soft text-alert'
}

type Feedback = { kind: 'ok' | 'error'; text: string } | null

/**
 * Conexões — Fase 2B: o Codex é detectado DE VERDADE (executável real
 * resolvido no main, versão, auth, capacidades). Claude Code e Node Local
 * continuam mockados. Nenhuma credencial nem PATH completo chega aqui —
 * só o nome do executável.
 */
export function ConnectionsPage(): React.JSX.Element {
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [busy, setBusy] = useState<null | 'refresh' | 'choose' | 'clear'>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  useEffect(() => {
    void window.luthor?.connections
      .list()
      .then(setConnections)
      .catch(() => setFeedback({ kind: 'error', text: 'Falha ao carregar as conexões.' }))
  }, [])

  /** Toda ação captura erro: o botão nunca falha silenciosamente. */
  const runAction = async (
    kind: 'refresh' | 'choose' | 'clear',
    action: () => Promise<ConnectionStatus[] | undefined>,
    okText: string
  ): Promise<void> => {
    setBusy(kind)
    setFeedback(null)
    try {
      const list = await action()
      if (list) setConnections(list)
      setFeedback({ kind: 'ok', text: okText })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido'
      // Mensagem útil, sem stack trace.
      setFeedback({ kind: 'error', text: `A operação falhou: ${message.split('\n')[0].slice(0, 200)}` })
    } finally {
      setBusy(null)
    }
  }

  const refresh = (): Promise<void> =>
    runAction('refresh', () => window.luthor?.connections.refresh() ?? Promise.resolve(undefined), 'Detecção atualizada agora.')

  const chooseBinary = (): Promise<void> =>
    runAction(
      'choose',
      () => window.luthor?.connections.chooseCodexBinary() ?? Promise.resolve(undefined),
      'Executável manual aplicado (usado quando a detecção automática falhar).'
    )

  const clearBinary = (): Promise<void> =>
    runAction(
      'clear',
      () => window.luthor?.connections.clearCodexBinary() ?? Promise.resolve(undefined),
      'Caminho manual removido — detecção automática apenas.'
    )

  const codex = connections.find((c) => c.id === 'codex')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-cyan-glow text-lg tracking-widest">CONEXÕES</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Provedores de agentes. <span className="text-exec">Codex: detecção real</span> ·
            demais: fases futuras. Nenhuma credencial fica no LUTHOR.
          </p>
        </div>
        <PixelButton
          variant="ghost"
          onClick={() => void refresh()}
          disabled={busy !== null}
          aria-busy={busy === 'refresh'}
        >
          {busy === 'refresh' ? 'Verificando…' : 'Redetectar'}
        </PixelButton>
      </header>

      {/* Indicador de carregamento pixel VISÍVEL + resultado em aria-live. */}
      <div aria-live="polite" className="min-h-8">
        {busy !== null && (
          <div
            data-testid="connections-busy"
            className="pixel-frame flex items-center gap-3 bg-night-800 px-4 py-2 [--px-border:var(--color-cyan-glow)]"
          >
            <StatusDot colorClass="bg-cyan-glow" animClass="anim-blink" label="verificando" />
            <StatusDot colorClass="bg-cyan-glow" animClass="anim-pulse" />
            <StatusDot colorClass="bg-cyan-glow" animClass="anim-blink" />
            <span className="font-pixel text-cyan-glow text-[10px] uppercase">
              Verificando executável, versão e autenticação…
            </span>
          </div>
        )}
        {busy === null && feedback && (
          <div
            data-testid="connections-feedback"
            className={`pixel-frame px-4 py-2 text-xs ${
              feedback.kind === 'ok'
                ? 'bg-exec-soft text-exec [--px-border:var(--color-exec)]'
                : 'bg-alert-soft text-alert [--px-border:var(--color-alert)]'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {connections.map((conn) => (
          <PixelPanel
            key={conn.id}
            title={conn.name}
            titleAccent={conn.id === 'codex' ? 'var(--color-exec)' : 'var(--color-orch)'}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <PixelBadge className={STATUS_CLASS[conn.status]}>
                  {STATUS_LABEL[conn.status]}
                </PixelBadge>
                {conn.version && (
                  <PixelBadge className="bg-night-700 text-ink-dim" title="Versão informada pela CLI">
                    {conn.version}
                  </PixelBadge>
                )}
                {conn.authenticated === true && (
                  <PixelBadge className="bg-exec-soft text-exec">autenticado</PixelBadge>
                )}
                {conn.binaryLabel && (
                  <PixelBadge
                    className="bg-night-700 text-ink-dim"
                    title={`Executável resolvido (${conn.binarySource === 'manual' ? 'caminho manual' : 'detecção automática'})`}
                  >
                    {conn.binaryLabel}
                    {conn.binarySource === 'manual' ? ' · manual' : ''}
                  </PixelBadge>
                )}
              </div>
              <p className="text-xs leading-relaxed text-ink-dim">{conn.detail}</p>
              {conn.capabilitiesSummary && conn.capabilitiesSummary.length > 0 && (
                <p className="text-[11px] text-ink-faint">
                  capacidades: {conn.capabilitiesSummary.join(' · ')}
                </p>
              )}
              {conn.status === 'needs_auth' && (
                <p className="pixel-frame-inset bg-night-950 p-2 text-[11px] leading-relaxed text-warn">
                  Autentique uma única vez no SEU terminal:{' '}
                  <code className="font-logs text-ink">codex login</code> — o LUTHOR não faz
                  login por você e não guarda tokens.
                </p>
              )}
              {conn.id === 'codex' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <PixelButton
                      variant="ghost"
                      onClick={() => void chooseBinary()}
                      disabled={busy !== null}
                      aria-busy={busy === 'choose'}
                    >
                      Escolher executável Codex…
                    </PixelButton>
                    {conn.binarySource === 'manual' && (
                      <PixelButton
                        variant="ghost"
                        onClick={() => void clearBinary()}
                        disabled={busy !== null}
                        aria-busy={busy === 'clear'}
                      >
                        Usar detecção automática
                      </PixelButton>
                    )}
                  </div>
                  <p className="text-[10px] leading-relaxed text-ink-faint">
                    O caminho manual é usado apenas quando a detecção automática falhar (ex.:
                    PATH só com atalhos do NVM). Somente o caminho é salvo — nunca tokens.
                  </p>
                </div>
              )}
              {conn.id !== 'codex' && (
                <PixelButton variant="ghost" disabled title="Disponível em fase futura">
                  Configurar
                </PixelButton>
              )}
            </div>
          </PixelPanel>
        ))}
        {connections.length === 0 && !codex && (
          <p className="text-sm text-ink-faint">Carregando conexões…</p>
        )}
      </div>
    </div>
  )
}
