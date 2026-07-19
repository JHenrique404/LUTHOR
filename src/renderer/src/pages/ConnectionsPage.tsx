import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '@shared/ipc/contract'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

const STATUS_LABEL: Record<ConnectionStatus['status'], string> = {
  not_configured: 'Não configurado',
  configured: 'Configurado',
  error: 'Erro'
}

/** Conexões: cards preparados para os providers — tudo mockado na Fase 1. */
export function ConnectionsPage(): React.JSX.Element {
  const [connections, setConnections] = useState<ConnectionStatus[]>([])

  useEffect(() => {
    void window.luthor?.connections.list().then(setConnections)
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="font-pixel text-cyan-glow text-lg tracking-widest">CONEXÕES</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Provedores de agentes. Nenhuma integração real nesta fase —{' '}
          <span className="text-warn">status simulados</span>.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {connections.map((conn) => (
          <PixelPanel key={conn.id} title={conn.name} titleAccent="var(--color-orch)">
            <div className="space-y-3">
              <PixelBadge
                className={
                  conn.status === 'configured'
                    ? 'bg-exec-soft text-exec'
                    : conn.status === 'error'
                      ? 'bg-alert-soft text-alert'
                      : 'bg-warn-soft text-warn'
                }
              >
                {STATUS_LABEL[conn.status]}
              </PixelBadge>
              <p className="text-xs leading-relaxed text-ink-dim">{conn.detail}</p>
              <PixelButton variant="ghost" disabled title="Disponível na Fase 2">
                Configurar
              </PixelButton>
            </div>
          </PixelPanel>
        ))}
      </div>
    </div>
  )
}
