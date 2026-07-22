import { promises as fs } from 'node:fs'
import { isAbsolute, normalize, sep } from 'node:path'
import type { WorkspaceError } from '@shared/ipc/contract'

/**
 * Validação de caminho de workspace — SEMPRE no processo main.
 * O renderer nunca envia caminhos livres: a única origem de um caminho novo
 * é o diálogo nativo, e mesmo esse resultado passa por aqui antes de
 * qualquer registro (defesa em profundidade).
 *
 * Nenhuma leitura ampla do disco: apenas stat/realpath da pasta escolhida.
 */

export type PathValidation =
  | { ok: true; canonicalPath: string }
  | ({ ok: false } & Pick<WorkspaceError, 'code' | 'message'>)

export type PathValidator = (rawPath: string) => Promise<PathValidation>

/**
 * Chave de deduplicação de caminhos: normalizada, sem separador final e
 * case-insensitive no Windows (NTFS não diferencia maiúsculas).
 */
export function pathKey(path: string): string {
  let normalized = normalize(path)
  while (normalized.length > 3 && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1)
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** Absoluto, existente, diretório e canonicalizado (realpath resolve links/junctions). */
export async function validateWorkspacePath(rawPath: string): Promise<PathValidation> {
  const trimmed = rawPath?.trim() ?? ''
  if (!trimmed || !isAbsolute(trimmed)) {
    return {
      ok: false,
      code: 'invalid_path',
      message: 'O caminho do workspace precisa ser absoluto (ex.: C:\\projetos\\meu-app).'
    }
  }
  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(trimmed)
  } catch {
    return {
      ok: false,
      code: 'path_not_found',
      message: 'A pasta escolhida não existe (ou não está acessível neste momento).'
    }
  }
  try {
    const stats = await fs.stat(canonicalPath)
    if (!stats.isDirectory()) {
      return {
        ok: false,
        code: 'not_a_directory',
        message: 'O caminho escolhido não é uma pasta.'
      }
    }
  } catch {
    return {
      ok: false,
      code: 'path_not_found',
      message: 'A pasta escolhida não existe (ou não está acessível neste momento).'
    }
  }
  return { ok: true, canonicalPath }
}
