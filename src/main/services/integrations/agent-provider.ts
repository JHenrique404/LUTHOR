import type { ProviderKind } from '@shared/domain'
import type { ConnectionStatus } from '@shared/ipc/contract'

/**
 * Contrato de integração com provedores de agentes.
 *
 * Fase 1: apenas status mockados ("não configurado"). Nenhuma detecção de
 * binário, chamada externa, CLI ou chave de API acontece aqui.
 *
 * Fase 2 estende esta interface com o ciclo de vida real:
 *   startAgent(profile, subtask, worktree) / streamEvents() / cancel()
 * — a fonte de eventos do SimulationEngine é substituída por estes streams.
 */
export interface AgentProvider {
  readonly kind: ProviderKind
  getStatus(): Promise<ConnectionStatus>
}

class MockProvider implements AgentProvider {
  constructor(
    readonly kind: ProviderKind,
    private readonly name: string,
    private readonly detail: string
  ) {}

  async getStatus(): Promise<ConnectionStatus> {
    return { id: this.kind, name: this.name, status: 'not_configured', detail: this.detail }
  }
}

/**
 * Provider REAL do Codex (Fase 2B): status derivado da detecção da CLI no
 * main (binário/versão/auth). Nunca expõe credenciais — só o estado.
 */
export interface CodexStatusSource {
  status(): Promise<{
    installed: boolean
    version: string | null
    authenticated: boolean | null
    detail: string
    binaryLabel: string | null
    binarySource: 'auto' | 'manual' | null
    capabilities: {
      jsonOutput: boolean
      sandboxWorkspaceWrite: boolean
      cd: boolean
      skipGitRepoCheck: boolean
      colorNever: boolean
    } | null
  }>
  refresh(): Promise<unknown>
}

export class CodexCliProvider implements AgentProvider {
  readonly kind = 'codex' as const

  constructor(private readonly source: CodexStatusSource) {}

  async getStatus(): Promise<ConnectionStatus> {
    const s = await this.source.status()
    const caps = s.capabilities
    // Só o RESUMO das capacidades vai ao renderer — nunca PATH/env.
    const capabilitiesSummary = caps
      ? [
          caps.jsonOutput ? 'exec --json' : null,
          caps.sandboxWorkspaceWrite ? 'sandbox workspace-write' : null,
          caps.cd ? '--cd (workspace fixo)' : null,
          caps.skipGitRepoCheck ? '--skip-git-repo-check' : null
        ].filter((c): c is string => c !== null)
      : []
    return {
      id: 'codex',
      name: 'Codex',
      status: !s.installed ? 'not_configured' : s.authenticated === false ? 'needs_auth' : 'configured',
      detail: s.detail,
      version: s.version,
      authenticated: s.authenticated,
      binaryLabel: s.binaryLabel,
      binarySource: s.binarySource,
      capabilitiesSummary
    }
  }
}

export function createProviders(codexSource?: CodexStatusSource): AgentProvider[] {
  return [
    new MockProvider(
      'claude_code',
      'Claude Code',
      'Integração com a CLI do Claude Code chega em fase futura.'
    ),
    codexSource
      ? new CodexCliProvider(codexSource)
      : new MockProvider('codex', 'Codex', 'Detecção da CLI indisponível.'),
    new MockProvider(
      'local_node',
      'Node Local',
      'Execução local (ex.: Ollama) chega em fase futura.'
    )
  ]
}
