import { describe, expect, it } from 'vitest'
import { InMemoryRepository } from '../src/main/services/db/in-memory-repository'

describe('InMemoryRepository — CRUD de perfis (sessão apenas, nada persiste)', () => {
  it('cria perfil novo validado pelo schema', async () => {
    const repo = new InMemoryRepository()
    const profiles = await repo.createProfile({
      name: 'haiku-fast',
      provider: 'claude_code',
      model: 'claude-haiku',
      effortDefault: 'low',
      description: 'Perfil rápido para tarefas triviais.',
      active: true
    })
    expect(profiles).toHaveLength(5)
    expect(profiles.find((p) => p.name === 'haiku-fast')).toBeDefined()
  })

  it('duplica perfil com sufixo (cópia)', async () => {
    const repo = new InMemoryRepository()
    const profiles = await repo.duplicateProfile('codex-high')
    const copy = profiles.find((p) => p.name === 'codex-high (cópia)')
    expect(copy).toBeDefined()
    expect(copy?.id).not.toBe('codex-high')
    expect(copy?.model).toBe('codex')
  })

  it('atualiza nome, provider e ativo/inativo', async () => {
    const repo = new InMemoryRepository()
    const profiles = await repo.updateProfile({
      profileId: 'local-helper',
      name: 'ollama-helper',
      provider: 'local_node',
      active: false
    })
    const updated = profiles.find((p) => p.id === 'local-helper')
    expect(updated?.name).toBe('ollama-helper')
    expect(updated?.active).toBe(false)
  })

  it('remove perfil sem uso', async () => {
    const repo = new InMemoryRepository()
    const created = await repo.createProfile({
      name: 'descartavel',
      provider: 'codex',
      model: 'codex',
      effortDefault: 'medium',
      description: '',
      active: true
    })
    const id = created.find((p) => p.name === 'descartavel')!.id
    const after = await repo.deleteProfile(id)
    expect(after.find((p) => p.id === id)).toBeUndefined()
  })

  it('bloqueia remoção de perfil em uso por agente do run', async () => {
    const repo = new InMemoryRepository()
    await expect(repo.deleteProfile('sonnet-worker')).rejects.toThrow(/em uso/)
  })

  it('rejeita atualização que viola o schema', async () => {
    const repo = new InMemoryRepository()
    await expect(
      repo.updateProfile({ profileId: 'codex-high', name: '' })
    ).rejects.toThrow()
  })
})
