import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '@shared/ipc/contract'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

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

/**
 * Conexões — Fase 2B: o Codex é detectado DE VERDADE (binário, versão, auth).
 * Claude Code e Node Local continuam mockados para fases futuras.
 * Nenhuma credencial é exibida ou armazenada pelo LUTHOR.
 */
export function ConnectionsPage(): React.JSX.Element {
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void window.luthor?.connections.list().then(setConnections)
  }, [])

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const list = await window.luthor?.connections.refresh()
      if (list) setConnections(list)
    } finally {
      setRefreshing(false)
    }
  }

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
        <PixelButton variant="ghost" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? 'Detectando…' : 'Redetectar'}
        </PixelButton>
      </header>

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
              </div>
              <p className="text-xs leading-relaxed text-ink-dim">{conn.detail}</p>
              {conn.status === 'needs_auth' && (
                <p className="pixel-frame-inset bg-night-950 p-2 text-[11px] leading-relaxed text-warn">
                  Autentique uma única vez no SEU terminal:{' '}
                  <code className="font-logs text-ink">codex login</code> — o LUTHOR não faz
                  login por você e não guarda tokens.
                </p>
              )}
              {conn.id !== 'codex' && (
                <PixelButton variant="ghost" disabled title="Disponível em fase futura">
                  Configurar
                </PixelButton>
              )}
            </div>
          </PixelPanel>
        ))}
      </div>
    </div>
  )
}
