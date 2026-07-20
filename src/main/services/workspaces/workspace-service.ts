import type { Workspace } from '@shared/domain'
import type {
  OpenWorkspaceResult,
  WorkspaceMutationResult,
  WorkspacesState
} from '@shared/ipc/contract'
import type { PathValidator } from './path-validation'
import { validateWorkspacePath } from './path-validation'
import type { WorkspaceRegistry } from './workspace-registry'

/**
 * Regras de negócio de workspaces da Fase 2A, puras e testáveis
 * (sem Electron): validação de caminho, deduplicação via registry e a
 * política de UM workspace ativo por vez.
 *
 * Enquanto houver run simulado ativo (estado não terminal), a troca
 * destrutiva de workspace é bloqueada — concorrência entre workspaces
 * é fase futura.
 */

export interface WorkspaceServiceDeps {
  registry: WorkspaceRegistry
  /** true = run simulado em estado não terminal (running/paused/etc.). */
  isRunBusy: () => boolean
  /** Notifica o motor de simulação quando o workspace ativo muda. */
  onActiveChanged: (workspace: Workspace) => void
  /** Injetável nos testes; produção usa validação real de filesystem. */
  validatePath?: PathValidator
}

export const RUN_BUSY_MESSAGE =
  'Há um run simulado ativo neste workspace. Trocar de workspace com run ativo ' +
  '(concorrência entre workspaces) chega em uma fase futura — aguarde concluir ' +
  'ou cancele o run.'

export class WorkspaceService {
  private readonly registry: WorkspaceRegistry
  private readonly isRunBusy: () => boolean
  private readonly onActiveChanged: (workspace: Workspace) => void
  private readonly validatePath: PathValidator

  constructor(deps: WorkspaceServiceDeps) {
    this.registry = deps.registry
    this.isRunBusy = deps.isRunBusy
    this.onActiveChanged = deps.onActiveChanged
    this.validatePath = deps.validatePath ?? validateWorkspacePath
  }

  state(): WorkspacesState {
    return this.registry.state()
  }

  getActive(): Workspace | null {
    return this.registry.getActive()
  }

  /**
   * Caminho vindo do diálogo nativo: valida (absoluto/existente/diretório,
   * canonicalizado), registra com deduplicação e ativa quando permitido.
   */
  async openPath(rawPath: string): Promise<OpenWorkspaceResult> {
    const validation = await this.validatePath(rawPath)
    if (!validation.ok) {
      return { status: 'error', code: validation.code, message: validation.message }
    }

    const { workspace, alreadyRegistered } = await this.registry.register({
      path: validation.canonicalPath,
      origin: 'user'
    })

    const isActive = this.registry.state().activeWorkspaceId === workspace.id
    let activated = isActive
    if (!isActive && !this.isRunBusy()) {
      const active = await this.registry.setActive(workspace.id)
      this.onActiveChanged(active)
      activated = true
    }

    return {
      status: 'ok',
      workspace: this.registry.find(workspace.id) ?? workspace,
      alreadyRegistered,
      activated,
      state: this.registry.state()
    }
  }

  async setActive(workspaceId: string): Promise<WorkspaceMutationResult> {
    const target = this.registry.find(workspaceId)
    if (!target) {
      return { status: 'error', code: 'unknown_workspace', message: 'Workspace não cadastrado.' }
    }
    if (this.registry.state().activeWorkspaceId === workspaceId) {
      return { status: 'ok', state: this.registry.state() }
    }
    if (this.isRunBusy()) {
      return { status: 'error', code: 'blocked_by_active_run', message: RUN_BUSY_MESSAGE }
    }
    const active = await this.registry.setActive(workspaceId)
    this.onActiveChanged(active)
    return { status: 'ok', state: this.registry.state() }
  }

  /** Remove só o registro (nenhum arquivo é tocado). */
  async remove(workspaceId: string): Promise<WorkspaceMutationResult> {
    const target = this.registry.find(workspaceId)
    if (!target) {
      return { status: 'error', code: 'unknown_workspace', message: 'Workspace não cadastrado.' }
    }
    const isActive = this.registry.state().activeWorkspaceId === workspaceId
    if (isActive && this.isRunBusy()) {
      return { status: 'error', code: 'blocked_by_active_run', message: RUN_BUSY_MESSAGE }
    }
    const promoted = await this.registry.remove(workspaceId)
    if (promoted) this.onActiveChanged(promoted)
    return { status: 'ok', state: this.registry.state() }
  }
}
