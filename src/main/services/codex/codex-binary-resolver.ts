import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { CommandResult, CommandRunner } from './codex-detector'
import { defaultCommandRunner } from './codex-detector'

/**
 * Resolvedor seguro do executável Codex — Fase 2B (fix Windows).
 *
 * Problema real: no Windows com NVM/npm, o PATH expõe shims (`codex`,
 * `codex.cmd`, `codex.ps1`) que o Electron não consegue executar com
 * `shell: false` (EPERM) — e nós NUNCA habilitamos shell nem executamos
 * `.cmd`/`.bat`/`.ps1` com o prompt do usuário.
 *
 * Estratégia (sem shell em nenhum passo):
 * 1. `where.exe codex` lista candidatos; preferimos exclusivamente arquivos
 *    existentes, canônicos e com extensão `.exe`.
 * 2. Se o PATH só tem shims npm, procuramos `codex.exe` DENTRO do próprio
 *    pacote `@openai/codex` ao lado do shim (varredura limitada ao pacote —
 *    nenhuma leitura ampla do disco).
 * 3. Cada candidato é provado com `--version`; o primeiro que responder vence.
 * 4. Caminho manual (Conexões) entra como FALLBACK quando a detecção
 *    automática falha. Persistimos só o caminho — nunca tokens/env.
 */

export type ResolveFailureCode =
  | 'not_found'
  | 'shim_only'
  | 'not_executable'
  | 'timeout'
  | 'invalid_version'

export interface ResolveResult {
  /** Caminho canônico do executável utilizável (null = nada resolvido). */
  path: string | null
  source: 'auto' | 'manual' | null
  version: string | null
  failure: ResolveFailureCode | null
  /** Havia caminho manual configurado, mas inválido/sem resposta. */
  manualInvalid: boolean
}

export interface ResolverFs {
  realpath(p: string): Promise<string>
  isFile(p: string): Promise<boolean>
  /** Busca LIMITADA por arquivos `codex.exe` sob `dir` (pacote npm do codex). */
  findCodexExeUnder(dir: string, maxDepth: number): Promise<string[]>
}

export const defaultResolverFs: ResolverFs = {
  realpath: (p) => fs.realpath(p),
  isFile: async (p) => {
    try {
      return (await fs.stat(p)).isFile()
    } catch {
      return false
    }
  },
  findCodexExeUnder: async (dir, maxDepth) => {
    const found: string[] = []
    async function walk(current: string, depth: number): Promise<void> {
      if (depth > maxDepth || found.length >= 5) return
      let entries
      try {
        entries = await fs.readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = join(current, entry.name)
        if (entry.isFile() && entry.name.toLowerCase() === 'codex.exe') found.push(full)
        else if (entry.isDirectory()) await walk(full, depth + 1)
      }
    }
    await walk(dir, 0)
    return found
  }
}

export interface CodexBinaryResolverOptions {
  runCommand?: CommandRunner
  platform?: NodeJS.Platform
  fsAdapter?: ResolverFs
  /** Caminho manual persistido (Conexões). */
  getManualPath?: () => Promise<string | null>
  probeTimeoutMs?: number
}

type ProbeResult =
  | { ok: true; version: string }
  | { ok: false; code: 'not_executable' | 'timeout' | 'invalid_version' | 'missing' }

export class CodexBinaryResolver {
  private readonly runCommand: CommandRunner
  private readonly platform: NodeJS.Platform
  private readonly fsAdapter: ResolverFs
  private readonly getManualPath: () => Promise<string | null>
  private readonly probeTimeoutMs: number

  constructor(options: CodexBinaryResolverOptions = {}) {
    this.runCommand = options.runCommand ?? defaultCommandRunner
    this.platform = options.platform ?? process.platform
    this.fsAdapter = options.fsAdapter ?? defaultResolverFs
    this.getManualPath = options.getManualPath ?? (async () => null)
    this.probeTimeoutMs = options.probeTimeoutMs ?? 10_000
  }

  /** Prova um candidato com `--version` (sem shell) e classifica a falha. */
  private async probe(binaryPath: string): Promise<ProbeResult> {
    let result: CommandResult
    try {
      result = await this.runCommand(binaryPath, ['--version'], this.probeTimeoutMs)
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') return { ok: false, code: 'missing' }
      if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'UNKNOWN') {
        return { ok: false, code: 'not_executable' }
      }
      if (/excedeu|timeout/i.test(err.message ?? '')) return { ok: false, code: 'timeout' }
      return { ok: false, code: 'not_executable' }
    }
    const version = result.stdout.trim()
    if (result.code === 0 && /codex/i.test(version)) return { ok: true, version }
    return { ok: false, code: 'invalid_version' }
  }

  /** Candidatos `.exe` do Windows: `where.exe` + pacote npm ao lado dos shims. */
  private async windowsCandidates(): Promise<{ exes: string[]; sawShims: boolean }> {
    let lines: string[] = []
    try {
      const where = await this.runCommand('where.exe', ['codex'], this.probeTimeoutMs)
      if (where.code === 0) {
        lines = where.stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      }
    } catch {
      lines = []
    }

    const exes: string[] = []
    const shimDirs = new Set<string>()
    for (const line of lines) {
      if (extname(line).toLowerCase() === '.exe') {
        if (await this.fsAdapter.isFile(line)) {
          exes.push(await this.fsAdapter.realpath(line).catch(() => line))
        }
      } else {
        shimDirs.add(dirname(line))
      }
    }

    // PATH só com shims npm: o binário real vive dentro do pacote @openai/codex.
    if (exes.length === 0) {
      for (const dir of shimDirs) {
        const packageDir = join(dir, 'node_modules', '@openai', 'codex')
        const found = await this.fsAdapter.findCodexExeUnder(packageDir, 8)
        for (const exe of found) {
          exes.push(await this.fsAdapter.realpath(exe).catch(() => exe))
        }
      }
    }
    return { exes: [...new Set(exes)], sawShims: shimDirs.size > 0 }
  }

  async resolve(): Promise<ResolveResult> {
    let failure: ResolveFailureCode | null = null

    // ── Detecção automática ─────────────────────────────────────────────
    if (this.platform === 'win32') {
      const { exes, sawShims } = await this.windowsCandidates()
      for (const exe of exes) {
        const probe = await this.probe(exe)
        if (probe.ok) {
          return { path: exe, source: 'auto', version: probe.version, failure: null, manualInvalid: false }
        }
        if (probe.code === 'timeout') failure = 'timeout'
        else if (probe.code === 'invalid_version') failure ??= 'invalid_version'
        else if (probe.code === 'not_executable') failure ??= 'not_executable'
      }
      if (!failure) {
        if (exes.length === 0 && sawShims) failure = 'shim_only'
        else if (exes.length === 0) {
          // Último recurso: CreateProcess resolve `codex.exe` fora do where.
          const probe = await this.probe('codex')
          if (probe.ok) {
            return { path: 'codex', source: 'auto', version: probe.version, failure: null, manualInvalid: false }
          }
          failure =
            probe.code === 'missing'
              ? 'not_found'
              : probe.code === 'timeout'
                ? 'timeout'
                : probe.code === 'invalid_version'
                  ? 'invalid_version'
                  : 'not_executable'
        }
      }
    } else {
      // Fallback simples fora do Windows: o próprio nome no PATH.
      const probe = await this.probe('codex')
      if (probe.ok) {
        return { path: 'codex', source: 'auto', version: probe.version, failure: null, manualInvalid: false }
      }
      failure =
        probe.code === 'missing'
          ? 'not_found'
          : probe.code === 'timeout'
            ? 'timeout'
            : probe.code === 'invalid_version'
              ? 'invalid_version'
              : 'not_executable'
    }

    // ── Fallback manual (só quando a automática falhou) ─────────────────
    let manualInvalid = false
    const manual = await this.getManualPath()
    if (manual) {
      const validExt = this.platform !== 'win32' || extname(manual).toLowerCase() === '.exe'
      if (validExt && (await this.fsAdapter.isFile(manual))) {
        const canonical = await this.fsAdapter.realpath(manual).catch(() => manual)
        const probe = await this.probe(canonical)
        if (probe.ok) {
          return {
            path: canonical,
            source: 'manual',
            version: probe.version,
            failure: null,
            manualInvalid: false
          }
        }
      }
      manualInvalid = true
    }

    return { path: null, source: null, version: null, failure: failure ?? 'not_found', manualInvalid }
  }
}

/** Rótulo seguro para UI/logs: só o nome do arquivo, nunca o PATH inteiro. */
export function binaryLabel(path: string | null): string | null {
  if (!path) return null
  return basename(path)
}
