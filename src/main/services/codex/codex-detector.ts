import { spawn } from 'node:child_process'

/**
 * Detecção do Codex CLI — Fase 2B.
 *
 * Nada é assumido sobre a CLI: presença, versão e capacidades vêm de
 * `codex --version`, `codex exec --help` e `codex login status` (todas
 * operações de leitura). Sem login automático, sem tokens armazenados —
 * a autenticação é do usuário, uma vez, no terminal dele.
 */

export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
}

/** Executor de comando injetável (testes usam fakes; nunca shell). */
export type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs?: number
) => Promise<CommandResult>

export interface CodexCapabilities {
  /** `--json` (eventos JSONL no stdout). */
  jsonOutput: boolean
  /** `--sandbox <mode>` com workspace-write disponível. */
  sandboxWorkspaceWrite: boolean
  /** `--cd <DIR>` para fixar a raiz de trabalho. */
  cd: boolean
  /** `--skip-git-repo-check` (necessário para pasta sem Git). */
  skipGitRepoCheck: boolean
  /** `--color never` para saída limpa. */
  colorNever: boolean
}

export interface CodexStatus {
  installed: boolean
  version: string | null
  /** null = checagem de auth indisponível nesta CLI. */
  authenticated: boolean | null
  /** Texto de status de auth informado pela CLI (sem credenciais). */
  authDetail: string | null
  capabilities: CodexCapabilities | null
  /** Mensagem resumida para a UI. */
  detail: string
  checkedAt: number
}

export const defaultCommandRunner: CommandRunner = (command, args, timeoutMs = 15_000) =>
  new Promise((resolve, reject) => {
    // shell: false — argumentos nunca passam por interpretação de shell.
    const child = spawn(command, args, { shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Comando excedeu ${timeoutMs}ms: ${command} ${args.join(' ')}`))
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })

export class CodexDetector {
  private cached: CodexStatus | null = null

  constructor(
    private readonly run: CommandRunner = defaultCommandRunner,
    private readonly binary = 'codex'
  ) {}

  /** Última detecção (ou executa a primeira). */
  async status(): Promise<CodexStatus> {
    if (this.cached) return this.cached
    return this.refresh()
  }

  async refresh(): Promise<CodexStatus> {
    const checkedAt = Date.now()

    let version: string | null = null
    try {
      const res = await this.run(this.binary, ['--version'])
      if (res.code === 0) version = res.stdout.trim() || null
    } catch {
      version = null
    }
    if (!version) {
      this.cached = {
        installed: false,
        version: null,
        authenticated: null,
        authDetail: null,
        capabilities: null,
        detail:
          'Codex CLI não encontrado no PATH. Instale a CLI do Codex e recarregue a detecção.',
        checkedAt
      }
      return this.cached
    }

    // Capacidades reais: parse do help de `exec` (nunca assumir flags).
    let capabilities: CodexCapabilities | null = null
    try {
      const help = await this.run(this.binary, ['exec', '--help'])
      const text = `${help.stdout}\n${help.stderr}`
      capabilities = {
        jsonOutput: /--json\b/.test(text),
        sandboxWorkspaceWrite: /--sandbox\b/.test(text) && /workspace-write/.test(text),
        cd: /--cd\b/.test(text),
        skipGitRepoCheck: /--skip-git-repo-check\b/.test(text),
        colorNever: /--color\b/.test(text) && /\bnever\b/.test(text)
      }
    } catch {
      capabilities = null
    }

    // Auth: `codex login status` é leitura; exit 0 = autenticado.
    let authenticated: boolean | null = null
    let authDetail: string | null = null
    try {
      const auth = await this.run(this.binary, ['login', 'status'])
      authenticated = auth.code === 0
      authDetail = (auth.stdout || auth.stderr).trim().split('\n')[0] || null
    } catch {
      authenticated = null
    }

    const detail = !capabilities?.jsonOutput
      ? `Detectado (${version}), mas sem suporte a --json em exec — executor indisponível nesta versão.`
      : authenticated === false
        ? `Detectado (${version}). Não autenticado: rode "codex login" uma vez no seu terminal.`
        : authenticated === null
          ? `Detectado (${version}). Não foi possível verificar a autenticação.`
          : `Pronto (${version}).`

    this.cached = {
      installed: true,
      version,
      authenticated,
      authDetail,
      capabilities,
      detail,
      checkedAt
    }
    return this.cached
  }

  /** Executor utilizável: instalado + JSONL + (auth ok ou não verificável). */
  async isUsable(): Promise<{ ok: boolean; reason?: string }> {
    const s = await this.status()
    if (!s.installed) return { ok: false, reason: s.detail }
    if (!s.capabilities?.jsonOutput || !s.capabilities.cd) {
      return { ok: false, reason: s.detail }
    }
    if (s.authenticated === false) return { ok: false, reason: s.detail }
    return { ok: true }
  }
}
