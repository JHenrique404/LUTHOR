import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Workspace } from '@shared/domain'
import { useRunStore } from '@renderer/stores/run-store'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

/** Home: workspaces recentes + abrir workspace (só seleciona e registra pasta). */
export function HomePage(): React.JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const activeWorkspaceId = useRunStore((s) => s.snapshot?.workspace.id)

  const refresh = async (): Promise<void> => {
    const list = await window.luthor?.workspaces.list()
    if (list) setWorkspaces(list)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const openWorkspace = async (): Promise<void> => {
    const ws = await window.luthor?.workspaces.openDialog()
    if (ws) await refresh()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="font-pixel text-cyan-glow text-2xl tracking-widest">LUTHOR</h1>
        <p className="text-sm text-ink-dim">
          Central de comando local para workspaces e agentes de IA.
        </p>
      </header>

      <div>
        <PixelButton variant="primary" onClick={() => void openWorkspace()}>
          Abrir workspace
        </PixelButton>
      </div>

      <div className="pixel-frame bg-warn-soft/40 px-4 py-3 [--px-border:var(--color-warn)]">
        <p className="text-xs leading-relaxed text-ink-dim">
          <span className="font-pixel text-[10px] uppercase text-warn">Limite da Fase 1 · </span>
          vários workspaces podem ser cadastrados, mas apenas <strong>um workspace ativo</strong> e{' '}
          <strong>um run demo</strong> por vez. Abas e runs paralelos chegam em fases futuras.
        </p>
      </div>

      <PixelPanel title="Workspaces recentes" titleAccent="var(--color-orch)">
        <ul className="space-y-2">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <Link
                to="/office"
                className="pixel-frame flex items-center justify-between gap-4 px-4 py-3 [--px-border:var(--color-night-500)] hover:[--px-border:var(--color-cyan-glow)]"
              >
                <div className="min-w-0">
                  <p className="font-pixel flex items-center gap-2 text-xs text-ink">
                    {ws.name}
                    {ws.id === activeWorkspaceId && (
                      <PixelBadge className="bg-exec-soft text-exec">ativo</PixelBadge>
                    )}
                  </p>
                  <p className="font-logs truncate text-[11px] text-ink-faint">{ws.path}</p>
                </div>
                <span className="font-pixel shrink-0 text-[10px] text-ink-faint">
                  {new Date(ws.lastOpenedAt).toLocaleDateString('pt-BR')}
                </span>
              </Link>
            </li>
          ))}
          {workspaces.length === 0 && (
            <li className="text-sm text-ink-faint">Nenhum workspace ainda.</li>
          )}
        </ul>
      </PixelPanel>

      <p className="text-xs text-ink-faint">
        Fase 1 — todos os agentes, eventos e progresso exibidos são{' '}
        <strong className="text-warn">simulados</strong>.
      </p>
    </div>
  )
}
