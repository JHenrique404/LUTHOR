import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimEventPayload } from '@shared/ipc/contract'
import { CodexDetector } from '../src/main/services/codex/codex-detector'
import type { CommandResult } from '../src/main/services/codex/codex-detector'
import { CodexBinaryResolver } from '../src/main/services/codex/codex-binary-resolver'
import { CodexRunner, FORCE_KILL_TIMEOUT_MS } from '../src/main/services/codex/codex-runner'
import type { RunnerEvent, SpawnedProcess } from '../src/main/services/codex/codex-runner'
import {
  CodexRunManager,
  extractAgentMessage,
  extractModel,
  summarizeCliEvent
} from '../src/main/services/codex/codex-run-manager'
import { TranscriptWriter } from '../src/main/services/codex/transcript'
import { RunCoordinator } from '../src/main/services/run-coordinator'
import { SimulationEngine } from '../src/main/services/simulation/simulation-engine'
import { WindowLifecycle } from '../src/main/lifecycle/window-lifecycle'
import { buildTrayMenuTemplate } from '../src/main/tray/tray-menu'
import { createSeedSnapshot, createSeedWorkspaces } from '../src/main/services/db/seed'
import type { CodexStatus } from '../src/main/services/codex/codex-detector'

// ── Fakes ──────────────────────────────────────────────────────────────────

class FakeProcess extends EventEmitter implements SpawnedProcess {
  pid = 4242
  stdout = new EventEmitter() as unknown as NodeJS.ReadableStream
  stderr = new EventEmitter() as unknown as NodeJS.ReadableStream
  killedWith: string[] = []

  kill(signal?: NodeJS.Signals): boolean {
    this.killedWith.push(signal ?? 'SIGTERM')
    return true
  }

  pushStdout(text: string): void {
    ;(this.stdout as unknown as EventEmitter).emit('data', Buffer.from(text))
  }

  pushStderr(text: string): void {
    ;(this.stderr as unknown as EventEmitter).emit('data', Buffer.from(text))
  }

  exit(code: number | null, signal: string | null = null): void {
    this.emit('close', code, signal)
  }
}

const CAPS = {
  jsonOutput: true,
  sandboxWorkspaceWrite: true,
  cd: true,
  skipGitRepoCheck: true,
  colorNever: true
}

const READY_STATUS: CodexStatus = {
  installed: true,
  version: 'codex-cli 0.144.5',
  authenticated: true,
  authDetail: 'Logged in using ChatGPT',
  capabilities: CAPS,
  detail: 'Pronto (codex-cli 0.144.5).',
  binaryPath: 'C:\\real\\bin\\codex.exe',
  binaryLabel: 'codex.exe',
  binarySource: 'auto',
  failureCode: null,
  checkedAt: Date.now()
}

function fakeGit(dirty: boolean): (cmd: string, args: string[]) => Promise<CommandResult> {
  return async (_cmd, args) => {
    if (args.includes('rev-parse')) return { code: 0, stdout: 'true\n', stderr: '' }
    if (args.includes('status')) return { code: 0, stdout: dirty ? ' M file.ts\n' : '', stderr: '' }
    return { code: 1, stdout: '', stderr: 'unknown' }
  }
}

interface ManagerHarness {
  manager: CodexRunManager
  proc: FakeProcess
  events: SimEventPayload[]
  dir: string
  spawnedCommands: string[]
}

function createManager(options: { dirty?: boolean; forceKill?: (pid: number) => void } = {}): ManagerHarness {
  const proc = new FakeProcess()
  const events: SimEventPayload[] = []
  const spawnedCommands: string[] = []
  const dir = mkdtempSync(join(tmpdir(), 'luthor-codex-'))
  const runner = new CodexRunner({
    spawnFn: (command) => {
      spawnedCommands.push(command)
      return proc
    },
    forceKill: options.forceKill ?? (() => {})
  })
  const manager = new CodexRunManager({
    emit: (p) => events.push(p),
    dataDir: dir,
    runner,
    runCommand: fakeGit(options.dirty ?? false)
  })
  return { manager, proc, events, dir, spawnedCommands }
}

const workspace = { ...createSeedWorkspaces()[0], path: 'C:\\projetos\\meu-app' }

// ── Detector ───────────────────────────────────────────────────────────────

const RESOLVED_EXE = 'C:\\real\\bin\\codex.exe'

describe('CodexDetector — nada é assumido sobre a CLI', () => {
  it('CLI ausente (ENOENT): installed false com instrução clara', async () => {
    const detector = new CodexDetector({
      resolveBinary: async () => ({
        path: null,
        source: null,
        version: null,
        failure: 'not_found',
        manualInvalid: false
      })
    })
    const status = await detector.refresh()
    expect(status.installed).toBe(false)
    expect(status.failureCode).toBe('not_found')
    expect(status.detail).toMatch(/não encontrado/i)
    expect((await detector.isUsable()).ok).toBe(false)
  })

  it('shim do NVM (EPERM): mensagem útil apontando para o codex.exe real', async () => {
    const detector = new CodexDetector({
      resolveBinary: async () => ({
        path: null,
        source: null,
        version: null,
        failure: 'shim_only',
        manualInvalid: true
      })
    })
    const status = await detector.refresh()
    expect(status.installed).toBe(false)
    expect(status.failureCode).toBe('shim_only')
    expect(status.detail).toMatch(/shim do NVM/i)
    expect(status.detail).toMatch(/codex\.exe real/i)
    expect(status.detail).toMatch(/manual configurado é inválido/i)
  })

  it('autenticação ausente: needs auth, sem login automático', async () => {
    const detector = new CodexDetector({
      resolveBinary: async () => ({
        path: RESOLVED_EXE,
        source: 'auto',
        version: 'codex-cli 0.144.5',
        failure: null,
        manualInvalid: false
      }),
      runCommand: async (cmd, args) => {
        expect(cmd).toBe(RESOLVED_EXE) // detecta com o caminho RESOLVIDO
        if (args[0] === 'exec') {
          return { code: 0, stdout: '--json --sandbox workspace-write --cd --skip-git-repo-check --color never', stderr: '' }
        }
        if (args[0] === 'login') return { code: 1, stdout: 'Not logged in\n', stderr: '' }
        return { code: 1, stdout: '', stderr: '' }
      }
    })
    const status = await detector.refresh()
    expect(status.installed).toBe(true)
    expect(status.authenticated).toBe(false)
    expect(status.detail).toMatch(/codex login/)
    expect(status.binaryLabel).toBe('codex.exe')
    expect((await detector.isUsable()).ok).toBe(false)
  })

  it('CLI pronta: capacidades do --help real; caminho manual sinalizado', async () => {
    const detector = new CodexDetector({
      resolveBinary: async () => ({
        path: RESOLVED_EXE,
        source: 'manual',
        version: 'codex-cli 0.144.5',
        failure: null,
        manualInvalid: false
      }),
      runCommand: async (_cmd, args) => {
        if (args[0] === 'exec') {
          return { code: 0, stdout: '--json --sandbox [read-only, workspace-write] --cd --skip-git-repo-check --color never', stderr: '' }
        }
        if (args[0] === 'login') return { code: 0, stdout: 'Logged in using ChatGPT\n', stderr: '' }
        return { code: 1, stdout: '', stderr: '' }
      }
    })
    const status = await detector.refresh()
    expect(status.version).toBe('codex-cli 0.144.5')
    expect(status.capabilities).toEqual(CAPS)
    expect(status.authenticated).toBe(true)
    expect(status.binaryPath).toBe(RESOLVED_EXE)
    expect(status.binarySource).toBe('manual')
    expect(status.detail).toMatch(/executável manual/)
    expect((await detector.isUsable()).ok).toBe(true)
  })
})

// ── Resolvedor de binário ──────────────────────────────────────────────────

describe('CodexBinaryResolver — Windows com shims do NVM/npm', () => {
  const SHIM_DIR = 'C:\\nvm4w\\nodejs'
  const REAL_EXE =
    'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\vendor\\bin\\codex.exe'

  interface FakeWorld {
    whereLines: string[]
    files: Set<string>
    packageExes: string[]
    /** caminho -> comportamento do --version */
    probes: Record<string, { code: number; stdout: string } | { errCode: string }>
  }

  function makeResolver(world: FakeWorld, manual: string | null = null): CodexBinaryResolver {
    return new CodexBinaryResolver({
      platform: 'win32',
      getManualPath: async () => manual,
      fsAdapter: {
        realpath: async (p) => p,
        isFile: async (p) => world.files.has(p),
        findCodexExeUnder: async (dir) =>
          dir.includes('@openai') ? world.packageExes : []
      },
      runCommand: async (cmd, _args) => {
        if (cmd === 'where.exe') {
          return { code: world.whereLines.length > 0 ? 0 : 1, stdout: world.whereLines.join('\r\n'), stderr: '' }
        }
        const probe = world.probes[cmd]
        if (!probe) {
          const err = new Error('spawn EPERM') as NodeJS.ErrnoException
          err.code = 'EPERM'
          throw err
        }
        if ('errCode' in probe) {
          const err = new Error(`spawn ${probe.errCode}`) as NodeJS.ErrnoException
          err.code = probe.errCode
          throw err
        }
        return { code: probe.code, stdout: probe.stdout, stderr: '' }
      }
    })
  }

  it('where com shim E .exe: seleciona exclusivamente o .exe que responde', async () => {
    const exe = 'C:\\tools\\codex.exe'
    const resolver = makeResolver({
      whereLines: [`${SHIM_DIR}\\codex`, `${SHIM_DIR}\\codex.cmd`, exe],
      files: new Set([exe]),
      packageExes: [],
      probes: { [exe]: { code: 0, stdout: 'codex-cli 0.144.5' } }
    })
    const result = await resolver.resolve()
    expect(result).toMatchObject({ path: exe, source: 'auto', version: 'codex-cli 0.144.5' })
  })

  it('PATH só com shims: encontra o codex.exe dentro do pacote @openai/codex', async () => {
    const resolver = makeResolver({
      whereLines: [`${SHIM_DIR}\\codex`, `${SHIM_DIR}\\codex.cmd`],
      files: new Set([REAL_EXE]),
      packageExes: [REAL_EXE],
      probes: { [REAL_EXE]: { code: 0, stdout: 'codex-cli 0.144.5' } }
    })
    const result = await resolver.resolve()
    expect(result.path).toBe(REAL_EXE)
    expect(result.source).toBe('auto')
  })

  it('EPERM no alias: falha classificada como not_executable (não "ausente")', async () => {
    const badExe = 'C:\\tools\\codex.exe'
    const resolver = makeResolver({
      whereLines: [badExe],
      files: new Set([badExe]),
      packageExes: [],
      probes: { [badExe]: { errCode: 'EPERM' } }
    })
    const result = await resolver.resolve()
    expect(result.path).toBeNull()
    expect(result.failure).toBe('not_executable')
  })

  it('só shims, sem exe em lugar nenhum: shim_only', async () => {
    const resolver = makeResolver({
      whereLines: [`${SHIM_DIR}\\codex`, `${SHIM_DIR}\\codex.cmd`],
      files: new Set(),
      packageExes: [],
      probes: {}
    })
    const result = await resolver.resolve()
    expect(result.failure).toBe('shim_only')
  })

  it('caminho manual VÁLIDO entra como fallback quando a automática falha', async () => {
    const manual = 'C:\\escolhido\\codex.exe'
    const resolver = makeResolver(
      {
        whereLines: [`${SHIM_DIR}\\codex`],
        files: new Set([manual]),
        packageExes: [],
        probes: { [manual]: { code: 0, stdout: 'codex-cli 0.144.5' } }
      },
      manual
    )
    const result = await resolver.resolve()
    expect(result).toMatchObject({ path: manual, source: 'manual' })
  })

  it('caminho manual INVÁLIDO (não .exe / inexistente) é ignorado e sinalizado', async () => {
    const resolver = makeResolver(
      {
        whereLines: [`${SHIM_DIR}\\codex`],
        files: new Set(),
        packageExes: [],
        probes: {}
      },
      'C:\\escolhido\\codex.cmd'
    )
    const result = await resolver.resolve()
    expect(result.path).toBeNull()
    expect(result.manualInvalid).toBe(true)
  })

  it('detecção automática saudável IGNORA o caminho manual', async () => {
    const auto = 'C:\\tools\\codex.exe'
    const resolver = makeResolver(
      {
        whereLines: [auto],
        files: new Set([auto, 'C:\\manual\\codex.exe']),
        packageExes: [],
        probes: { [auto]: { code: 0, stdout: 'codex-cli 0.144.5' } }
      },
      'C:\\manual\\codex.exe'
    )
    const result = await resolver.resolve()
    expect(result.path).toBe(auto)
    expect(result.source).toBe('auto')
  })
})

// ── Runner ─────────────────────────────────────────────────────────────────

describe('CodexRunner — processo isolado e cancelamento', () => {
  it('monta args seguros: sandbox workspace-write, cwd, sem flags perigosas', () => {
    const runner = new CodexRunner({ spawnFn: () => new FakeProcess() })
    const args = runner.buildArgs({
      prompt: 'listar arquivos',
      cwd: 'C:\\projetos\\meu-app',
      capabilities: CAPS,
      isGitRepo: true
    })
    expect(args).toEqual([
      'exec',
      '--json',
      '--color',
      'never',
      '--sandbox',
      'workspace-write',
      '--cd',
      'C:\\projetos\\meu-app',
      'listar arquivos'
    ])
    expect(args.join(' ')).not.toMatch(/danger|bypass/)
  })

  it('pasta sem Git ganha --skip-git-repo-check (capacidade real)', () => {
    const runner = new CodexRunner({ spawnFn: () => new FakeProcess() })
    const args = runner.buildArgs({
      prompt: 'x',
      cwd: 'C:\\p',
      capabilities: CAPS,
      isGitRepo: false
    })
    expect(args).toContain('--skip-git-repo-check')
  })

  it('streaming: linhas JSONL viram eventos; stderr é capturado', () => {
    const proc = new FakeProcess()
    const runner = new CodexRunner({ spawnFn: () => proc })
    const events: RunnerEvent[] = []
    runner.start({
      prompt: 'x',
      cwd: 'C:\\p',
      capabilities: CAPS,
      isGitRepo: true,
      onEvent: (e) => events.push(e)
    })
    proc.pushStdout('{"type":"turn.started","model":"gpt-5.3-codex"}\n{"type":"item.comp')
    proc.pushStdout('leted","item":{"type":"agent_message","text":"feito"}}\n')
    proc.pushStderr('aviso qualquer')
    proc.exit(0)

    const jsonEvents = events.filter((e) => e.kind === 'json')
    expect(jsonEvents).toHaveLength(2)
    expect(jsonEvents[0]).toMatchObject({ parsed: { model: 'gpt-5.3-codex' } })
    expect(events.some((e) => e.kind === 'stderr')).toBe(true)
    expect(events.at(-1)).toMatchObject({ kind: 'exit', code: 0, cancelled: false })
  })

  it('cancelamento gracioso: SIGTERM primeiro; força só após timeout', () => {
    vi.useFakeTimers()
    const proc = new FakeProcess()
    const forceKill = vi.fn()
    const runner = new CodexRunner({ spawnFn: () => proc, forceKill })
    runner.start({ prompt: 'x', cwd: 'C:\\p', capabilities: CAPS, isGitRepo: true, onEvent: () => {} })

    runner.cancel()
    expect(proc.killedWith).toEqual(['SIGTERM'])
    expect(forceKill).not.toHaveBeenCalled()

    // Processo ignora o SIGTERM: força após o timeout documentado.
    vi.advanceTimersByTime(FORCE_KILL_TIMEOUT_MS)
    expect(forceKill).toHaveBeenCalledWith(4242)
    vi.useRealTimers()
  })

  it('processo que encerra a tempo NÃO é forçado', () => {
    vi.useFakeTimers()
    const proc = new FakeProcess()
    const forceKill = vi.fn()
    const runner = new CodexRunner({ spawnFn: () => proc, forceKill })
    const events: RunnerEvent[] = []
    runner.start({ prompt: 'x', cwd: 'C:\\p', capabilities: CAPS, isGitRepo: true, onEvent: (e) => events.push(e) })
    runner.cancel()
    proc.exit(null, 'SIGTERM')
    vi.advanceTimersByTime(FORCE_KILL_TIMEOUT_MS * 2)
    expect(forceKill).not.toHaveBeenCalled()
    expect(events.at(-1)).toMatchObject({ kind: 'exit', cancelled: true })
    vi.useRealTimers()
  })
})

// ── Manager ────────────────────────────────────────────────────────────────

describe('CodexRunManager — run real na Agent Office', () => {
  it('inicia com workspace válido: snapshot real, 1 worker, sem dados inventados', async () => {
    const { manager } = createManager()
    const snapshot = await manager.start({ text: 'Ajustar README', workspace, cliStatus: READY_STATUS })
    expect(snapshot.run.executor).toBe('codex_cli')
    expect(snapshot.run.state).toBe('running')
    expect(snapshot.agents).toHaveLength(1)
    expect(snapshot.agents[0]).toMatchObject({ name: 'Codex', profileId: 'codex-high' })
    expect(snapshot.steps).toHaveLength(0) // nunca inventar progresso
    expect(manager.isBusy()).toBe(true)
  })

  it('modelo só aparece quando a CLI informa; resposta final vem do agent_message', async () => {
    const { manager, proc } = createManager()
    await manager.start({ text: 'Tarefa', workspace, cliStatus: READY_STATUS })
    proc.pushStdout('{"type":"turn.started","model":"gpt-5.3-codex"}\n')
    proc.pushStdout('{"type":"item.completed","item":{"type":"agent_message","text":"Resumo final"}}\n')
    proc.exit(0)
    const snapshot = manager.getSnapshot()!
    expect(snapshot.run.state).toBe('completed')
    expect(snapshot.events.some((e) => e.message.includes('gpt-5.3-codex'))).toBe(true)
    expect(snapshot.events.at(-1)?.message).toContain('Resumo final')
  })

  it('runner usa o executável RESOLVIDO, não a string "codex"', async () => {
    const { manager, spawnedCommands } = createManager()
    await manager.start({ text: 'Tarefa', workspace, cliStatus: READY_STATUS })
    expect(spawnedCommands).toEqual(['C:\\real\\bin\\codex.exe'])
  })

  it('mudanças Git pré-existentes geram aviso explícito (verificação só leitura)', async () => {
    const { manager } = createManager({ dirty: true })
    const snapshot = await manager.start({ text: 'Tarefa', workspace, cliStatus: READY_STATUS })
    expect(snapshot.events.some((e) => /ANTES deste run/.test(e.message))).toBe(true)
  })

  it('término inesperado (exit != 0) marca o run como failed', async () => {
    const { manager, proc } = createManager()
    await manager.start({ text: 'Tarefa', workspace, cliStatus: READY_STATUS })
    proc.exit(1)
    const snapshot = manager.getSnapshot()!
    expect(snapshot.run.state).toBe('failed')
    expect(snapshot.agents[0].state).toBe('failed')
    expect(snapshot.events.some((e) => e.message.includes('exit 1'))).toBe(true)
  })

  it('cancelar: cancelRequested visível ("cancelando"), depois cancelled', async () => {
    const { manager, proc } = createManager()
    await manager.start({ text: 'Tarefa', workspace, cliStatus: READY_STATUS })
    manager.cancel()
    expect(manager.getSnapshot()!.run.cancelRequested).toBe(true)
    expect(manager.getSnapshot()!.run.state).toBe('running') // ainda aguardando
    proc.exit(null, 'SIGTERM')
    expect(manager.getSnapshot()!.run.state).toBe('cancelled')
    expect(manager.isBusy()).toBe(false)
  })

  it('pausa não é fingida: gera log explicando que só há cancelamento', async () => {
    const { manager } = createManager()
    await manager.start({ text: 'Tarefa', workspace, cliStatus: READY_STATUS })
    const snapshot = manager.notePauseUnsupported()!
    expect(snapshot.events.at(-1)?.message).toMatch(/não é suportada/i)
    expect(snapshot.run.state).toBe('running')
  })

  it('transcript persistido com metadados e SEM variáveis de ambiente', async () => {
    const { manager, proc, dir } = createManager({ dirty: true })
    await manager.start({ text: 'Tarefa persistida', workspace, cliStatus: READY_STATUS })
    proc.pushStdout('{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}\n')
    proc.exit(0)
    await manager.flush()

    const runId = manager.getSnapshot()!.run.id
    const transcript = readFileSync(join(dir, 'runs', runId, 'transcript.jsonl'), 'utf8')
    const meta = JSON.parse(readFileSync(join(dir, 'runs', runId, 'metadata.json'), 'utf8'))
    expect(transcript).toContain('agent_message')
    expect(transcript).not.toContain('PATH=')
    expect(meta).toMatchObject({
      provider: 'codex_cli',
      exitCode: 0,
      preExistingGitChanges: true,
      cliVersion: 'codex-cli 0.144.5'
    })
  })

  it('run real continua com a janela oculta na bandeja', async () => {
    const { manager, proc, events } = createManager()
    await manager.start({ text: 'Tarefa', workspace, cliStatus: READY_STATUS })
    const host = {
      hideWindow: vi.fn(),
      showWindow: vi.fn(),
      quit: vi.fn(),
      notifyFirstHide: vi.fn()
    }
    const lifecycle = new WindowLifecycle(host)
    expect(lifecycle.handleWindowClose()).toBe(true) // X = ocultar, nunca matar

    const before = events.length
    proc.pushStdout('{"type":"item.started","item":{"title":"trabalhando oculto"}}\n')
    expect(events.length).toBeGreaterThan(before)
    expect(host.quit).not.toHaveBeenCalled()
    expect(manager.isBusy()).toBe(true)
  })
})

// ── Coordinator ────────────────────────────────────────────────────────────

describe('RunCoordinator — um executor real por vez', () => {
  function createCoordinator(opts: { usable?: boolean; hasWorkspace?: boolean } = {}) {
    const sim = new SimulationEngine({ snapshot: createSeedSnapshot(), emit: () => {} })
    const { manager, proc } = createManager()
    const detector = {
      isUsable: async () =>
        (opts.usable ?? true) ? { ok: true } : { ok: false, reason: 'CLI ausente' },
      status: async () => READY_STATUS
    } as unknown as CodexDetector
    const coordinator = new RunCoordinator(sim, manager, detector, () =>
      (opts.hasWorkspace ?? true) ? workspace : null
    )
    return { coordinator, proc, sim }
  }

  it('modo codex cria run real; snapshot ativo passa a ser o real', async () => {
    const { coordinator } = createCoordinator()
    const snapshot = await coordinator.startNewTask({ text: 'Tarefa real', mode: 'codex' })
    expect(snapshot.run.executor).toBe('codex_cli')
    expect(coordinator.getExecutor()).toBe('codex_cli')
    expect(coordinator.isRealRunBusy()).toBe(true)
  })

  it('sem workspace ativo: bloqueia com erro claro', async () => {
    const { coordinator } = createCoordinator({ hasWorkspace: false })
    await expect(coordinator.startNewTask({ text: 'x'.repeat(5), mode: 'codex' })).rejects.toThrow(
      /workspace ativo/i
    )
  })

  it('CLI indisponível: bloqueia com o motivo real', async () => {
    const { coordinator } = createCoordinator({ usable: false })
    await expect(coordinator.startNewTask({ text: 'x'.repeat(5), mode: 'codex' })).rejects.toThrow(
      /CLI ausente/
    )
  })

  it('segundo run (real ou simulado) bloqueado enquanto o real executa', async () => {
    const { coordinator } = createCoordinator()
    await coordinator.startNewTask({ text: 'Tarefa real', mode: 'codex' })
    await expect(coordinator.startNewTask({ text: 'Outra', mode: 'codex' })).rejects.toThrow(/REAL/)
    await expect(coordinator.startNewTask({ text: 'Sim', mode: 'standard' })).rejects.toThrow(/REAL/)
  })

  it('pauseAll em run real não pausa: loga aviso e mantém estado', async () => {
    const { coordinator } = createCoordinator()
    await coordinator.startNewTask({ text: 'Tarefa real', mode: 'codex' })
    const snapshot = coordinator.pauseAll()
    expect(snapshot.run.state).toBe('running')
    expect(snapshot.events.at(-1)?.message).toMatch(/não é suportada/i)
  })

  it('após o run real terminar, novo run simulado volta a funcionar', async () => {
    const { coordinator, proc } = createCoordinator()
    await coordinator.startNewTask({ text: 'Tarefa real', mode: 'codex' })
    proc.exit(0)
    const snapshot = await coordinator.startNewTask({ text: 'Simulada', mode: 'standard' })
    expect(snapshot.run.executor).toBe('simulated')
    expect(coordinator.getExecutor()).toBe('simulated')
  })
})

// ── Tray com executor real ─────────────────────────────────────────────────

describe('tray — run real oferece Cancelar, nunca Pausar', () => {
  const handlers = {
    onOpen: vi.fn(),
    onPauseAll: vi.fn(),
    onResumeAll: vi.fn(),
    onQuit: vi.fn(),
    onCancelRun: vi.fn()
  }

  it('executor codex_cli em execução: "Cancelar run" presente, pausas ausentes', () => {
    const labels = buildTrayMenuTemplate('running', handlers, 'codex_cli').map((i) => i.label)
    expect(labels).toContain('Cancelar run')
    expect(labels).not.toContain('Pausar tudo')
    expect(labels).not.toContain('Retomar tudo')
  })

  it('simulação continua com Pausar/Retomar', () => {
    expect(buildTrayMenuTemplate('running', handlers).map((i) => i.label)).toContain('Pausar tudo')
  })
})

// ── Transcript isolado ─────────────────────────────────────────────────────

describe('TranscriptWriter — limite de tamanho', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'luthor-transcript-'))
  })

  it('corta no limite de bytes com marcador de truncamento', async () => {
    const writer = new TranscriptWriter(dir, 'run-x', 200)
    writer.append(JSON.stringify({ a: 'x'.repeat(80) }))
    writer.append(JSON.stringify({ b: 'y'.repeat(80) }))
    writer.append(JSON.stringify({ c: 'z'.repeat(80) })) // estoura o limite
    writer.writeMeta({
      runId: 'run-x',
      taskTitle: 't',
      workspacePath: 'C:\\p',
      provider: 'codex_cli',
      cliVersion: null,
      startedAt: 1
    })
    await writer.flush()

    const content = readFileSync(join(dir, 'runs', 'run-x', 'transcript.jsonl'), 'utf8')
    expect(content).toContain('truncado')
    expect(content).not.toContain('z'.repeat(80))
    const meta = JSON.parse(readFileSync(join(dir, 'runs', 'run-x', 'metadata.json'), 'utf8'))
    expect(meta.truncated).toBe(true)
  })

  it('extratores conservadores: null quando não há dado', () => {
    expect(extractModel(null)).toBeNull()
    expect(extractModel({ foo: 1 })).toBeNull()
    expect(extractAgentMessage({ type: 'x' })).toBeNull()
    expect(summarizeCliEvent({ type: 'turn.started' })).toBe('[turn.started]')
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// existsSync usado só para robustez de diagnóstico em caso de falha.
void existsSync
