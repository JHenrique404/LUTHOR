import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { IpcChannels } from '@shared/ipc/contract'
import { createRepository } from './services/db/in-memory-repository'
import { createProviders } from './services/integrations/agent-provider'
import { SimulationEngine } from './services/simulation/simulation-engine'
import { registerIpcHandlers } from './ipc/register'

async function bootstrap(): Promise<void> {
  const repository = createRepository()
  const providers = createProviders()
  const seedSnapshot = await repository.getRunSnapshot()

  let mainWindow: BrowserWindow | null = null

  const engine = new SimulationEngine({
    snapshot: seedSnapshot,
    emit: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IpcChannels.simEvent, payload)
      }
    }
  })

  registerIpcHandlers(repository, engine, providers)

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    title: 'LUTHOR',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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
  mainWindow.on('closed', () => {
    engine.stop()
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  void bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void bootstrap()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
