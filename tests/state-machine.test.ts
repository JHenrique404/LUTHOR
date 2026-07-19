import { describe, expect, it } from 'vitest'
import { RunStateSchema } from '@shared/domain'
import {
  InvalidTransitionError,
  RUN_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal
} from '@shared/state-machine/run-state'

describe('máquina de estados do run', () => {
  it('permite o caminho feliz completo', () => {
    expect(canTransition('draft', 'planning')).toBe(true)
    expect(canTransition('planning', 'running')).toBe(true)
    expect(canTransition('running', 'awaiting_user')).toBe(true)
    expect(canTransition('awaiting_user', 'running')).toBe(true)
    expect(canTransition('running', 'verifying')).toBe(true)
    expect(canTransition('verifying', 'completed')).toBe(true)
  })

  it('permite pausar e retomar', () => {
    expect(canTransition('running', 'paused')).toBe(true)
    expect(canTransition('awaiting_user', 'paused')).toBe(true)
    expect(canTransition('paused', 'running')).toBe(true)
    expect(canTransition('paused', 'awaiting_user')).toBe(true)
  })

  it('rejeita transições inválidas', () => {
    expect(canTransition('draft', 'running')).toBe(false)
    expect(canTransition('completed', 'running')).toBe(false)
    expect(canTransition('failed', 'running')).toBe(false)
    expect(canTransition('cancelled', 'planning')).toBe(false)
    expect(canTransition('paused', 'completed')).toBe(false)
  })

  it('assertTransition lança em transição proibida', () => {
    expect(() => assertTransition('completed', 'running')).toThrow(InvalidTransitionError)
    expect(assertTransition('running', 'paused')).toBe('paused')
  })

  it('estados terminais não têm saída', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('running')).toBe(false)
  })

  it('cobre todos os estados do schema', () => {
    for (const state of RunStateSchema.options) {
      expect(RUN_TRANSITIONS[state]).toBeDefined()
    }
  })
})
