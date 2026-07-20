import type { RunEvent, RunEventType, RunSnapshot, Workspace } from '@shared/domain'
import { assertTransition } from '@shared/state-machine/run-state'
import type { SimEventPayload } from '@shared/ipc/contract'
import type { CodexStatus } from './codex-detector'
import type { RunnerEvent } from './codex-runner'
import { CodexRunner } from './codex-runner'
import type { CommandRunner } from './codex-detector'
import { defaultCommandRunner } from './codex-detector'
import { TranscriptWriter } from './transcript'

/**
 * Run REAL com Codex CLI — Fase 2B.
 *
 * Mantém um RunSnapshot no MESMO formato da simulação (a Agent Office e o
 * detalhe do run funcionam sem bifurcação), mas com executor 'codex_cli',
 * um único worker e NENHUM dado inventado: modelo/uso só aparecem se a CLI
 * informar; não há steps nem porcentagens.
 */

const MAX_EVENTS = 500

export interface CodexStartInput {
  text: string
  workspace: Workspace
  cliStatus: CodexStatus
  profileId?: string
}

export interface CodexRunManagerOptions {
  emit: (payload: SimEventPayload) => void
  /** Diretório de dados do LUTHOR (userData) para transcript/metadata. */
  dataDir: string
  runner?: CodexRunner
  /** Executor de comandos read-only (git status). Injetável nos testes. */
  runCommand?: CommandRunner
  now?: () => number
  createTranscript?: (dataDir: string, runId: string) => TranscriptWriter
}

export class CodexRunManager {
  private snapshot: RunSnapshot | null = null
  private runner: CodexRunner
  private transcript: TranscriptWriter | null = null
  private eventSeq = 0
  private runSeq = 0
  private model: string | null = null
  private lastAgentMessage: string | null = null
  private meta: { startedAt: number; preExisting: boolean; cliVersion: string | null } | null =
    null

  private readonly emitPayload: (payload: SimEventPayload) => void
  private readonly dataDir: string
  private readonly runCommand: CommandRunner
  private readonly now: () => number
  private readonly createTranscript: (dataDir: string, runId: string) => TranscriptWriter

  constructor(options: CodexRunManagerOptions) {
    this.emitPayload = options.emit
    this.dataDir = options.dataDir
    this.runner = options.runner ?? new CodexRunner()
    this.runCommand = options.runCommand ?? defaultCommandRunner
    this.now = options.now ?? Date.now
    this.createTranscript =
      options.createTranscript ?? ((dir, runId) => new TranscriptWriter(dir, runId))
  }

  isBusy(): boolean {
    return this.snapshot !== null && !this.isTerminal()
  }

  hasRun(): boolean {
    return this.snapshot !== null
  }

  getSnapshot(): RunSnapshot | null {
    return this.snapshot ? structuredClone(this.snapshot) : null
  }

  private isTerminal(): boolean {
    const state = this.snapshot?.run.state
    return state === 'completed' || state === 'failed' || state === 'cancelled'
  }

  /**
   * Verificação Git SOMENTE LEITURA antes do run: detecta mudanças locais
   * pré-existentes. Nenhuma escrita Git em hipótese alguma.
   */
  private async gitReadOnlyCheck(cwd: string): Promise<{ isRepo: boolean; dirty: boolean }> {
    try {
      const inside = await this.runCommand('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'])
      if (inside.code !== 0 || !/true/.test(inside.stdout)) return { isRepo: false, dirty: false }
      const status = await this.runCommand('git', ['-C', cwd, 'status', '--porcelain'])
      return { isRepo: true, dirty: status.code === 0 && status.stdout.trim().length > 0 }
    } catch {
      return { isRepo: false, dirty: false }
    }
  }

  async start(input: CodexStartInput): Promise<RunSnapshot> {
    if (this.isBusy()) throw new Error('Já existe um run real em execução')
    if (!input.cliStatus.capabilities) throw new Error('Capacidades do Codex não detectadas')

    const now = this.now()
    this.runSeq++
    const runId = `run-codex-${now.toString(36)}-${this.runSeq}`
    const title = input.text.trim()
    const git = await this.gitReadOnlyCheck(input.workspace.path)

    this.model = null
    this.lastAgentMessage = null
    this.eventSeq = 0
    this.transcript = this.createTranscript(this.dataDir, runId)
    this.meta = { startedAt: now, preExisting: git.dirty, cliVersion: input.cliStatus.version }

    this.snapshot = {
      workspace: structuredClone(input.workspace),
      task: {
        id: `task-${runId}`,
        workspaceId: input.workspace.id,
        title,
        prompt: title,
        createdAt: now
      },
      run: {
        id: runId,
        taskId: `task-${runId}`,
        state: 'running',
        executor: 'codex_cli',
        cancelRequested: false,
        startedAt: now,
        updatedAt: now
      },
      steps: [],
      agents: [
        {
          id: 'ag-codex',
          runId,
          role: 'worker',
          name: 'Codex',
          profileId: input.profileId ?? 'codex-high',
          squadId: null,
          state: 'executing',
          subtask: title,
          effort: 'high',
          writeScope: 'writer',
          worktreeRef: null,
          startedAt: now,
          lastEventAt: now,
          lastEventMessage: 'Iniciando processo Codex'
        }
      ],
      questions: [],
      checkpoints: [],
      events: [],
      profiles: []
    }

    this.pushEvent('task_received', null, `Tarefa real recebida: ${title}`)
    this.pushEvent(
      'agent_log',
      'ag-codex',
      `Executor: Codex CLI ${input.cliStatus.version ?? '(versão desconhecida)'} · sandbox workspace-write · cwd ${input.workspace.path}`
    )
    if (git.dirty) {
      this.pushEvent(
        'agent_log',
        null,
        'Aviso: a pasta já continha mudanças locais ANTES deste run (registrado no metadata). Elas não foram criadas pelo LUTHOR.'
      )
    }
    if (!git.isRepo) {
      this.pushEvent('agent_log', null, 'Pasta sem repositório Git — seguindo com --skip-git-repo-check.')
    }

    this.runner.start({
      prompt: title,
      cwd: input.workspace.path,
      // Executável resolvido pela detecção — nunca a string "codex" crua.
      binaryPath: input.cliStatus.binaryPath ?? undefined,
      capabilities: input.cliStatus.capabilities,
      isGitRepo: git.isRepo,
      onEvent: (event) => this.handleRunnerEvent(event)
    })

    return this.getSnapshot()!
  }

  /** Pausa não é suportada pela CLI — registra o motivo em vez de fingir. */
  notePauseUnsupported(): RunSnapshot | null {
    if (!this.snapshot || this.isTerminal()) return this.getSnapshot()
    this.pushEvent(
      'agent_log',
      null,
      'Pausa não é suportada pelo executor real. Use "Cancelar run" para interromper.'
    )
    return this.getSnapshot()
  }

  /** Interrupção graciosa (a CLI não suporta pausa). */
  cancel(): RunSnapshot | null {
    if (!this.snapshot || this.isTerminal()) return this.getSnapshot()
    if (this.runner.cancel()) {
      this.snapshot.run.cancelRequested = true
      this.pushEvent(
        'run_state_changed',
        null,
        'Cancelamento solicitado — aguardando o processo encerrar (força após 5s)'
      )
    }
    return this.getSnapshot()
  }

  private handleRunnerEvent(event: RunnerEvent): void {
    if (!this.snapshot) return
    switch (event.kind) {
      case 'started': {
        this.transcript?.append(
          JSON.stringify({ luthor: 'started', pid: event.pid, args: event.args })
        )
        this.pushEvent('agent_started', 'ag-codex', `Processo iniciado (pid ${event.pid ?? '?'})`)
        break
      }
      case 'json': {
        this.transcript?.append(event.raw)
        const message = summarizeCliEvent(event.parsed)
        const model = extractModel(event.parsed)
        if (model && !this.model) {
          this.model = model
          this.pushEvent('agent_log', 'ag-codex', `Modelo informado pela CLI: ${model}`)
        }
        const agentText = extractAgentMessage(event.parsed)
        if (agentText) this.lastAgentMessage = agentText
        if (message) this.pushEvent('agent_log', 'ag-codex', message)
        break
      }
      case 'stderr': {
        this.transcript?.append(JSON.stringify({ luthor: 'stderr', text: event.text }))
        this.pushEvent('agent_log', 'ag-codex', `[stderr] ${event.text}`)
        break
      }
      case 'exit': {
        this.finishRun(event.code, event.cancelled)
        break
      }
    }
  }

  private finishRun(code: number | null, cancelled: boolean): void {
    if (!this.snapshot || this.isTerminal()) return
    const { run } = this.snapshot
    const agent = this.snapshot.agents[0]

    if (cancelled) {
      run.state = assertTransition(run.state, 'cancelled')
      if (agent) agent.state = 'failed'
      this.pushEvent('run_state_changed', null, `Run cancelado pelo usuário (exit ${code ?? '—'})`)
    } else if (code === 0) {
      run.state = assertTransition(run.state, 'verifying')
      run.state = assertTransition(run.state, 'completed')
      if (agent) agent.state = 'completed'
      this.pushEvent(
        'run_completed',
        null,
        this.lastAgentMessage
          ? `Run concluído. Resposta final: ${this.lastAgentMessage.slice(0, 400)}`
          : 'Run concluído (exit 0).'
      )
    } else {
      run.state = assertTransition(run.state, 'failed')
      if (agent) agent.state = 'failed'
      this.pushEvent('agent_failed', 'ag-codex', `Processo terminou com exit ${code ?? 'desconhecido'}`)
    }

    if (this.meta && this.transcript) {
      this.transcript.writeMeta({
        runId: run.id,
        taskTitle: this.snapshot.task.title,
        workspacePath: this.snapshot.workspace.path,
        provider: 'codex_cli',
        cliVersion: this.meta.cliVersion,
        startedAt: this.meta.startedAt,
        finishedAt: this.now(),
        exitCode: code,
        cancelled,
        preExistingGitChanges: this.meta.preExisting
      })
    }
  }

  /** Aguarda gravações do transcript (testes/encerramento). */
  flush(): Promise<unknown> {
    return this.transcript?.flush() ?? Promise.resolve()
  }

  private pushEvent(type: RunEventType, agentId: string | null, message: string): void {
    if (!this.snapshot) return
    const event: RunEvent = {
      id: `revt-${++this.eventSeq}`,
      runId: this.snapshot.run.id,
      agentId,
      type,
      message,
      at: this.now()
    }
    this.snapshot.events.push(event)
    if (this.snapshot.events.length > MAX_EVENTS) this.snapshot.events.shift()
    this.snapshot.run.updatedAt = event.at
    if (agentId) {
      const agent = this.snapshot.agents.find((a) => a.id === agentId)
      if (agent) {
        agent.lastEventAt = event.at
        agent.lastEventMessage = message.slice(0, 200)
      }
    }
    this.emitPayload({ event, snapshot: this.getSnapshot()! })
  }
}

// ── Extração conservadora dos eventos JSONL da CLI ─────────────────────────
// O formato varia entre versões; nada é assumido. Melhor esforço, sem inventar.

function firstString(obj: Record<string, unknown> | null, keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function extractModel(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null
  const direct = firstString(parsed, ['model'])
  if (direct) return direct
  for (const value of Object.values(parsed)) {
    if (typeof value === 'object' && value !== null) {
      const nested = firstString(value as Record<string, unknown>, ['model'])
      if (nested) return nested
    }
  }
  return null
}

export function extractAgentMessage(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null
  const item = parsed['item']
  if (typeof item === 'object' && item !== null) {
    const record = item as Record<string, unknown>
    if (record['type'] === 'agent_message' || record['item_type'] === 'agent_message') {
      return firstString(record, ['text', 'message', 'content'])
    }
  }
  return firstString(parsed, ['last_agent_message'])
}

/** Uma linha legível por evento da CLI; null = sem nada útil a mostrar. */
export function summarizeCliEvent(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null
  const type = firstString(parsed, ['type', 'event', 'kind']) ?? 'evento'
  const text =
    extractAgentMessage(parsed) ??
    firstString(parsed, ['message', 'text', 'delta', 'error']) ??
    (() => {
      const item = parsed['item']
      if (typeof item === 'object' && item !== null) {
        return firstString(item as Record<string, unknown>, ['text', 'command', 'title', 'status'])
      }
      return null
    })()
  if (!text) return `[${type}]`
  return `[${type}] ${text.slice(0, 500)}`
}
