import type { AgentProfile, RunSnapshot, Workspace } from '@shared/domain'
import { AgentProfileSchema, RunSnapshotSchema, WorkspaceSchema } from '@shared/domain'
import type { CreateProfileInput, UpdateProfileInput } from '@shared/ipc/contract'
import type { Repository } from './repository'
import { createSeedSnapshot, createSeedWorkspaces } from './seed'

/** Persistência em memória com seeds — caminho garantido da Fase 1. */
export class InMemoryRepository implements Repository {
  private workspaces: Workspace[]
  private snapshot: RunSnapshot

  constructor() {
    this.workspaces = createSeedWorkspaces()
    // Valida os seeds contra os schemas na inicialização: dado inválido quebra cedo.
    this.snapshot = RunSnapshotSchema.parse(createSeedSnapshot())
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return [...this.workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  }

  async registerWorkspace(path: string): Promise<Workspace> {
    const existing = this.workspaces.find((w) => w.path === path)
    if (existing) {
      existing.lastOpenedAt = Date.now()
      return existing
    }
    const segments = path.split(/[\\/]/).filter(Boolean)
    const workspace = WorkspaceSchema.parse({
      id: `ws-${Date.now().toString(36)}`,
      name: segments[segments.length - 1] ?? path,
      path,
      lastOpenedAt: Date.now()
    })
    this.workspaces.push(workspace)
    return workspace
  }

  async getRunSnapshot(): Promise<RunSnapshot> {
    return structuredClone(this.snapshot)
  }

  async listProfiles(): Promise<AgentProfile[]> {
    return structuredClone(this.snapshot.profiles)
  }

  async createProfile(input: CreateProfileInput): Promise<AgentProfile[]> {
    const profile = AgentProfileSchema.parse({
      id: `profile-${Date.now().toString(36)}-${this.snapshot.profiles.length}`,
      ...input
    })
    this.snapshot.profiles.push(profile)
    return structuredClone(this.snapshot.profiles)
  }

  async updateProfile(input: UpdateProfileInput): Promise<AgentProfile[]> {
    const profile = this.snapshot.profiles.find((p) => p.id === input.profileId)
    if (!profile) throw new Error(`Perfil não encontrado: ${input.profileId}`)
    const { profileId: _profileId, ...fields } = input
    Object.assign(profile, AgentProfileSchema.parse({ ...profile, ...fields }))
    return structuredClone(this.snapshot.profiles)
  }

  async duplicateProfile(profileId: string): Promise<AgentProfile[]> {
    const source = this.snapshot.profiles.find((p) => p.id === profileId)
    if (!source) throw new Error(`Perfil não encontrado: ${profileId}`)
    this.snapshot.profiles.push({
      ...structuredClone(source),
      id: `profile-${Date.now().toString(36)}-${this.snapshot.profiles.length}`,
      name: `${source.name} (cópia)`
    })
    return structuredClone(this.snapshot.profiles)
  }

  async deleteProfile(profileId: string): Promise<AgentProfile[]> {
    const index = this.snapshot.profiles.findIndex((p) => p.id === profileId)
    if (index < 0) throw new Error(`Perfil não encontrado: ${profileId}`)
    const inUseBy = this.snapshot.agents.filter((a) => a.profileId === profileId)
    if (inUseBy.length > 0) {
      throw new Error(
        `Perfil em uso pelo run ativo (${inUseBy.map((a) => a.name).join(', ')}) — não pode ser removido`
      )
    }
    this.snapshot.profiles.splice(index, 1)
    return structuredClone(this.snapshot.profiles)
  }
}

/**
 * Ponto de troca da persistência.
 * Fase 2: retornar SqliteRepository quando o runtime for validado.
 */
export function createRepository(): Repository {
  return new InMemoryRepository()
}
