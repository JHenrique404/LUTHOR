import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useRunStore } from '@renderer/stores/run-store'
import { useWorkspaceStore } from '@renderer/stores/workspace-store'
import { HomePage } from '@renderer/pages/HomePage'
import { AgentOfficePage } from '@renderer/pages/AgentOfficePage'
import { RunDetailPage } from '@renderer/pages/RunDetailPage'
import { ConnectionsPage } from '@renderer/pages/ConnectionsPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { WorkspaceDetailPage } from '@renderer/pages/WorkspaceDetailPage'

const NAV_ITEMS = [
  { to: '/', label: 'Início' },
  { to: '/office', label: 'Agent Office' },
  { to: '/run', label: 'Run' },
  { to: '/connections', label: 'Conexões' },
  { to: '/settings', label: 'Config' }
]

export function App(): React.JSX.Element {
  const init = useRunStore((s) => s.init)
  const initWorkspaces = useWorkspaceStore((s) => s.init)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((ws) => ws.id === activeWorkspaceId)
  )

  useEffect(() => {
    void init()
    void initWorkspaces()
  }, [init, initWorkspaces])

  return (
    <HashRouter>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Barra de título integrada (mesma altura do titleBarOverlay: 36px).
            Área da direita fica livre para os controles nativos min/max/X. */}
        <div className="titlebar-drag flex h-9 shrink-0 items-center gap-3 border-b-2 border-night-700 bg-night-950 px-3">
          <span className="font-pixel text-cyan-glow text-[11px] tracking-widest">LUTHOR</span>
          <span className="font-pixel text-[8px] uppercase text-ink-faint">
            central de agentes
          </span>
          {activeWorkspace && (
            <span className="font-pixel text-[8px] uppercase text-exec" title={activeWorkspace.path}>
              ▸ {activeWorkspace.name}
            </span>
          )}
        </div>

        {/* overflow-hidden no shell: sidebar ocupa a altura toda; só o main rola. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <nav
          aria-label="Navegação principal"
          className="flex h-full w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r-2 border-night-700 bg-night-950 p-3"
        >
          <div className="mb-4 px-2">
            <span className="font-pixel text-cyan-glow text-sm tracking-widest">LUTHOR</span>
            <span className="font-pixel mt-1 block text-[8px] uppercase text-warn">
              fase 2a · agentes simulados
            </span>
          </div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `font-pixel px-3 py-2 text-[11px] tracking-wide uppercase transition-colors ${
                  isActive
                    ? 'bg-night-700 text-cyan-glow shadow-[inset_3px_0_0_0_var(--color-cyan-glow)]'
                    : 'text-ink-dim hover:bg-night-800 hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="h-full min-w-0 flex-1 overflow-y-auto bg-night-900">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/workspace/:workspaceId" element={<WorkspaceDetailPage />} />
            <Route path="/office" element={<AgentOfficePage />} />
            <Route path="/run" element={<RunDetailPage />} />
            <Route path="/connections" element={<ConnectionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  )
}
