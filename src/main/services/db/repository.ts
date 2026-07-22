import type { AgentProfile, RunSnapshot } from '@shared/domain'
import type { CreateProfileInput, UpdateProfileInput } from '@shared/ipc/contract'

/**
 * Contrato de persistência do LUTHOR (run demo + perfis).
 *
 * Fase 1: InMemoryRepository com dados seedados (caminho garantido do MVP).
 * Fase 2A: workspaces saíram daqui para o registro persistente em
 * services/workspaces/ (JSON versionado com migrações). Perfis e snapshot
 * do run demo continuam em memória; SQLite (./schema.sql) segue como opção
 * futura implementando esta MESMA interface via createRepository().
 */
export interface Repository {
  getRunSnapshot(): Promise<RunSnapshot>
  listProfiles(): Promise<AgentProfile[]>
  createProfile(input: CreateProfileInput): Promise<AgentProfile[]>
  updateProfile(input: UpdateProfileInput): Promise<AgentProfile[]>
  duplicateProfile(profileId: string): Promise<AgentProfile[]>
  /** Rejeita remoção de perfil em uso por um agente do run ativo. */
  deleteProfile(profileId: string): Promise<AgentProfile[]>
}
