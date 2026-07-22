import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, Notification, shell, Tray } from 'electron'
import { IpcChannels } from '@shared/ipc/contract'
import { createRepository } from './services/db/in-memory-repository'
import { createProviders } from './services/integrations/agent-provider'
import { JsonWorkspaceRegistry } from './services/workspaces/workspace-registry'
import { WorkspaceService } from './services/workspaces/workspace-service'
import { SimulationEngine } from './services/simulation/simulation-engine'
import { CodexDetector } from './services/codex/codex-detector'
import { CodexBinaryResolver } from './services/codex/codex-binary-resolver'
import { CodexSettingsStore } from './services/codex/codex-settings-store'
import { CodexRunManager } from './services/codex/codex-run-manager'
import { RunCoordinator } from './services/run-coordinator'
import { registerIpcHandlers } from './ipc/register'
import { WindowLifecycle } from './lifecycle/window-lifecycle'
import { buildTrayMenuTemplate } from './tray/tray-menu'
import { createTrayIcon, createWindowIcon } from './tray/tray-icon'

// Necessário para notificações nativas no Windows (mesmo appId do electron-builder).
app.setAppUserModelId('dev.luthor.app')

async function bootstrap(): Promise<void> {
  const repository = createRepository()
  // Detecção real do Codex CLI (Fase 2B): leitura apenas; sem login automático.
  // O resolvedor encontra o codex.exe REAL (shims do NVM/npm não são executáveis
  // pelo Electron); caminho manual persistido entra como fallback.
  const codexSettings = new CodexSettingsStore(app.getPath('userData'))
  const codexResolver = new CodexBinaryResolver({
    getManualPath: () => codexSettings.getManualBinaryPath()
  })
  const codexDetector = new CodexDetector({
    resolveBinary: () => codexResolver.resolve()
  })
  void codexDetector
    .refresh()
    .then((s) =>
      console.log(
        `[luthor] codex: ${s.detail}${s.binaryLabel ? ` · exec: ${s.binaryLabel} (${s.binarySource})` : ''}`
      )
    )
    .catch(() => {})
  const providers = createProviders(codexDetector)
  const seedSnapshot = await repository.getRunSnapshot()

  // Registro PERSISTENTE de workspaces (Fase 2A): JSON versionado com migrações.
  // Instalação NOVA abre limpa (sem workspaces demo). Demos antigas persistidas
  // são preservadas até o usuário usar "Remover demonstrações".
  const workspaceRegistry = await JsonWorkspaceRegistry.open({
    dir: app.getPath('userData'),
    seed: () => []
  })

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let updateTrayMenu: () => void = () => {}

  const emitToRenderer = (payload: unknown): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcChannels.simEvent, payload)
    }
    // Estado do run muda -> menu da bandeja acompanha (Pausar/Cancelar/Retomar).
    updateTrayMenu()
  }

  const engine = new SimulationEngine({
    snapshot: seedSnapshot,
    emit: emitToRenderer
  })

  // Uso por run só é "suportado" depois que a CLI emitir dados reais uma vez.
  let usageObservedOnce = false

  // Run REAL (Fase 2B): um único processo Codex por vez, transcript em userData.
  const codexManager = new CodexRunManager({
    emit: emitToRenderer,
    dataDir: app.getPath('userData'),
    onUsageObserved: () => {
      usageObservedOnce = true
    }
  })

  // O run demo abre apontando para o workspace ativo persistido.
  const activeWorkspace = workspaceRegistry.getActive()
  if (activeWorkspace) engine.setWorkspace(activeWorkspace)

  const coordinator = new RunCoordinator(engine, codexManager, codexDetector, () =>
    workspaceRegistry.getActive()
  )

  const workspaceService = new WorkspaceService({
    registry: workspaceRegistry,
    // Run real TAMBÉM bloqueia troca de workspace (um executor por vez).
    isRunBusy: () => coordinator.isBusy(),
    onActiveChanged: (workspace) => engine.setWorkspace(workspace)
  })

  const lifecycle = new WindowLifecycle({
    hideWindow: () => mainWindow?.hide(),
    showWindow: () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    },
    quit: () => app.quit(),
    notifyFirstHide: () => {
      if (Notification.isSupported()) {
        new Notification({
          title: 'LUTHOR continua ativo',
          body: 'A simulação segue rodando na bandeja, ao lado do relógio. Use "Sair do LUTHOR" no menu da bandeja para encerrar de verdade.'
        }).show()
      }
    }
  })

  registerIpcHandlers({
    repository,
    coordinator,
    simEngine: engine,
    providers,
    workspaces: workspaceService,
    refreshConnections: async () => {
      await codexDetector.refresh()
    },
    setManualCodexBinary: async (path) => {
      await codexSettings.setManualBinaryPath(path)
    },
    codexCapabilities: () => codexDetector.providerCapabilities(usageObservedOnce),
    getActiveWorkspacePath: () => workspaceRegistry.getActive()?.path ?? null
  })

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    title: 'LUTHOR',
    // Ícone original pixel do LUTHOR (taskbar/alt-tab) — nunca o padrão do Electron.
    icon: createWindowIcon(),
    // Barra de título integrada à identidade: fundo azul-noite, controles
    // NATIVOS preservados (min/max/X — o X segue caindo na lógica da bandeja).
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#070b16',
      symbolColor: '#45d8e8',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // X da janela: oculta para a bandeja; simulação E processo real seguem rodando.
  mainWindow.on('close', (event) => {
    if (lifecycle.handleWindowClose()) {
      event.preventDefault()
      console.log('[luthor] janela oculta na bandeja — execução continua')
    }
  })
  mainWindow.on('closed', () => {
    engine.stop()
    mainWindow = null
  })

  // Único protocolo permitido para abrir no navegador do sistema.
  const EXTERNAL_PROTOCOLS = new Set(['https:'])
  const devOrigin = process.env['ELECTRON_RENDERER_URL']
    ? new URL(process.env['ELECTRON_RENDERER_URL']).origin
    : null

  const isAppUrl = (url: string): boolean => {
    try {
      const target = new URL(url)
      // dev: apenas o próprio dev server do Vite; prod: apenas file:// do bundle.
      return devOrigin ? target.origin === devOrigin : target.protocol === 'file:'
    } catch {
      return false
    }
  }

  const openExternalIfAllowed = (url: string): void => {
    try {
      if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) void shell.openExternal(url)
    } catch {
      // URL malformada: ignora silenciosamente.
    }
  }

  // Bloqueia qualquer navegação da janela para fora do app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternalIfAllowed(url)
    }
  })

  // Nenhuma janela nova: links externos só pelo navegador do sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url)
    return { action: 'deny' }
  })

  // Sem run demo automático: a Agent Office abre limpa. A simulação só roda
  // quando o usuário cria uma "Nova tarefa" (modo simulado). O executor real
  // Codex roda seu próprio processo.

  // ── Bandeja do Windows ─────────────────────────────────────────────────
  tray = new Tray(createTrayIcon())
  tray.setToolTip('LUTHOR — central de agentes (simulação ativa)')
  tray.on('click', () => lifecycle.handleActivate())

  /**
   * Saída explícita. Com run REAL em execução, pergunta antes:
   * "Cancelar e sair" (interrompe graciosamente, força após 5s) ou
   * "Manter aberto".
   */
  const requestQuitWithRealRunGuard = async (): Promise<void> => {
    if (coordinator.isRealRunBusy() && mainWindow && !mainWindow.isDestroyed()) {
      lifecycle.handleActivate()
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Execução real em andamento',
        message: 'Há uma tarefa REAL do Codex em execução neste momento.',
        detail: 'Sair agora vai cancelar o processo (graciosamente; forçado após 5s).',
        buttons: ['Cancelar run e sair', 'Manter aberto'],
        defaultId: 1,
        cancelId: 1
      })
      if (response !== 0) return
      coordinator.cancelRun()
      // Dá até 6s para o processo encerrar antes de derrubar o app.
      await new Promise<void>((resolve) => {
        const started = Date.now()
        const poll = setInterval(() => {
          if (!coordinator.isRealRunBusy() || Date.now() - started > 6000) {
            clearInterval(poll)
            resolve()
          }
        }, 250)
      })
    }
    console.log('[luthor] saída explícita — encerrando')
    lifecycle.requestQuit()
  }

  updateTrayMenu = () => {
    if (!tray) return
    tray.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenuTemplate(
          coordinator.getRunState(),
          {
            onOpen: () => lifecycle.handleActivate(),
            onPauseAll: () => void coordinator.pauseAll(),
            onResumeAll: () => void coordinator.resumeAll(),
            onCancelRun: () => void coordinator.cancelRun(),
            onQuit: () => void requestQuitWithRealRunGuard()
          },
          coordinator.getExecutor()
        )
      )
    )
  }
  updateTrayMenu()

  app.on('before-quit', () => lifecycle.markQuitting())
  app.on('will-quit', () => {
    tray?.destroy()
    tray = null
  })
  app.on('activate', () => lifecycle.handleActivate())

  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  void bootstrap()
})

// A janela real só fecha na saída explícita; ocultar não dispara este evento.
// Quando fechar de verdade, encerra o processo por completo.
app.on('window-all-closed', () => {
  app.quit()
})
