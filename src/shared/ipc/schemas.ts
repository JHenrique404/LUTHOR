import { z } from 'zod'
import { EffortSchema, ProviderKindSchema } from '../domain/schemas'

/**
 * Schemas de validação em runtime dos payloads IPC.
 * O main NUNCA confia nos tipos TypeScript do preload/renderer:
 * todo argumento que chega por ipcMain.handle passa por estes schemas.
 */

/** pauseAgent / resumeAgent */
export const AgentIdSchema = z.string().min(1).max(128)

/** setActive / remove de workspaces. */
export const WorkspaceIdSchema = z.string().min(1).max(128)

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

/** Referência de contexto validada (caminho relativo ao workspace). */
export const ContextRefSchema = z
  .object({
    relPath: z
      .string()
      .min(1)
      .max(1024)
      // Nunca absoluto nem escapando do workspace.
      .refine((p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.split('/').includes('..'), {
        message: 'relPath precisa ser relativo ao workspace (sem "..").'
      }),
    kind: z.enum(['file', 'folder'])
  })
  .strict()

/**
 * "Nova tarefa": cria um NOVO run no workspace ativo.
 * mode 'standard' = simulação sequencial; 'squad_demo' = demo de squad
 * simulada; 'codex' = EXECUTOR REAL via Codex CLI (Fase 2B).
 */
export const NewTaskInputSchema = z
  .object({
    text: z.string().min(3).max(2000),
    mode: z.enum(['standard', 'squad_demo', 'codex']),
    /** "Continuar a partir deste run": vínculo conceitual mockado com o run anterior. */
    continuedFromRunId: z.string().min(1).max(128).optional(),
    /** Codex: modelo escolhido (só aplicado se a CLI aceitar). */
    codexModel: z.string().min(1).max(120).optional(),
    /** Codex: referências de contexto @arquivo/@pasta (já validadas no picker). */
    contextRefs: z.array(ContextRefSchema).max(50).optional()
  })
  .strict()
export type NewTaskInput = z.infer<typeof NewTaskInputSchema>

/** Escolha de contexto no composer (picker nativo). */
export const PickContextInputSchema = z.object({ kind: z.enum(['file', 'folder']) }).strict()
export type PickContextInput = z.infer<typeof PickContextInputSchema>

/** Consulta do autocomplete `@` (prefixo relativo ao workspace). */
export const SuggestContextInputSchema = z
  .object({ query: z.string().max(256) })
  .strict()
export type SuggestContextInput = z.infer<typeof SuggestContextInputSchema>

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
