import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Workspace } from '@shared/domain'
import { isTerminal } from '@shared/state-machine/run-state'
import { useRunStore } from '@renderer/stores/run-store'
import { useWorkspaceStore } from '@renderer/stores/workspace-store'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

/**
 * Home — central de workspaces (Fase 2A).
 * Cadastro real e persistente de pastas locais; projetos do usuário e
 * exemplos demonstrativos ficam separados e nunca se misturam.
 */
export function HomePage(): React.JSX.Element {
  const { workspaces, activeWorkspaceId, feedback, init, openDialog, setActive, remove, clearFeedback } =
    useWorkspaceStore()
  const snapshot = useRunStore((s) => s.snapshot)
  const cancelRun = useRunStore((s) => s.cancelRun)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  useEffect(() => {
    void init()
  }, [init])

  const runBusy = snapshot ? !isTerminal(snapshot.run.state) : false
  const userWorkspaces = workspaces.filter((ws) => ws.origin === 'user')
  const demoWorkspaces = workspaces.filter((ws) => ws.origin === 'demo')
  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId)

  const confirmRemove = async (workspaceId: string): Promise<void> => {
    setConfirmRemoveId(null)
    await remove(workspaceId)
  }

  const renderWorkspace = (ws: Workspace): React.JSX.Element => {
    const isActive = ws.id === activeWorkspaceId
    const confirming = confirmRemoveId === ws.id
    return (
      <li
        key={ws.id}
        className={`pixel-frame flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
          isActive
            ? '[--px-border:var(--color-exec)]'
            : '[--px-border:var(--color-night-500)]'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-pixel flex items-center gap-2 text-xs text-ink">
            <Link to={`/workspace/${ws.id}`} className="hover:text-cyan-glow">
              {ws.name}
            </Link>
            {isActive && <PixelBadge className="bg-exec-soft text-exec">ativo</PixelBadge>}
            {ws.origin === 'demo' && (
              <PixelBadge className="bg-warn-soft text-warn">exemplo</PixelBadge>
            )}
          </p>
          <p className="font-logs truncate text-[11px] text-ink-faint">{ws.path}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="font-pixel text-[10px] text-ink-faint">
            {new Date(ws.lastOpenedAt).toLocaleDateString('pt-BR')}
          </span>
          {!isActive && (
            <PixelButton
              variant="primary"
              disabled={runBusy}
              title={runBusy ? 'Troca bloqueada: run simulado ativo' : undefined}
              onClick={() => void setActive(ws.id)}
            >
              Ativar
            </PixelButton>
          )}
          <PixelButton variant="ghost" onClick={() => setConfirmRemoveId(confirming ? null : ws.id)}>
            {confirming ? 'Manter' : 'Remover'}
          </PixelButton>
          {confirming && (
            <PixelButton variant="danger" onClick={() => void confirmRemove(ws.id)}>
              Confirmar remoção
            </PixelButton>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="font-pixel text-cyan-glow text-2xl tracking-widest">LUTHOR</h1>
        <p className="text-sm text-ink-dim">
          Central de workspaces — cadastre e organize seus projetos locais.
          {activeWorkspace && (
            <>
              {' '}
              Ativo agora: <span className="font-pixel text-xs text-exec">{activeWorkspace.name}</span>
            </>
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <PixelButton variant="primary" onClick={() => void openDialog()}>
          Abrir workspace
        </PixelButton>
        <span className="text-xs text-ink-faint">Escolha uma pasta local pelo diálogo do sistema.</span>
      </div>

      <div className="pixel-frame bg-night-800/60 px-4 py-3 [--px-border:var(--color-cyan-glow)]">
        <p className="text-xs leading-relaxed text-ink-dim">
          <span className="font-pixel text-[10px] uppercase text-cyan-glow">Fase 2A · </span>
          Nesta fase, LUTHOR apenas <strong>organiza e registra</strong> workspaces;{' '}
          <strong>nenhum arquivo do projeto será alterado</strong>. Agentes reais chegam na Fase 2B.
        </p>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`pixel-frame flex items-start justify-between gap-3 px-4 py-3 ${
            feedback.kind === 'error'
              ? 'bg-alert-soft/40 [--px-border:var(--color-alert)]'
              : 'bg-warn-soft/40 [--px-border:var(--color-warn)]'
          }`}
        >
          <p className="text-xs leading-relaxed text-ink-dim">
            <span
              className={`font-pixel text-[10px] uppercase ${
                feedback.kind === 'error' ? 'text-alert' : 'text-warn'
              }`}
            >
              {feedback.kind === 'error' ? 'Pasta inválida · ' : 'Aviso · '}
            </span>
            {feedback.message}
          </p>
          <PixelButton variant="ghost" onClick={clearFeedback}>
            Fechar
          </PixelButton>
        </div>
      )}

      {runBusy && (
        <div className="pixel-frame flex flex-wrap items-center justify-between gap-3 bg-warn-soft/40 px-4 py-3 [--px-border:var(--color-warn)]">
          <p className="max-w-md text-xs leading-relaxed text-ink-dim">
            <span className="font-pixel text-[10px] uppercase text-warn">Run ativo · </span>
            um run simulado está em andamento em{' '}
            <strong>{snapshot?.workspace.name}</strong>. A troca de workspace com run ativo
            (concorrência entre workspaces) chega em uma fase futura.
          </p>
          <PixelButton variant="danger" onClick={() => void cancelRun()}>
            Cancelar run
          </PixelButton>
        </div>
      )}

      <PixelPanel title="Meus projetos" titleAccent="var(--color-exec)">
        <ul className="space-y-2">
          {userWorkspaces.map(renderWorkspace)}
          {userWorkspaces.length === 0 && (
            <li className="pixel-frame px-4 py-6 text-center [--px-border:var(--color-night-500)]">
              <p className="font-pixel text-xs text-ink-dim">Nenhum projeto real cadastrado</p>
              <p className="mt-2 text-xs text-ink-faint">
                Use <strong>Abrir workspace</strong> para registrar uma pasta local. O registro é
                persistente e nada dentro dela é modificado.
              </p>
            </li>
          )}
        </ul>
      </PixelPanel>

      <PixelPanel title="Exemplos demonstrativos" titleAccent="var(--color-orch)">
        <p className="mb-3 text-xs text-ink-faint">
          Dados de exemplo da simulação — pastas fictícias, separadas dos seus projetos reais.
          Remova quando quiser.
        </p>
        <ul className="space-y-2">
          {demoWorkspaces.map(renderWorkspace)}
          {demoWorkspaces.length === 0 && (
            <li className="text-xs text-ink-faint">Todos os exemplos foram removidos.</li>
          )}
        </ul>
      </PixelPanel>

      <p className="text-xs text-ink-faint">
        Workspaces são reais e persistentes (Fase 2A); agentes, eventos e progresso seguem{' '}
        <strong className="text-warn">simulados</strong> até a Fase 2B.
      </p>
    </div>
  )
}
