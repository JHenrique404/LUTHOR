import { promises as fs } from 'node:fs'
import { isAbsolute, relative, sep, extname, basename } from 'node:path'

/**
 * Referências de contexto (@arquivo / @pasta) — Fase 2B.1.
 *
 * Regras de segurança:
 * - SÓ caminhos dentro do workspace ativo (caminho canônico); nada externo.
 * - Armazenamos caminho RELATIVO ao workspace, nunca absoluto arbitrário.
 * - Denylist por padrão: .env, chaves, .git, node_modules, binários e
 *   arquivos muito grandes.
 * - Nenhuma varredura/leitura ampla: apenas stat do item escolhido. O Codex
 *   continua decidindo quais arquivos abrir dentro do workspace.
 */

export const MAX_CONTEXT_FILE_BYTES = 1024 * 1024 // 1 MB

export type ContextRefKind = 'file' | 'folder'

export interface ContextRef {
  relPath: string
  kind: ContextRefKind
}

export type ContextEvalResult =
  | { ok: true; ref: ContextRef }
  | { ok: false; code: ContextBlockCode; message: string }

export type ContextBlockCode =
  | 'outside_workspace'
  | 'kind_mismatch'
  | 'denied_name'
  | 'denied_binary'
  | 'too_large'
  | 'not_found'

/** Segmentos de caminho sempre bloqueados. */
const DENIED_SEGMENTS = new Set(['.git', 'node_modules'])

/** Nomes/arquivos de segredo bloqueados (case-insensitive). */
const DENIED_NAME_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /secrets?\.(json|ya?ml|toml)$/i
]

/** Extensões binárias bloqueadas por padrão. */
const DENIED_BINARY_EXT = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.lib',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff',
  '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.wav', '.flac',
  '.zip', '.gz', '.tar', '.rar', '.7z', '.jar', '.war',
  '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.node', '.wasm', '.class', '.pyc'
])

/** Normaliza para chave POSIX relativa (barra) — armazenamento/UI. */
export function toRelPosix(rel: string): string {
  return rel.split(sep).join('/')
}

export interface EvaluateContextInput {
  /** Caminho canônico do workspace ativo. */
  workspacePath: string
  /** Caminho absoluto escolhido no diálogo nativo. */
  selectedPath: string
  kind: ContextRefKind
  isDirectory: boolean
  /** Tamanho em bytes (só relevante para arquivos). */
  sizeBytes: number
}

/**
 * Valida uma seleção de contexto de forma PURA (sem tocar disco).
 * A obtenção de isDirectory/sizeBytes fica a cargo do chamador (stat).
 */
export function evaluateContextReference(input: EvaluateContextInput): ContextEvalResult {
  const rel = relative(input.workspacePath, input.selectedPath)
  // Fora do workspace: relative começa com ".." ou vira caminho absoluto.
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return {
      ok: false,
      code: 'outside_workspace',
      message: 'A referência precisa estar dentro do workspace ativo.'
    }
  }

  if (input.kind === 'file' && input.isDirectory) {
    return { ok: false, code: 'kind_mismatch', message: 'Selecionado uma pasta onde se esperava um arquivo.' }
  }
  if (input.kind === 'folder' && !input.isDirectory) {
    return { ok: false, code: 'kind_mismatch', message: 'Selecionado um arquivo onde se esperava uma pasta.' }
  }

  const segments = rel.split(sep)
  for (const segment of segments) {
    if (DENIED_SEGMENTS.has(segment.toLowerCase())) {
      return {
        ok: false,
        code: 'denied_name',
        message: `Bloqueado por padrão: "${segment}" não pode ser usado como contexto.`
      }
    }
  }

  const name = basename(input.selectedPath)
  if (DENIED_NAME_PATTERNS.some((re) => re.test(name))) {
    return {
      ok: false,
      code: 'denied_name',
      message: `Bloqueado por padrão: "${name}" parece conter segredos/chaves.`
    }
  }

  if (input.kind === 'file') {
    if (DENIED_BINARY_EXT.has(extname(name).toLowerCase())) {
      return {
        ok: false,
        code: 'denied_binary',
        message: `Bloqueado por padrão: "${name}" é um arquivo binário.`
      }
    }
    if (input.sizeBytes > MAX_CONTEXT_FILE_BYTES) {
      return {
        ok: false,
        code: 'too_large',
        message: `Arquivo muito grande (> ${Math.round(MAX_CONTEXT_FILE_BYTES / 1024)} KB) para referência de contexto.`
      }
    }
  }

  return { ok: true, ref: { relPath: toRelPosix(rel), kind: input.kind } }
}

/** Adaptador de filesystem (injetável nos testes). */
export interface ContextFs {
  realpath(p: string): Promise<string>
  stat(p: string): Promise<{ isDirectory: boolean; sizeBytes: number }>
}

export const defaultContextFs: ContextFs = {
  realpath: (p) => fs.realpath(p),
  stat: async (p) => {
    const s = await fs.stat(p)
    return { isDirectory: s.isDirectory(), sizeBytes: s.size }
  }
}

/**
 * Resolve + valida uma seleção real (canonicaliza e faz stat).
 * Usa realpath para impedir escapar do workspace via symlink/junção.
 */
export async function resolveContextReference(
  workspacePath: string,
  selectedPath: string,
  kind: ContextRefKind,
  fsAdapter: ContextFs = defaultContextFs
): Promise<ContextEvalResult> {
  let canonical: string
  let stat: { isDirectory: boolean; sizeBytes: number }
  try {
    canonical = await fsAdapter.realpath(selectedPath)
    stat = await fsAdapter.stat(canonical)
  } catch {
    return { ok: false, code: 'not_found', message: 'O item escolhido não existe mais.' }
  }
  const canonicalWorkspace = await fsAdapter.realpath(workspacePath).catch(() => workspacePath)
  return evaluateContextReference({
    workspacePath: canonicalWorkspace,
    selectedPath: canonical,
    kind,
    isDirectory: stat.isDirectory,
    sizeBytes: stat.sizeBytes
  })
}

/** Monta a instrução clara de contexto anexada ao prompt do executor. */
export function buildContextInstruction(refs: ContextRef[]): string {
  if (refs.length === 0) return ''
  const lines = refs.map((r) => `- ${r.kind === 'folder' ? '@pasta' : '@arquivo'} ${r.relPath}`)
  return [
    '',
    'Contexto indicado pelo usuário (caminhos relativos ao diretório de trabalho):',
    ...lines,
    'Considere estes itens ao trabalhar; abra apenas o necessário dentro do workspace.'
  ].join('\n')
}
