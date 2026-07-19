import type { Agent } from '@shared/domain'
import { validateWriterIsolation } from '@shared/domain'

/**
 * Contrato da estratégia de isolamento de working copies (worktrees Git).
 *
 * Regra de domínio (válida já na Fase 1): dois agentes `writer` nunca
 * compartilham a mesma working copy. Na Fase 1 os worktreeRefs são
 * simulados; nenhuma operação Git real acontece.
 *
 * Fase 2: implementação real cria/remove `git worktree` por subtask.
 */
export interface WorktreeLease {
  ref: string
  /** Caminho da working copy isolada (simulado na Fase 1). */
  path: string
}

export interface WorktreeStrategy {
  acquire(agentId: string, baseRef: string): Promise<WorktreeLease>
  release(lease: WorktreeLease): Promise<void>
}

/** Implementação simulada: gera refs fictícios, sem tocar em Git. */
export class SimulatedWorktreeStrategy implements WorktreeStrategy {
  private seq = 0

  async acquire(agentId: string, baseRef: string): Promise<WorktreeLease> {
    const ref = `wt/${agentId}-${baseRef}-${++this.seq}`
    return { ref, path: `<simulado>/${ref}` }
  }

  async release(_lease: WorktreeLease): Promise<void> {
    // Fase 2: remover o worktree Git real.
  }
}

/** Lança se agentes writers violarem o isolamento de working copy. */
export function assertWriterIsolation(agents: Agent[]): void {
  const violations = validateWriterIsolation(agents)
  if (violations.length > 0) {
    throw new Error(`Violação de isolamento de escrita: ${violations.join('; ')}`)
  }
}
