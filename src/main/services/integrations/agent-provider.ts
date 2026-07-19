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

export function createProviders(): AgentProvider[] {
  return [
    new MockProvider(
      'claude_code',
      'Claude Code',
      'Integração com a CLI do Claude Code chega na Fase 2.'
    ),
    new MockProvider('codex', 'Codex', 'Integração com a CLI do Codex chega na Fase 2.'),
    new MockProvider(
      'local_node',
      'Node Local',
      'Execução local (ex.: Ollama) chega na Fase 2.'
    )
  ]
}
