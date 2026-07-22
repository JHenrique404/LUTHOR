import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * Persistência local do caminho MANUAL do executável Codex (Conexões).
 * Guarda somente o caminho — nunca tokens, credenciais ou variáveis de
 * ambiente. Arquivo: <userData>/codex-settings.json.
 */
export class CodexSettingsStore {
  private readonly file: string

  constructor(dir: string) {
    this.file = join(dir, 'codex-settings.json')
  }

  async getManualBinaryPath(): Promise<string | null> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as {
        manualBinaryPath?: unknown
      }
      return typeof raw.manualBinaryPath === 'string' && raw.manualBinaryPath.length > 0
        ? raw.manualBinaryPath
        : null
    } catch {
      return null
    }
  }

  async setManualBinaryPath(path: string | null): Promise<void> {
    await fs.writeFile(
      this.file,
      JSON.stringify({ manualBinaryPath: path }, null, 2),
      'utf8'
    )
  }
}
