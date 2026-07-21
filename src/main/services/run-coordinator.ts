import type { RunExecutor, RunSnapshot, RunState, Workspace } from '@shared/domain'
import type {
  AnswerQuestionInput,
  NewTaskInput,
  UserDirectionInput
} from '@shared/ipc/contract'
import type { SimulationEngine } from './simulation/simulation-engine'
import type { CodexRunManager } from './codex/codex-run-manager'
import type { CodexDetector } from './codex/codex-detector'

/**
 * Coordena o run ATIVO: simulação (Fase 1) ou executor real Codex (Fase 2B).
 * Um único run por vez; um único executor real por vez.
 *
 * Comandos de simulação (pausar, perguntas, instruções) viram no-ops seguros
 * quando o run ativo é real — a CLI não suporta pausa, e o LUTHOR não finge.
 */
export class RunCoordinator {
  private activeKind: 'sim' | 'codex' = 'sim'

  constructor(
    private readonly sim: SimulationEngine,
    private readonly codex: CodexRunManager,
    private readonly detector: CodexDetector,
    private readonly getActiveWorkspace: () => Workspace | null
  ) {}

  private codexActive(): boolean {
    return this.activeKind === 'codex' && this.codex.hasRun()
  }

  getSnapshot(): RunSnapshot {
    if (this.codexActive()) return this.codex.getSnapshot()!
    return this.sim.getSnapshot()
  }

  getRunState(): RunState {
    return this.getSnapshot().run.state
  }

  getExecutor(): RunExecutor {
    return this.codexActive() ? 'codex_cli' : 'simulated'
  }

  /** true = existe run (simulado OU real) em estado não terminal. */
  isBusy(): boolean {
    return this.codex.isBusy() || (this.activeKind === 'sim' && this.sim.isBusy())
  }

  isRealRunBusy(): boolean {
    return this.codex.isBusy()
  }

  async startNewTask(input: NewTaskInput): Promise<RunSnapshot> {
    if (this.codex.isBusy()) {
      throw new Error('Já existe um run REAL em execução — cancele-o antes de iniciar outro.')
    }
    if (input.mode === 'codex') {
      const usable = await this.detector.isUsable()
      if (!usable.ok) throw new Error(usable.reason ?? 'Codex CLI indisponível')
      const workspace = this.getActiveWorkspace()
      if (!workspace) throw new Error('Nenhum workspace ativo para executar a tarefa real.')
      // A simulação para de emitir; o run real assume a Office.
      this.sim.stop()
      const status = await this.detector.status()
      // Modelo só é efetivo se a CLI realmente aceitar a flag.
      const modelConfigurable = status.capabilities?.modelFlag ?? false
      const appliedModel = modelConfigurable && input.codexModel ? input.codexModel : null
      const snapshot = await this.codex.start({
        text: input.text,
        workspace,
        cliStatus: status,
        profileId: 'codex-high',
        profileName: appliedModel ? `codex — modelo ${appliedModel}` : 'codex — padrão da CLI',
        model: appliedModel,
        contextRefs: input.contextRefs ?? []
      })
      this.activeKind = 'codex'
      return snapshot
    }
    this.activeKind = 'sim'
    return this.sim.startNewRun(input)
  }

  cancelRun(): RunSnapshot {
    if (this.codexActive()) return this.codex.cancel() ?? this.getSnapshot()
    return this.sim.cancelRun()
  }

  pauseAll(): RunSnapshot {
    if (this.codexActive()) {
      // Pausa real não existe na CLI — não fingimos.
      return this.codex.notePauseUnsupported() ?? this.getSnapshot()
    }
    return this.sim.pauseAll()
  }

  resumeAll(): RunSnapshot {
    if (this.codexActive()) return this.getSnapshot()
    return this.sim.resumeAll()
  }

  pauseAgent(agentId: string): RunSnapshot {
    if (this.codexActive()) return this.codex.notePauseUnsupported() ?? this.getSnapshot()
    return this.sim.pauseAgent(agentId)
  }

  resumeAgent(agentId: string): RunSnapshot {
    if (this.codexActive()) return this.getSnapshot()
    return this.sim.resumeAgent(agentId)
  }

  answerQuestion(input: AnswerQuestionInput): RunSnapshot {
    if (this.codexActive()) return this.getSnapshot()
    return this.sim.answerQuestion(input)
  }

  answerQuestions(inputs: AnswerQuestionInput[]): RunSnapshot {
    if (this.codexActive()) return this.getSnapshot()
    return this.sim.answerQuestions(inputs)
  }

  addUserDirection(input: UserDirectionInput): RunSnapshot {
    if (this.codexActive()) return this.getSnapshot()
    return this.sim.addUserDirection(input)
  }
}
