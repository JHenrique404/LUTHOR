import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { CodexCapabilities } from './codex-detector'

/**
 * Runner do processo Codex — Fase 2B.
 *
 * Um único processo filho por vez, spawn SEM shell, cwd fixado no caminho
 * canônico do workspace ativo. Sandbox padrão: workspace-write (trabalho
 * apenas dentro do workspace; nada de flags perigosas que ignorem
 * aprovações/sandbox).
 *
 * Cancelamento: gracioso primeiro (kill padrão); encerramento FORÇADO da
 * árvore (taskkill /T /F no Windows) somente após FORCE_KILL_TIMEOUT_MS.
 */

export const FORCE_KILL_TIMEOUT_MS = 5_000
/** Linhas de saída maiores que isso são truncadas (proteção de memória). */
const MAX_LINE_LENGTH = 16_384

export type RunnerEvent =
  | { kind: 'started'; pid: number | null; args: string[] }
  | { kind: 'json'; raw: string; parsed: Record<string, unknown> | null }
  | { kind: 'stderr'; text: string }
  | { kind: 'exit'; code: number | null; signal: string | null; cancelled: boolean }

export interface SpawnedProcess {
  pid: number | undefined
  stdout: NodeJS.ReadableStream | null
  stderr: NodeJS.ReadableStream | null
  kill(signal?: NodeJS.Signals): boolean
  on(event: 'error', listener: (err: Error) => void): void
  on(event: 'close', listener: (code: number | null, signal: string | null) => void): void
}

export type SpawnFn = (command: string, args: string[], cwd: string) => SpawnedProcess

export const defaultSpawn: SpawnFn = (command, args, cwd) =>
  spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  }) as ChildProcess as SpawnedProcess

/** Mata a árvore de processos (Windows). Injetável nos testes. */
export type ForceKillFn = (pid: number) => void
export const defaultForceKill: ForceKillFn = (pid) => {
  // taskkill derruba filhos também (/T); necessário porque a CLI cria subprocessos.
  spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: false, windowsHide: true })
}

export interface CodexRunnerOptions {
  binary?: string
  spawnFn?: SpawnFn
  forceKill?: ForceKillFn
  forceKillTimeoutMs?: number
  now?: () => number
}

export interface StartOptions {
  prompt: string
  /** Caminho CANÔNICO do workspace ativo (validado pela Fase 2A). */
  cwd: string
  /**
   * Executável RESOLVIDO pelo CodexBinaryResolver (caminho absoluto do
   * codex.exe real, ou nome simples fora do Windows). O runner nunca volta
   * a usar a string "codex" quando a detecção achou o caminho completo.
   */
  binaryPath?: string
  capabilities: CodexCapabilities
  /** false = pasta sem repositório Git (usa --skip-git-repo-check). */
  isGitRepo: boolean
  /** Modelo aplicado via `-m` (só quando capabilities.modelFlag). null = padrão da CLI. */
  model?: string | null
  onEvent: (event: RunnerEvent) => void
}

export class CodexRunner {
  private readonly binary: string
  private readonly spawnFn: SpawnFn
  private readonly forceKill: ForceKillFn
  private readonly forceKillTimeoutMs: number

  private child: SpawnedProcess | null = null
  private cancelRequested = false
  private forceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: CodexRunnerOptions = {}) {
    this.binary = options.binary ?? 'codex'
    this.spawnFn = options.spawnFn ?? defaultSpawn
    this.forceKill = options.forceKill ?? defaultForceKill
    this.forceKillTimeoutMs = options.forceKillTimeoutMs ?? FORCE_KILL_TIMEOUT_MS
  }

  isRunning(): boolean {
    return this.child !== null
  }

  /** Monta os argumentos a partir das capacidades REAIS detectadas. */
  buildArgs(
    options: Pick<StartOptions, 'prompt' | 'cwd' | 'capabilities' | 'isGitRepo' | 'model'>
  ): string[] {
    const { capabilities } = options
    const args = ['exec']
    if (capabilities.jsonOutput) args.push('--json')
    if (capabilities.colorNever) args.push('--color', 'never')
    // Política padrão: trabalho SÓ dentro do workspace. Nunca danger-full-access,
    // nunca --dangerously-bypass-approvals-and-sandbox.
    if (capabilities.sandboxWorkspaceWrite) args.push('--sandbox', 'workspace-write')
    if (capabilities.cd) args.push('--cd', options.cwd)
    if (!options.isGitRepo && capabilities.skipGitRepoCheck) args.push('--skip-git-repo-check')
    // Modelo só quando a flag foi detectada E um modelo foi escolhido de fato.
    if (capabilities.modelFlag && options.model) args.push('--model', options.model)
    args.push(options.prompt)
    return args
  }

  start(options: StartOptions): void {
    if (this.child) throw new Error('Já existe um processo Codex em execução')
    this.cancelRequested = false
    const args = this.buildArgs(options)
    const child = this.spawnFn(options.binaryPath ?? this.binary, args, options.cwd)
    this.child = child

    options.onEvent({ kind: 'started', pid: child.pid ?? null, args })

    let stdoutBuffer = ''
    child.stdout?.on('data', (data: Buffer | string) => {
      stdoutBuffer += data.toString()
      let newline = stdoutBuffer.indexOf('\n')
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim()
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
        if (line.length > 0) this.emitJsonLine(line, options.onEvent)
        newline = stdoutBuffer.indexOf('\n')
      }
      // Linha gigante sem \n: descarta o excedente para não crescer sem limite.
      if (stdoutBuffer.length > MAX_LINE_LENGTH * 2) {
        stdoutBuffer = stdoutBuffer.slice(-MAX_LINE_LENGTH)
      }
    })
    child.stderr?.on('data', (data: Buffer | string) => {
      const text = data.toString().trim()
      if (text) options.onEvent({ kind: 'stderr', text: text.slice(0, MAX_LINE_LENGTH) })
    })
    child.on('error', (err) => {
      options.onEvent({ kind: 'stderr', text: `Falha ao iniciar o processo: ${err.message}` })
      this.finish(options.onEvent, null, 'spawn-error')
    })
    child.on('close', (code, signal) => this.finish(options.onEvent, code, signal))
  }

  /**
   * Cancelamento gracioso; força (árvore inteira) após o timeout documentado.
   * A CLI não suporta pausa — só interrupção.
   */
  cancel(): boolean {
    if (!this.child) return false
    if (this.cancelRequested) return true
    this.cancelRequested = true
    this.child.kill('SIGTERM')
    this.forceTimer = setTimeout(() => {
      const pid = this.child?.pid
      if (pid) this.forceKill(pid)
    }, this.forceKillTimeoutMs)
    return true
  }

  private emitJsonLine(line: string, onEvent: (e: RunnerEvent) => void): void {
    const raw = line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line
    let parsed: Record<string, unknown> | null = null
    try {
      const value = JSON.parse(line)
      parsed = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
    } catch {
      parsed = null
    }
    onEvent({ kind: 'json', raw, parsed })
  }

  private finish(
    onEvent: (e: RunnerEvent) => void,
    code: number | null,
    signal: string | null
  ): void {
    if (!this.child) return
    if (this.forceTimer) clearTimeout(this.forceTimer)
    this.forceTimer = null
    this.child = null
    onEvent({ kind: 'exit', code, signal, cancelled: this.cancelRequested })
  }
}
