import { describe, expect, it } from 'vitest'
import {
  AgentIdSchema,
  AnswerQuestionInputSchema,
  UpdateProfileInputSchema
} from '@shared/ipc/schemas'

describe('validação em runtime dos payloads IPC', () => {
  it('AgentIdSchema aceita id válido e rejeita lixo', () => {
    expect(AgentIdSchema.safeParse('ag-backend').success).toBe(true)
    expect(AgentIdSchema.safeParse('').success).toBe(false)
    expect(AgentIdSchema.safeParse(42).success).toBe(false)
    expect(AgentIdSchema.safeParse({ id: 'ag-backend' }).success).toBe(false)
    expect(AgentIdSchema.safeParse('x'.repeat(200)).success).toBe(false)
  })

  it('AnswerQuestionInput aceita opção, texto livre ou ambos', () => {
    expect(
      AnswerQuestionInputSchema.safeParse({ questionId: 'q-1', optionId: 'opt-a' }).success
    ).toBe(true)
    expect(
      AnswerQuestionInputSchema.safeParse({ questionId: 'q-1', freeText: '12 horas' }).success
    ).toBe(true)
  })

  it('AnswerQuestionInput rejeita payload malformado', () => {
    expect(AnswerQuestionInputSchema.safeParse({}).success).toBe(false)
    expect(AnswerQuestionInputSchema.safeParse({ questionId: '' }).success).toBe(false)
    expect(AnswerQuestionInputSchema.safeParse('q-1').success).toBe(false)
    // chave extra: strict rejeita — impede contrabando de campos.
    expect(
      AnswerQuestionInputSchema.safeParse({ questionId: 'q-1', optionId: 'a', extra: true }).success
    ).toBe(false)
    // texto livre gigante rejeitado.
    expect(
      AnswerQuestionInputSchema.safeParse({ questionId: 'q-1', freeText: 'x'.repeat(3000) }).success
    ).toBe(false)
  })

  it('UpdateProfileInput valida esforço contra o enum do domínio', () => {
    expect(
      UpdateProfileInputSchema.safeParse({ profileId: 'sonnet-worker', effortDefault: 'high' })
        .success
    ).toBe(true)
    expect(
      UpdateProfileInputSchema.safeParse({ profileId: 'sonnet-worker', effortDefault: 'turbo' })
        .success
    ).toBe(false)
    expect(UpdateProfileInputSchema.safeParse({ model: 'claude-opus' }).success).toBe(false)
    expect(
      UpdateProfileInputSchema.safeParse({ profileId: 'p', model: '', effortDefault: 'low' }).success
    ).toBe(false)
  })
})
