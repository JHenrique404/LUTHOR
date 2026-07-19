import { z } from 'zod'
import { EffortSchema, ProviderKindSchema } from '../domain/schemas'

/**
 * Schemas de validação em runtime dos payloads IPC.
 * O main NUNCA confia nos tipos TypeScript do preload/renderer:
 * todo argumento que chega por ipcMain.handle passa por estes schemas.
 */

/** pauseAgent / resumeAgent */
export const AgentIdSchema = z.string().min(1).max(128)

export const AnswerQuestionInputSchema = z
  .object({
    questionId: z.string().min(1).max(128),
    optionId: z.string().min(1).max(128).optional(),
    freeText: z.string().max(2000).optional()
  })
  .strict()
export type AnswerQuestionInput = z.infer<typeof AnswerQuestionInputSchema>

/** Envio em lote da Caixa de Decisões. */
export const AnswerQuestionsBatchSchema = z.array(AnswerQuestionInputSchema).min(1).max(50)

/** Composer do orquestrador: nova tarefa ou instrução para o run. */
export const UserDirectionInputSchema = z
  .object({
    kind: z.enum(['new_task', 'instruction']),
    scopeType: z.enum(['orchestrator', 'all', 'agent']),
    agentId: AgentIdSchema.optional(),
    text: z.string().min(3).max(2000)
  })
  .strict()
  .refine((v) => v.scopeType !== 'agent' || v.agentId !== undefined, {
    message: 'agentId é obrigatório quando o escopo é um agente específico'
  })
export type UserDirectionInput = z.infer<typeof UserDirectionInputSchema>

const ProfileFieldsSchema = z.object({
  name: z.string().min(1).max(60),
  provider: ProviderKindSchema,
  model: z.string().min(1).max(120),
  effortDefault: EffortSchema,
  description: z.string().max(300),
  active: z.boolean()
})

export const CreateProfileInputSchema = ProfileFieldsSchema.strict()
export type CreateProfileInput = z.infer<typeof CreateProfileInputSchema>

export const UpdateProfileInputSchema = ProfileFieldsSchema.partial()
  .extend({ profileId: z.string().min(1).max(128) })
  .strict()
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>

export const ProfileIdSchema = z.string().min(1).max(128)
