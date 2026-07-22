import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowLifecycle } from '../src/main/lifecycle/window-lifecycle'
import type { LifecycleHost } from '../src/main/lifecycle/window-lifecycle'
import { buildTrayMenuTemplate } from '../src/main/tray/tray-menu'
import type { TrayMenuHandlers } from '../src/main/tray/tray-menu'
import { SimulationEngine } from '../src/main/services/simulation/simulation-engine'
import { createSeedSnapshot } from '../src/main/services/db/seed'
import type { SimEventPayload } from '@shared/ipc/contract'

function createHost(): LifecycleHost & {
  calls: { hide: number; show: number; quit: number; notify: number }
} {
  const calls = { hide: 0, show: 0, quit: 0, notify: 0 }
  return {
    calls,
    hideWindow: () => calls.hide++,
    showWindow: () => calls.show++,
    quit: () => calls.quit++,
    notifyFirstHide: () => calls.notify++
  }
}

describe('WindowLifecycle — fechar minimiza para a bandeja', () => {
  it('X oculta a janela em vez de encerrar', () => {
    const host = createHost()
    const lifecycle = new WindowLifecycle(host)
    const prevented = lifecycle.handleWindowClose()
    expect(prevented).toBe(true)
    expect(host.calls.hide).toBe(1)
    expect(host.calls.quit).toBe(0)
  })

  it('notifica o usuário apenas na PRIMEIRA ocultação', () => {
    const host = createHost()
    const lifecycle = new WindowLifecycle(host)
    lifecycle.handleWindowClose()
    lifecycle.handleWindowClose()
    lifecycle.handleWindowClose()
    expect(host.calls.notify).toBe(1)
    expect(host.calls.hide).toBe(3)
  })

  it('saída explícita encerra de verdade e não volta a ocultar', () => {
    const host = createHost()
    const lifecycle = new WindowLifecycle(host)
    lifecycle.requestQuit()
    expect(host.calls.quit).toBe(1)
    // O close disparado pelo quit NÃO deve mais ser prevenido.
    expect(lifecycle.handleWindowClose()).toBe(false)
    expect(host.calls.hide).toBe(0)
  })

  it('before-quit do sistema também libera o fechamento real', () => {
    const host = createHost()
    const lifecycle = new WindowLifecycle(host)
    lifecycle.markQuitting()
    expect(lifecycle.handleWindowClose()).toBe(false)
  })

  it('ativar (clique na bandeja) restaura e foca a janela', () => {
    const host = createHost()
    const lifecycle = new WindowLifecycle(host)
    lifecycle.handleWindowClose()
    lifecycle.handleActivate()
    expect(host.calls.show).toBe(1)
  })
})

describe('menu da bandeja — template derivado do estado do run', () => {
  const handlers: TrayMenuHandlers = {
    onOpen: vi.fn(),
    onPauseAll: vi.fn(),
    onResumeAll: vi.fn(),
    onQuit: vi.fn()
  }
  const labels = (state: Parameters<typeof buildTrayMenuTemplate>[0]): (string | undefined)[] =>
    buildTrayMenuTemplate(state, handlers).map((i) => i.label)

  it('run executando: Pausar tudo presente, Retomar ausente', () => {
    expect(labels('running')).toContain('Pausar tudo')
    expect(labels('running')).not.toContain('Retomar tudo')
  })

  it('run pausado: Retomar tudo presente, Pausar ausente', () => {
    expect(labels('paused')).toContain('Retomar tudo')
    expect(labels('paused')).not.toContain('Pausar tudo')
  })

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'sem trabalho ativo (%s): pause/retomar ausentes',
    (state) => {
      expect(labels(state)).not.toContain('Pausar tudo')
      expect(labels(state)).not.toContain('Retomar tudo')
    }
  )

  it('Abrir e Sair sempre presentes, com separador antes de Sair', () => {
    const template = buildTrayMenuTemplate('running', handlers)
    expect(template[0].label).toBe('Abrir LUTHOR')
    expect(template[template.length - 1].label).toBe('Sair do LUTHOR')
    expect(template[template.length - 2].type).toBe('separator')
  })
})

describe('simulação continua com a janela oculta na bandeja', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ocultar não para o engine; reabrir mostra o estado atual', () => {
    const events: SimEventPayload[] = []
    const engine = new SimulationEngine({
      snapshot: createSeedSnapshot(),
      emit: (p) => events.push(p),
      tickMs: 1000
    })
    const host = createHost()
    const lifecycle = new WindowLifecycle(host)

    engine.start()
    vi.advanceTimersByTime(2000)
    const beforeHide = events.length

    // Usuário clica no X: janela some, engine NÃO é tocado.
    expect(lifecycle.handleWindowClose()).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(events.length).toBeGreaterThan(beforeHide)

    // Run pausado permanece pausado enquanto oculto.
    engine.pauseAll()
    const pausedCount = events.length
    vi.advanceTimersByTime(5000)
    expect(events.length).toBe(pausedCount)
    expect(engine.getRunState()).toBe('paused')

    // Reabrir pela bandeja: snapshot reflete o estado atual (pausado).
    lifecycle.handleActivate()
    expect(host.calls.show).toBe(1)
    expect(engine.getSnapshot().run.state).toBe('paused')
    engine.stop()
  })
})
