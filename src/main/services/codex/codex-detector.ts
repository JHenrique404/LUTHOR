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
  /**
   * Caminho completo do executável resolvido — USO EXCLUSIVO do main
   * (runner). O renderer recebe apenas binaryLabel (nome do arquivo).
   */
  binaryPath: string | null
  /** Nome do executável (seguro para UI/logs). */
  binaryLabel: string | null
  binarySource: 'auto' | 'manual' | null
  /** Classificação da falha de resolução, quando houver. */
  failureCode:
    | 'not_found'
    | 'shim_only'
    | 'not_executable'
    | 'timeout'
    | 'invalid_version'
    | null
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

/** Mensagens honestas por falha de resolução — sem stack trace, sem PATH. */
const FAILURE_MESSAGES: Record<NonNullable<CodexStatus['failureCode']>, string> = {
  not_found:
    'Codex CLI não encontrado. Instale a CLI ou escolha o executável em Conexões.',
  shim_only:
    'Codex foi encontrado no terminal, mas apenas como atalho (shim do NVM/npm) que o LUTHOR não pode executar. Escolha o codex.exe real ou redetecte.',
  not_executable:
    'Codex foi encontrado, mas o executável não pôde ser iniciado pelo LUTHOR (EPERM/EACCES). Escolha o codex.exe real em Conexões.',
  timeout: 'O executável do Codex não respondeu a tempo. Redetecte ou escolha outro executável.',
  invalid_version:
    'O executável encontrado respondeu de forma inesperada ao --version. Escolha o codex.exe real em Conexões.'
}

export interface CodexDetectorOptions {
  runCommand?: CommandRunner
  /** Resolvedor de binário; injetável nos testes. */
  resolveBinary?: () => Promise<{
    path: string | null
    source: 'auto' | 'manual' | null
    version: string | null
    failure: CodexStatus['failureCode']
    manualInvalid: boolean
  }>
}

export class CodexDetector {
  private cached: CodexStatus | null = null
  private readonly run: CommandRunner
  private readonly resolveBinary: NonNullable<CodexDetectorOptions['resolveBinary']>

  constructor(options: CodexDetectorOptions = {}) {
    this.run = options.runCommand ?? defaultCommandRunner
    this.resolveBinary =
      options.resolveBinary ??
      (async () => ({
        path: 'codex',
        source: 'auto',
        version: null,
        failure: null,
        manualInvalid: false
      }))
  }

  /** Última detecção (ou executa a primeira). */
  async status(): Promise<CodexStatus> {
    if (this.cached) return this.cached
    return this.refresh()
  }

  async refresh(): Promise<CodexStatus> {
    const checkedAt = Date.now()

    // 1. Resolver o executável REAL (nunca shims, nunca shell).
    const resolved = await this.resolveBinary()
    if (!resolved.path) {
      const failureCode = resolved.failure ?? 'not_found'
      const manualNote = resolved.manualInvalid
        ? ' O caminho manual configurado é inválido e foi ignorado.'
        : ''
      this.cached = {
        installed: false,
        version: null,
        authenticated: null,
        authDetail: null,
        capabilities: null,
        detail: `${FAILURE_MESSAGES[failureCode]}${manualNote}`,
        binaryPath: null,
        binaryLabel: null,
        binarySource: null,
        failureCode,
        checkedAt
      }
      return this.cached
    }

    const binary = resolved.path
    const binaryLabel = binary.includes('\\') || binary.includes('/')
      ? (binary.split(/[\\/]/).pop() ?? binary)
      : binary

    let version: string | null = resolved.version
    if (!version) {
      try {
        const res = await this.run(binary, ['--version'])
        if (res.code === 0) version = res.stdout.trim() || null
      } catch {
        version = null
      }
    }

    // Capacidades reais: parse do help de `exec` (nunca assumir flags).
    let capabilities: CodexCapabilities | null = null
    try {
      const help = await this.run(binary, ['exec', '--help'])
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
      const auth = await this.run(binary, ['login', 'status'])
      authenticated = auth.code === 0
      authDetail = (auth.stdout || auth.stderr).trim().split('\n')[0] || null
    } catch {
      authenticated = null
    }

    const sourceNote = resolved.source === 'manual' ? ' · executável manual' : ''
    const detail = !capabilities?.jsonOutput
      ? `Detectado (${version ?? 'versão desconhecida'}), mas sem as capacidades necessárias (--json em exec) — executor indisponível nesta versão.`
      : authenticated === false
        ? `Detectado (${version}). Não autenticado: rode "codex login" uma vez no seu terminal.`
        : authenticated === null
          ? `Detectado (${version}). Não foi possível verificar a autenticação.`
          : `Pronto (${version})${sourceNote}.`

    this.cached = {
      installed: true,
      version,
      authenticated,
      authDetail,
      capabilities,
      detail,
      binaryPath: binary,
      binaryLabel,
      binarySource: resolved.source,
      failureCode: null,
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
