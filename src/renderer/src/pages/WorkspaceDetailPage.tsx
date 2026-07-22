import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isTerminal } from '@shared/state-machine/run-state'
import { useRunStore } from '@renderer/stores/run-store'
import { useWorkspaceStore } from '@renderer/stores/workspace-store'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' })

/** Detalhe do workspace (Fase 2A): dados do registro + estado rumo à Fase 2B. */
export function WorkspaceDetailPage(): React.JSX.Element {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { workspaces, activeWorkspaceId, init, setActive, remove } = useWorkspaceStore()
  const snapshot = useRunStore((s) => s.snapshot)

  useEffect(() => {
    void init()
  }, [init])

  const workspace = workspaces.find((ws) => ws.id === workspaceId)
  const runBusy = snapshot ? !isTerminal(snapshot.run.state) : false

  if (!workspace) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <PixelPanel title="Workspace não encontrado" titleAccent="var(--color-alert)">
          <p className="text-sm text-ink-dim">
            Este workspace não está (mais) cadastrado. Volte para a central e escolha outro.
          </p>
          <div className="mt-4">
            <Link to="/">
              <PixelButton variant="ghost">Voltar para a Home</PixelButton>
            </Link>
          </div>
        </PixelPanel>
      </div>
    )
  }

  const isActive = workspace.id === activeWorkspaceId

  const handleRemove = async (): Promise<void> => {
    await remove(workspace.id)
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-pixel text-cyan-glow flex items-center gap-3 text-xl tracking-widest">
            {workspace.name}
            {isActive && <PixelBadge className="bg-exec-soft text-exec">ativo</PixelBadge>}
            {workspace.origin === 'demo' && (
              <PixelBadge className="bg-warn-soft text-warn">exemplo</PixelBadge>
            )}
          </h1>
          <p className="font-logs mt-1 text-xs text-ink-faint">{workspace.path}</p>
        </div>
        <Link to="/">
          <PixelButton variant="ghost">Voltar</PixelButton>
        </Link>
      </header>

      <PixelPanel title="Registro" titleAccent="var(--color-orch)">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-pixel text-[10px] uppercase text-ink-faint">Cadastrado em</dt>
            <dd className="text-ink-dim">{dateFmt.format(new Date(workspace.createdAt))}</dd>
          </div>
          <div>
            <dt className="font-pixel text-[10px] uppercase text-ink-faint">Última abertura</dt>
            <dd className="text-ink-dim">{dateFmt.format(new Date(workspace.lastOpenedAt))}</dd>
          </div>
          <div>
            <dt className="font-pixel text-[10px] uppercase text-ink-faint">Origem</dt>
            <dd className="text-ink-dim">
              {workspace.origin === 'user' ? 'Pasta real escolhida por você' : 'Exemplo demonstrativo'}
            </dd>
          </div>
          <div>
            <dt className="font-pixel text-[10px] uppercase text-ink-faint">Estado</dt>
            <dd className="text-exec">Pronto para agentes na Fase 2B</dd>
          </div>
        </dl>
      </PixelPanel>

      <div className="pixel-frame bg-night-800/60 px-4 py-3 [--px-border:var(--color-cyan-glow)]">
        <p className="text-xs leading-relaxed text-ink-dim">
          <span className="font-pixel text-[10px] uppercase text-cyan-glow">Fase 2A · </span>
          Nesta fase, LUTHOR apenas <strong>organiza e registra</strong> workspaces;{' '}
          <strong>nenhum arquivo do projeto será alterado</strong>.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {!isActive && (
          <PixelButton
            variant="primary"
            disabled={runBusy}
            title={runBusy ? 'Troca bloqueada: run simulado ativo' : undefined}
            onClick={() => void setActive(workspace.id)}
          >
            Tornar ativo
          </PixelButton>
        )}
        <PixelButton
          variant="danger"
          disabled={isActive && runBusy}
          title={isActive && runBusy ? 'Workspace ativo com run em andamento' : undefined}
          onClick={() => void handleRemove()}
        >
          Remover registro
        </PixelButton>
        <span className="self-center text-xs text-ink-faint">
          Remover apaga só o registro no LUTHOR — a pasta continua intacta.
        </span>
      </div>
    </div>
  )
}
