import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { ZodType } from 'zod'
import { IpcChannels } from '@shared/ipc/contract'
import {
  AgentIdSchema,
  AnswerQuestionInputSchema,
  AnswerQuestionsBatchSchema,
  CreateProfileInputSchema,
  NewTaskInputSchema,
  ProfileIdSchema,
  UpdateProfileInputSchema,
  UserDirectionInputSchema,
  WorkspaceIdSchema
} from '@shared/ipc/schemas'
import type { AgentProfile } from '@shared/domain'
import type { Repository } from '../services/db/repository'
import type { SimulationEngine } from '../services/simulation/simulation-engine'
import type { AgentProvider } from '../services/integrations/agent-provider'
import type { WorkspaceService } from '../services/workspaces/workspace-service'
import type { RunCoordinator } from '../services/run-coordinator'

/**
 * O main não confia nos tipos do preload/renderer: todo payload IPC
 * é validado em runtime com Zod antes de tocar em qualquer serviço.
 */
function parseIpc<T>(schema: ZodType<T>, value: unknown, channel: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
    throw new Error(`Payload IPC inválido em ${channel} — ${issues.join('; ')}`)
  }
  return result.data
}

export interface RegisterIpcDeps {
  repository: Repository
  /** Roteia comandos para o run ativo (simulado OU executor real). */
  coordinator: RunCoordinator
  /** Só para sincronizar perfis editados com a simulação. */
  simEngine: SimulationEngine
  providers: AgentProvider[]
  workspaces: WorkspaceService
  /** Reexecuta a detecção real da CLI (Fase 2B). */
  refreshConnections: () => Promise<void>
}

export function registerIpcHandlers(deps: RegisterIpcDeps): void {
  const { repository, coordinator, simEngine: engine, providers, workspaces } = deps
  ipcMain.handle(IpcChannels.workspaceState, () => workspaces.state())

  // "Abrir workspace" seleciona uma pasta no diálogo NATIVO; o caminho é
  // validado e registrado no main (WorkspaceService). Não inicializa Git,
  // não inspeciona nem executa nada dentro da pasta.
  ipcMain.handle(IpcChannels.workspaceOpenDialog, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Abrir workspace',
      buttonLabel: 'Usar esta pasta',
      properties: ['openDirectory' as const]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { status: 'cancelled' }
    return workspaces.openPath(result.filePaths[0])
  })

  ipcMain.handle(IpcChannels.workspaceSetActive, (_e, workspaceId: unknown) =>
    workspaces.setActive(parseIpc(WorkspaceIdSchema, workspaceId, IpcChannels.workspaceSetActive))
  )
  ipcMain.handle(IpcChannels.workspaceRemove, (_e, workspaceId: unknown) =>
    workspaces.remove(parseIpc(WorkspaceIdSchema, workspaceId, IpcChannels.workspaceRemove))
  )

  ipcMain.handle(IpcChannels.runSnapshot, () => coordinator.getSnapshot())
  ipcMain.handle(IpcChannels.simPauseAll, () => coordinator.pauseAll())
  ipcMain.handle(IpcChannels.simResumeAll, () => coordinator.resumeAll())
  ipcMain.handle(IpcChannels.simCancelRun, () => coordinator.cancelRun())

  ipcMain.handle(IpcChannels.simPauseAgent, (_e, agentId: unknown) =>
    coordinator.pauseAgent(parseIpc(AgentIdSchema, agentId, IpcChannels.simPauseAgent))
  )
  ipcMain.handle(IpcChannels.simResumeAgent, (_e, agentId: unknown) =>
    coordinator.resumeAgent(parseIpc(AgentIdSchema, agentId, IpcChannels.simResumeAgent))
  )
  ipcMain.handle(IpcChannels.simAnswerQuestion, (_e, input: unknown) =>
    coordinator.answerQuestion(
      parseIpc(AnswerQuestionInputSchema, input, IpcChannels.simAnswerQuestion)
    )
  )
  ipcMain.handle(IpcChannels.simAnswerQuestions, (_e, inputs: unknown) =>
    coordinator.answerQuestions(
      parseIpc(AnswerQuestionsBatchSchema, inputs, IpcChannels.simAnswerQuestions)
    )
  )
  ipcMain.handle(IpcChannels.simUserDirection, (_e, input: unknown) =>
    coordinator.addUserDirection(
      parseIpc(UserDirectionInputSchema, input, IpcChannels.simUserDirection)
    )
  )
  ipcMain.handle(IpcChannels.simNewTask, (_e, input: unknown) =>
    coordinator.startNewTask(parseIpc(NewTaskInputSchema, input, IpcChannels.simNewTask))
  )

  // Mutações de perfil também sincronizam a cópia do engine, para a
  // Agent Office refletir o perfil atualizado no próximo evento.
  const syncProfiles = (profiles: AgentProfile[]): AgentProfile[] => {
    engine.setProfiles(profiles)
    return profiles
  }

  ipcMain.handle(IpcChannels.profilesList, () => repository.listProfiles())
  ipcMain.handle(IpcChannels.profileCreate, async (_e, input: unknown) =>
    syncProfiles(
      await repository.createProfile(
        parseIpc(CreateProfileInputSchema, input, IpcChannels.profileCreate)
      )
    )
  )
  ipcMain.handle(IpcChannels.profileUpdate, async (_e, input: unknown) =>
    syncProfiles(
      await repository.updateProfile(
        parseIpc(UpdateProfileInputSchema, input, IpcChannels.profileUpdate)
      )
    )
  )
  ipcMain.handle(IpcChannels.profileDuplicate, async (_e, profileId: unknown) =>
    syncProfiles(
      await repository.duplicateProfile(
        parseIpc(ProfileIdSchema, profileId, IpcChannels.profileDuplicate)
      )
    )
  )
  ipcMain.handle(IpcChannels.profileDelete, async (_e, profileId: unknown) =>
    syncProfiles(
      await repository.deleteProfile(
        parseIpc(ProfileIdSchema, profileId, IpcChannels.profileDelete)
      )
    )
  )

  ipcMain.handle(IpcChannels.connectionsList, () =>
    Promise.all(providers.map((p) => p.getStatus()))
  )
  ipcMain.handle(IpcChannels.connectionsRefresh, async () => {
    await deps.refreshConnections()
    return Promise.all(providers.map((p) => p.getStatus()))
  })
}
