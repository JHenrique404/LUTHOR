import type { AgentProfile, RunSnapshot, Workspace } from '@shared/domain'
import type { CreateProfileInput, UpdateProfileInput } from '@shared/ipc/contract'

/**
 * Contrato de persistência do LUTHOR.
 *
 * Fase 1: InMemoryRepository com dados seedados (caminho garantido do MVP).
 * Fase 2: SqliteRepository implementando esta MESMA interface sobre SQLite
 * (schema preparado em ./schema.sql). A troca é feita em createRepository()
 * sem tocar em IPC nem renderer.
 */
export interface Repository {
  listWorkspaces(): Promise<Workspace[]>
  registerWorkspace(path: string): Promise<Workspace>
  getRunSnapshot(): Promise<RunSnapshot>
  listProfiles(): Promise<AgentProfile[]>
  createProfile(input: CreateProfileInput): Promise<AgentProfile[]>
  updateProfile(input: UpdateProfileInput): Promise<AgentProfile[]>
  duplicateProfile(profileId: string): Promise<AgentProfile[]>
  /** Rejeita remoção de perfil em uso por um agente do run ativo. */
  deleteProfile(profileId: string): Promise<AgentProfile[]>
}
