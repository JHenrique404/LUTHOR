import type { RunState } from '../domain/schemas'

/**
 * Máquina de estados do Run.
 * Transições fora deste mapa são inválidas e devem ser rejeitadas
 * por qualquer motor (simulado hoje, real na Fase 2).
 */
export const RUN_TRANSITIONS: Record<RunState, RunState[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['running', 'awaiting_user', 'failed', 'cancelled'],
  running: ['awaiting_user', 'paused', 'verifying', 'failed', 'cancelled'],
  awaiting_user: ['running', 'paused', 'failed', 'cancelled'],
  paused: ['running', 'awaiting_user', 'cancelled'],
  verifying: ['running', 'paused', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: []
}

export function canTransition(from: RunState, to: RunState): boolean {
  return RUN_TRANSITIONS[from].includes(to)
}

/** Estados terminais: nenhuma transição sai deles. */
export function isTerminal(state: RunState): boolean {
  return RUN_TRANSITIONS[state].length === 0
}

export class InvalidTransitionError extends Error {
  constructor(from: RunState, to: RunState) {
    super(`Transição inválida de run: ${from} -> ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

/** Aplica transição validada; lança InvalidTransitionError se proibida. */
export function assertTransition(from: RunState, to: RunState): RunState {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
  return to
}
