import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { ZodType } from 'zod'
import { IpcChannels } from '@shared/ipc/contract'
import {
  AgentIdSchema,
  AnswerQuestionInputSchema,
  AnswerQuestionsBatchSchema,
  CreateProfileInputSchema,
  ProfileIdSchema,
  UpdateProfileInputSchema,
  UserDirectionInputSchema
} from '@shared/ipc/schemas'
import type { AgentProfile } from '@shared/domain'
import type { Repository } from '../services/db/repository'
import type { SimulationEngine } from '../services/simulation/simulation-engine'
import type { AgentProvider } from '../services/integrations/agent-provider'

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

export function registerIpcHandlers(
  repository: Repository,
  engine: SimulationEngine,
  providers: AgentProvider[]
): void {
  ipcMain.handle(IpcChannels.workspaceList, () => repository.listWorkspaces())

  // "Abrir workspace" apenas seleciona e registra uma pasta.
  // Não inicializa Git, não inspeciona nem executa nada dentro dela.
  ipcMain.handle(IpcChannels.workspaceOpenDialog, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Abrir workspace',
          properties: ['openDirectory']
        })
      : await dialog.showOpenDialog({ title: 'Abrir workspace', properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return repository.registerWorkspace(result.filePaths[0])
  })

  ipcMain.handle(IpcChannels.runSnapshot, () => engine.getSnapshot())
  ipcMain.handle(IpcChannels.simPauseAll, () => engine.pauseAll())
  ipcMain.handle(IpcChannels.simResumeAll, () => engine.resumeAll())

  ipcMain.handle(IpcChannels.simPauseAgent, (_e, agentId: unknown) =>
    engine.pauseAgent(parseIpc(AgentIdSchema, agentId, IpcChannels.simPauseAgent))
  )
  ipcMain.handle(IpcChannels.simResumeAgent, (_e, agentId: unknown) =>
    engine.resumeAgent(parseIpc(AgentIdSchema, agentId, IpcChannels.simResumeAgent))
  )
  ipcMain.handle(IpcChannels.simAnswerQuestion, (_e, input: unknown) =>
    engine.answerQuestion(parseIpc(AnswerQuestionInputSchema, input, IpcChannels.simAnswerQuestion))
  )
  ipcMain.handle(IpcChannels.simAnswerQuestions, (_e, inputs: unknown) =>
    engine.answerQuestions(
      parseIpc(AnswerQuestionsBatchSchema, inputs, IpcChannels.simAnswerQuestions)
    )
  )
  ipcMain.handle(IpcChannels.simUserDirection, (_e, input: unknown) =>
    engine.addUserDirection(parseIpc(UserDirectionInputSchema, input, IpcChannels.simUserDirection))
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
}
