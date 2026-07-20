import { join } from 'node:path'
import { app, BrowserWindow, Menu, Notification, shell, Tray } from 'electron'
import { IpcChannels } from '@shared/ipc/contract'
import { createRepository } from './services/db/in-memory-repository'
import { createSeedWorkspaces } from './services/db/seed'
import { createProviders } from './services/integrations/agent-provider'
import { JsonWorkspaceRegistry } from './services/workspaces/workspace-registry'
import { WorkspaceService } from './services/workspaces/workspace-service'
import { SimulationEngine } from './services/simulation/simulation-engine'
import { registerIpcHandlers } from './ipc/register'
import { WindowLifecycle } from './lifecycle/window-lifecycle'
import { buildTrayMenuTemplate } from './tray/tray-menu'
import { createTrayIcon, createWindowIcon } from './tray/tray-icon'

// Necessário para notificações nativas no Windows (mesmo appId do electron-builder).
app.setAppUserModelId('dev.luthor.app')

async function bootstrap(): Promise<void> {
  const repository = createRepository()
  const providers = createProviders()
  const seedSnapshot = await repository.getRunSnapshot()

  // Registro PERSISTENTE de workspaces (Fase 2A): JSON versionado com
  // migrações em userData. Seeds demo só na primeira execução.
  const workspaceRegistry = await JsonWorkspaceRegistry.open({
    dir: app.getPath('userData'),
    seed: () => createSeedWorkspaces()
  })

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let updateTrayMenu: () => void = () => {}

  const engine = new SimulationEngine({
    snapshot: seedSnapshot,
    emit: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IpcChannels.simEvent, payload)
      }
      // Estado do run muda -> menu da bandeja acompanha (Pausar/Retomar).
      updateTrayMenu()
    }
  })

  // O run demo abre apontando para o workspace ativo persistido.
  const activeWorkspace = workspaceRegistry.getActive()
  if (activeWorkspace) engine.setWorkspace(activeWorkspace)

  const workspaceService = new WorkspaceService({
    registry: workspaceRegistry,
    isRunBusy: () => engine.isBusy(),
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

  registerIpcHandlers(repository, engine, providers, workspaceService)

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

  // X da janela: oculta para a bandeja; engine e timers seguem rodando.
  mainWindow.on('close', (event) => {
    if (lifecycle.handleWindowClose()) {
      event.preventDefault()
      console.log('[luthor] janela oculta na bandeja — simulação continua')
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

  mainWindow.webContents.on('did-finish-load', () => engine.start())

  // ── Bandeja do Windows ─────────────────────────────────────────────────
  tray = new Tray(createTrayIcon())
  tray.setToolTip('LUTHOR — central de agentes (simulação ativa)')
  tray.on('click', () => lifecycle.handleActivate())

  updateTrayMenu = () => {
    if (!tray) return
    tray.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenuTemplate(engine.getRunState(), {
          onOpen: () => lifecycle.handleActivate(),
          onPauseAll: () => void engine.pauseAll(),
          onResumeAll: () => void engine.resumeAll(),
          onQuit: () => {
            console.log('[luthor] saída explícita pela bandeja — encerrando')
            lifecycle.requestQuit()
          }
        })
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
