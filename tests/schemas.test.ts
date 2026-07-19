import { describe, expect, it } from 'vitest'
import {
  AgentSchema,
  RunSnapshotSchema,
  validateWriterIsolation,
  verifiedProgress
} from '@shared/domain'
import { createSeedProfiles, createSeedSnapshot } from '../src/main/services/db/seed'

describe('schemas de domínio', () => {
  it('snapshot seedado passa na validação completa', () => {
    const snapshot = createSeedSnapshot()
    expect(() => RunSnapshotSchema.parse(snapshot)).not.toThrow()
  })

  it('seeds incluem os 4 perfis de execução obrigatórios', () => {
    const ids = createSeedProfiles().map((p) => p.id)
    expect(ids).toEqual(
      expect.arrayContaining(['opus-orchestrator', 'sonnet-worker', 'codex-high', 'local-helper'])
    )
  })

  it('rejeita estado de agente inválido', () => {
    const agent = createSeedSnapshot().agents[0]
    expect(() => AgentSchema.parse({ ...agent, state: 'dancing' })).toThrow()
  })

  it('progresso é derivado dos steps: 3 de 5 verificadas no seed', () => {
    const { steps } = createSeedSnapshot()
    expect(verifiedProgress(steps)).toEqual({ verified: 3, total: 5 })
  })
})

describe('isolamento de escrita (preparação para worktrees)', () => {
  it('seed respeita: writers com worktrees distintos', () => {
    const { agents } = createSeedSnapshot()
    expect(validateWriterIsolation(agents)).toEqual([])
  })

  it('detecta dois writers na mesma working copy', () => {
    const { agents } = createSeedSnapshot()
    const shared = agents.map((a) =>
      a.writeScope === 'writer' ? { ...a, worktreeRef: 'wt/mesma-copia' } : a
    )
    expect(validateWriterIsolation(shared).length).toBeGreaterThan(0)
  })

  it('detecta writer sem worktreeRef', () => {
    const { agents } = createSeedSnapshot()
    const broken = agents.map((a) =>
      a.id === 'ag-backend' ? { ...a, worktreeRef: null } : a
    )
    expect(validateWriterIsolation(broken)).toHaveLength(1)
  })
})
