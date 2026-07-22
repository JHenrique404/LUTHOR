import { z } from 'zod'
import type { ProviderKind } from './schemas'

/**
 * Contrato GENÉRICO de capacidades por provider — Fase 2B.1.
 *
 * Preparado para Codex e o futuro Claude Code, mas SEMPRE honesto: cada campo
 * reflete apenas o que foi verificado na CLI instalada. Nunca cadastramos
 * modelos fixos nem fingimos que GPT-5.5/5.6 ou Claude Opus estão disponíveis.
 *
 * - availableModels vazio  = a CLI não enumera modelos → só "padrão da CLI".
 * - availableEffortLevels vazio = esforço não é verificavelmente configurável.
 * - supports* = capacidade CONFIRMADA e efetivamente aplicável nesta fase
 *   (uma flag existir no --help não basta se ainda não implementamos o uso).
 * - *Detected = a flag foi vista no help, mas o uso NÃO está implementado
 *   nesta fase (ex.: imagens). Serve para a UI dizer "detectado, não suportado".
 */
export const ProviderCapabilitiesSchema = z.object({
  provider: z.custom<ProviderKind>(),
  providerName: z.string(),
  /** Provider realmente utilizável agora (ex.: Codex detectado + auth). */
  available: z.boolean(),
  /** Modelos que a CLI expõe verificavelmente para seleção (vazio = padrão). */
  availableModels: z.array(z.string()),
  /** true = a CLI aceita escolher modelo (flag detectada), mesmo sem enumerar. */
  modelConfigurable: z.boolean(),
  /** Níveis de esforço verificavelmente selecionáveis (vazio = padrão). */
  availableEffortLevels: z.array(z.string()),
  effortConfigurable: z.boolean(),
  /** A CLI emite dados de uso/tokens estruturados e verificáveis? */
  supportsUsageReporting: z.boolean(),
  /** Envio de imagens ao modelo — implementado nesta fase? */
  supportsImages: z.boolean(),
  /** Flag de imagem existe no --help, mas o envio não está implementado. */
  imageFlagDetected: z.boolean(),
  /** Referências @arquivo/@pasta limitadas ao workspace (feito pelo LUTHOR). */
  supportsFileReferences: z.boolean(),
  /** Modo plano executável (/plan) — fora do escopo desta fase. */
  supportsPlanMode: z.boolean(),
  /** Perguntas interativas da CLI traduzidas em perguntas do LUTHOR. */
  supportsInteractiveQuestions: z.boolean(),
  /** Onde o usuário consulta o uso oficial (não estimamos consumo). */
  usageDashboardUrl: z.string().nullable()
})
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>

/** Flags relevantes detectadas no `codex exec --help` (nunca assumidas). */
export interface CodexDetectedFlags {
  jsonOutput: boolean
  sandboxWorkspaceWrite: boolean
  cd: boolean
  modelFlag: boolean
  imageFlag: boolean
}

export interface CodexCapabilityInput {
  available: boolean
  flags: CodexDetectedFlags | null
  /** true depois que um run real EMITIU dados de uso estruturados. */
  usageObservedOnce?: boolean
}

/**
 * Capacidades do Codex derivadas SÓ do que foi detectado:
 * - a CLI aceita --model (flag), mas não enumera modelos → availableModels [].
 * - esforço não tem flag dedicada verificável → não configurável nesta fase.
 * - imagens: flag pode existir, mas o envio não está implementado → não suportado.
 * - uso: só "suportado" depois que a CLI de fato emitir dados estruturados.
 */
export function codexCapabilities(input: CodexCapabilityInput): ProviderCapabilities {
  const flags = input.flags
  return {
    provider: 'codex',
    providerName: 'Codex',
    available: input.available,
    availableModels: [], // a CLI não enumera modelos — nunca inventar uma lista
    modelConfigurable: flags?.modelFlag ?? false,
    availableEffortLevels: [], // sem flag dedicada verificável nesta versão
    effortConfigurable: false,
    supportsUsageReporting: input.usageObservedOnce ?? false,
    supportsImages: false, // não implementado nesta fase, mesmo se a flag existir
    imageFlagDetected: flags?.imageFlag ?? false,
    supportsFileReferences: true, // @arquivo/@pasta relativos ao workspace (LUTHOR)
    supportsPlanMode: false,
    supportsInteractiveQuestions: false,
    usageDashboardUrl: 'https://platform.openai.com/usage'
  }
}

/**
 * Estrutura preparada para o FUTURO perfil claude-opus-orchestrator (Fase 2C).
 * Não integra Claude Code agora: available=false e nada é prometido.
 */
export function claudeOpusOrchestratorCapabilitiesPlaceholder(): ProviderCapabilities {
  return {
    provider: 'claude_code',
    providerName: 'Claude Code (Opus orquestrador)',
    available: false,
    availableModels: [],
    modelConfigurable: false,
    availableEffortLevels: [],
    effortConfigurable: false,
    supportsUsageReporting: false,
    supportsImages: false,
    imageFlagDetected: false,
    supportsFileReferences: false,
    supportsPlanMode: false,
    supportsInteractiveQuestions: false,
    usageDashboardUrl: null
  }
}
