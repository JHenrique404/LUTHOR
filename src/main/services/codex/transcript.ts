import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * Transcript local do run real — Fase 2B.
 *
 * Grava em <dataDir>/runs/<runId>/: transcript.jsonl (eventos brutos da CLI,
 * limitado em bytes) e metadata.json. NUNCA inclui variáveis de ambiente,
 * tokens ou segredos: só a saída da CLI e metadados do run.
 */

export const TRANSCRIPT_MAX_BYTES = 2 * 1024 * 1024 // 2 MB documentados

export interface TranscriptMeta {
  runId: string
  taskTitle: string
  workspacePath: string
  provider: 'codex_cli'
  cliVersion: string | null
  startedAt: number
  finishedAt?: number
  exitCode?: number | null
  cancelled?: boolean
  /** Havia mudanças locais ANTES do run (não criadas por ele). */
  preExistingGitChanges?: boolean
  truncated?: boolean
}

export class TranscriptWriter {
  private bytes = 0
  private truncated = false
  private chain: Promise<unknown> = Promise.resolve()
  private readonly dir: string

  constructor(
    dataDir: string,
    runId: string,
    private readonly maxBytes = TRANSCRIPT_MAX_BYTES
  ) {
    this.dir = join(dataDir, 'runs', runId)
  }

  get directory(): string {
    return this.dir
  }

  get isTruncated(): boolean {
    return this.truncated
  }

  /** Anexa uma linha JSONL (respeitando o limite de tamanho). */
  append(line: string): void {
    if (this.truncated) return
    const payload = `${line}\n`
    const size = Buffer.byteLength(payload, 'utf8')
    if (this.bytes + size > this.maxBytes) {
      this.truncated = true
      this.chain = this.chain.then(() =>
        fs
          .appendFile(
            join(this.dir, 'transcript.jsonl'),
            `${JSON.stringify({ luthor: 'transcript truncado no limite de bytes' })}\n`,
            'utf8'
          )
          .catch(() => {})
      )
      return
    }
    this.bytes += size
    this.chain = this.chain.then(async () => {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.appendFile(join(this.dir, 'transcript.jsonl'), payload, 'utf8')
    })
  }

  writeMeta(meta: TranscriptMeta): void {
    this.chain = this.chain.then(async () => {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(
        join(this.dir, 'metadata.json'),
        JSON.stringify({ ...meta, truncated: this.truncated }, null, 2),
        'utf8'
      )
    })
  }

  /** Aguarda todas as gravações pendentes (testes/encerramento). */
  flush(): Promise<unknown> {
    return this.chain
  }
}
