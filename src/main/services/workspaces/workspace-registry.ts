import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'
import type { Workspace, WorkspaceOrigin } from '@shared/domain'
import { WorkspaceSchema } from '@shared/domain'
import type { WorkspacesState } from '@shared/ipc/contract'
import { pathKey } from './path-validation'

/**
 * Registro persistente de workspaces — Fase 2A.
 *
 * Substitui APENAS a parte de workspaces do repositório em memória da Fase 1.
 * Persistência em JSON versionado (workspaces.json em userData) com migrações
 * explícitas; run/perfis/simulação continuam no InMemoryRepository.
 *
 * O contrato WorkspaceRegistry mantém a testabilidade: os testes usam a
 * mesma implementação apontada para um diretório temporário.
 */

export interface RegisterWorkspaceInput {
  path: string
  origin: WorkspaceOrigin
  name?: string
}

export interface RegisterResult {
  workspace: Workspace
  alreadyRegistered: boolean
}

export interface WorkspaceRegistry {
  state(): WorkspacesState
  getActive(): Workspace | null
  find(workspaceId: string): Workspace | undefined
  /** Cadastra caminho JÁ validado/canonicalizado; deduplica por chave de caminho. */
  register(input: RegisterWorkspaceInput): Promise<RegisterResult>
  setActive(workspaceId: string): Promise<Workspace>
  /** Remove só o registro. Se o ativo sair, promove o mais recente restante. */
  remove(workspaceId: string): Promise<Workspace | null>
  /** Quantos registros de exemplo (origin: 'demo') existem. */
  countDemos(): number
  /** Remove SOMENTE registros origin:'demo'. Dados do usuário ficam intactos. */
  removeDemos(): Promise<WorkspacesState>
}

/** Versão atual do arquivo persistido. Incrementar exige nova migração abaixo. */
export const WORKSPACES_SCHEMA_VERSION = 1

const PersistedStateSchema = z.object({
  schemaVersion: z.literal(WORKSPACES_SCHEMA_VERSION),
  activeWorkspaceId: z.string().nullable(),
  workspaces: z.array(WorkspaceSchema)
})
type PersistedState = z.infer<typeof PersistedStateSchema>

/** Ids dos seeds demonstrativos da Fase 1 (para a migração v0 marcá-los como demo). */
const LEGACY_DEMO_IDS = new Set(['ws-meu-saas', 'ws-site-portfolio', 'ws-cli-tools'])

/**
 * Migrações: cada função leva o formato da versão N para N+1.
 * v0 = formato da Fase 1 (sem schemaVersion, sem origin/createdAt/ativo).
 */
/** Formato v0 (Fase 1): sem schemaVersion, origin, createdAt nem ativo. */
interface LegacyWorkspaceV0 {
  id?: unknown
  name?: unknown
  path?: unknown
  lastOpenedAt?: unknown
  createdAt?: unknown
}

const MIGRATIONS: Record<number, (raw: unknown) => unknown> = {
  0: (raw) => {
    const legacy = raw as { workspaces?: LegacyWorkspaceV0[] }
    const workspaces = (legacy.workspaces ?? []).map((ws) => ({
      ...ws,
      origin: LEGACY_DEMO_IDS.has(String(ws.id)) ? 'demo' : 'user',
      createdAt: ws.createdAt ?? ws.lastOpenedAt ?? 0
    }))
    const mostRecent = [...workspaces].sort(
      (a, b) => Number(b.lastOpenedAt ?? 0) - Number(a.lastOpenedAt ?? 0)
    )[0]
    return {
      schemaVersion: 1,
      activeWorkspaceId: mostRecent ? String(mostRecent.id) : null,
      workspaces
    }
  }
}

function migrateToCurrent(raw: unknown): PersistedState {
  let data = raw
  let version =
    typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
      ? Number((raw as { schemaVersion: unknown }).schemaVersion)
      : 0
  while (version < WORKSPACES_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version]
    if (!migrate) throw new Error(`Sem migração de workspaces da versão ${version}`)
    data = migrate(data)
    version++
  }
  return PersistedStateSchema.parse(data)
}

export interface JsonWorkspaceRegistryOptions {
  /** Diretório onde workspaces.json vive (produção: app.getPath('userData')). */
  dir: string
  /** Seeds aplicados só quando o arquivo ainda não existe. */
  seed?: () => Workspace[]
  now?: () => number
}

export class JsonWorkspaceRegistry implements WorkspaceRegistry {
  private data: PersistedState
  private readonly file: string
  private readonly now: () => number
  /** Serializa gravações: uma de cada vez, sempre com o estado mais novo. */
  private writeChain: Promise<void> = Promise.resolve()

  private constructor(file: string, data: PersistedState, now: () => number) {
    this.file = file
    this.data = data
    this.now = now
  }

  /** Carrega (migrando se preciso) ou cria o arquivo com os seeds demo. */
  static async open(options: JsonWorkspaceRegistryOptions): Promise<JsonWorkspaceRegistry> {
    const file = join(options.dir, 'workspaces.json')
    const now = options.now ?? Date.now
    let data: PersistedState | null = null

    try {
      const raw = await fs.readFile(file, 'utf8')
      data = migrateToCurrent(JSON.parse(raw))
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
      if (!missing) {
        // Arquivo corrompido: preserva para diagnóstico e recomeça com seeds.
        const backup = `${file}.corrupt-${now().toString(36)}`
        await fs.rename(file, backup).catch(() => {})
        console.warn(`[luthor] workspaces.json inválido — backup em ${basename(backup)}`)
      }
    }

    if (!data) {
      const seeds = options.seed?.() ?? []
      data = {
        schemaVersion: WORKSPACES_SCHEMA_VERSION,
        activeWorkspaceId: seeds[0]?.id ?? null,
        workspaces: seeds
      }
    }

    const registry = new JsonWorkspaceRegistry(file, data, now)
    await registry.persist()
    return registry
  }

  state(): WorkspacesState {
    return structuredClone({
      workspaces: [...this.data.workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
      activeWorkspaceId: this.data.activeWorkspaceId
    })
  }

  getActive(): Workspace | null {
    const active = this.data.workspaces.find((w) => w.id === this.data.activeWorkspaceId)
    return active ? structuredClone(active) : null
  }

  find(workspaceId: string): Workspace | undefined {
    const ws = this.data.workspaces.find((w) => w.id === workspaceId)
    return ws ? structuredClone(ws) : undefined
  }

  async register(input: RegisterWorkspaceInput): Promise<RegisterResult> {
    const key = pathKey(input.path)
    const existing = this.data.workspaces.find((w) => pathKey(w.path) === key)
    if (existing) {
      existing.lastOpenedAt = this.now()
      // Pasta real confirmada pelo usuário: um registro demo com o mesmo
      // caminho deixa de ser exemplo.
      if (input.origin === 'user' && existing.origin === 'demo') existing.origin = 'user'
      await this.persist()
      return { workspace: structuredClone(existing), alreadyRegistered: true }
    }

    const now = this.now()
    const workspace = WorkspaceSchema.parse({
      id: `ws-${now.toString(36)}-${this.data.workspaces.length}`,
      name: input.name ?? basename(input.path) ?? input.path,
      path: input.path,
      origin: input.origin,
      createdAt: now,
      lastOpenedAt: now
    })
    this.data.workspaces.push(workspace)
    await this.persist()
    return { workspace: structuredClone(workspace), alreadyRegistered: false }
  }

  async setActive(workspaceId: string): Promise<Workspace> {
    const workspace = this.data.workspaces.find((w) => w.id === workspaceId)
    if (!workspace) throw new Error(`Workspace não cadastrado: ${workspaceId}`)
    workspace.lastOpenedAt = this.now()
    this.data.activeWorkspaceId = workspace.id
    await this.persist()
    return structuredClone(workspace)
  }

  async remove(workspaceId: string): Promise<Workspace | null> {
    const index = this.data.workspaces.findIndex((w) => w.id === workspaceId)
    if (index < 0) throw new Error(`Workspace não cadastrado: ${workspaceId}`)
    this.data.workspaces.splice(index, 1)

    let promoted: Workspace | null = null
    if (this.data.activeWorkspaceId === workspaceId) {
      promoted =
        [...this.data.workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0] ?? null
      this.data.activeWorkspaceId = promoted?.id ?? null
    }
    await this.persist()
    return promoted ? structuredClone(promoted) : null
  }

  countDemos(): number {
    return this.data.workspaces.filter((w) => w.origin === 'demo').length
  }

  async removeDemos(): Promise<WorkspacesState> {
    const before = this.data.workspaces.length
    this.data.workspaces = this.data.workspaces.filter((w) => w.origin !== 'demo')
    // Se o ativo era demo, promove o workspace real mais recente (ou null).
    if (
      this.data.activeWorkspaceId &&
      !this.data.workspaces.some((w) => w.id === this.data.activeWorkspaceId)
    ) {
      this.data.activeWorkspaceId =
        [...this.data.workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0]?.id ?? null
    }
    if (this.data.workspaces.length !== before) await this.persist()
    return this.state()
  }

  /** Gravação atômica: escreve em .tmp e renomeia por cima (rename substitui no Windows). */
  private persist(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2)
    this.writeChain = this.writeChain.then(async () => {
      const tmp = `${this.file}.tmp`
      await fs.writeFile(tmp, payload, 'utf8')
      await fs.rename(tmp, this.file)
    })
    return this.writeChain
  }
}
