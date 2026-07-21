import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Agent, Question, RunResult, RunSnapshot } from '@shared/domain'
import { StepProgress } from '@renderer/components/ui/StepProgress'
import { RunProgressSummary } from '@renderer/components/ui/RunProgressSummary'
import { AgentCard } from '@renderer/components/office/AgentCard'
import { ComposerModal } from '@renderer/components/office/ComposerModal'
import { DecisionBox } from '@renderer/components/office/DecisionBox'
import { SquadCard } from '@renderer/components/office/SquadCard'
import { RunResultPanel } from '@renderer/components/office/RunResultPanel'
import { RunCompletionPanel } from '@renderer/components/office/RunCompletionPanel'
import { LuthorOrchestratorPanel } from '@renderer/components/office/LuthorOrchestratorPanel'
import { AgentOfficePage } from '@renderer/pages/AgentOfficePage'
import { ConnectionsPage } from '@renderer/pages/ConnectionsPage'
import { useRunStore } from '@renderer/stores/run-store'
import { createSeedSnapshot, createSquadRunParts } from '../src/main/services/db/seed'

const snapshot = createSeedSnapshot()

function makeQuestion(id: string, agentId: string, text: string): Question {
  return {
    id,
    runId: 'run-auth-demo',
    agentId,
    text,
    options: [
      { id: `${id}-a`, label: 'Opção A' },
      { id: `${id}-b`, label: 'Opção B' }
    ],
    allowFreeText: true,
    status: 'pending',
    answer: null,
    createdAt: Date.now()
  }
}

describe('StepProgress', () => {
  const makeSteps = (statuses: Array<'verified' | 'in_progress' | 'pending' | 'failed'>) =>
    statuses.map((status, i) => ({
      id: `s-${i + 1}`,
      runId: 'r',
      index: i + 1,
      title: `Etapa ${i + 1}`,
      status,
      assignedAgentId: null
    }))

  const successBlocks = (container: HTMLElement): number =>
    container.querySelectorAll('[data-step-status="verified"]').length

  it('mostra progresso derivado, nunca porcentagem', () => {
    render(<StepProgress steps={snapshot.steps} />)
    expect(screen.getByText('3 de 5 etapas verificadas')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('REGRESSÃO 1/5: exatamente UM bloco de sucesso, mesmo com in_progress na barra', () => {
    const { container } = render(
      <StepProgress steps={makeSteps(['verified', 'in_progress', 'pending', 'pending', 'pending'])} />
    )
    expect(screen.getByRole('img', { name: '1 de 5 etapas verificadas' })).toBeInTheDocument()
    expect(successBlocks(container)).toBe(1)
    // in_progress nunca conta nem parece sucesso (estilo próprio, sem bg-exec).
    const inProgress = container.querySelector('[data-step-status="in_progress"]')
    expect(inProgress).not.toBeNull()
    expect(inProgress!.className).not.toContain('bg-exec')
  })

  it('REGRESSÃO 1/5 com a ÚLTIMA etapa verificada: só o quinto bloco é sucesso', () => {
    const { container } = render(
      <StepProgress
        steps={makeSteps(['in_progress', 'in_progress', 'pending', 'pending', 'verified'])}
      />
    )
    expect(screen.getByRole('img', { name: '1 de 5 etapas verificadas' })).toBeInTheDocument()
    const blocks = Array.from(container.querySelectorAll('[data-step-status]'))
    expect(blocks.map((b) => b.getAttribute('data-step-status'))).toEqual([
      'in_progress',
      'in_progress',
      'pending',
      'pending',
      'verified'
    ])
    expect(successBlocks(container)).toBe(1)
  })

  it('5/5: todos os cinco blocos em sucesso', () => {
    const { container } = render(
      <StepProgress
        steps={makeSteps(['verified', 'verified', 'verified', 'verified', 'verified'])}
      />
    )
    expect(screen.getByRole('img', { name: '5 de 5 etapas verificadas' })).toBeInTheDocument()
    expect(successBlocks(container)).toBe(5)
  })
})

describe('AgentCard', () => {
  it('renderiza papel, subtask, modelo, esforço e estado', () => {
    const backend = snapshot.agents.find((a) => a.id === 'ag-backend')!
    const profile = snapshot.profiles.find((p) => p.id === backend.profileId)
    render(
      <AgentCard
        agent={backend}
        profile={profile}
        now={Date.now()}
        onSelect={vi.fn()}
        onOpenQuestion={vi.fn()}
      />
    )
    expect(screen.getByText('Backend')).toBeInTheDocument()
    expect(screen.getByText(backend.subtask)).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
    expect(screen.getByText('Executando')).toBeInTheDocument()
  })

  it('clique abre o painel do agente', async () => {
    const onSelect = vi.fn()
    const frontend = snapshot.agents.find((a) => a.id === 'ag-frontend')!
    render(
      <AgentCard agent={frontend} now={Date.now()} onSelect={onSelect} onOpenQuestion={vi.fn()} />
    )
    await userEvent.click(screen.getByRole('button', { name: /abrir detalhes/i }))
    expect(onSelect).toHaveBeenCalledWith('ag-frontend')
  })
})

describe('DecisionBox', () => {
  const q1 = makeQuestion('q-1', 'ag-verifier', 'Tempo de expiração das sessões?')
  const q2 = makeQuestion('q-2', 'ag-backend', 'Nome do cookie de sessão?')

  it('REGRESSÃO: digitar no campo livre mantém foco e texto mesmo com re-renders', async () => {
    // Reproduz o bug original: a cada evento simulado o pai re-renderiza com
    // props novas (onClose inline, arrays recriados) e o Modal roubava o foco
    // do textarea após cada tecla.
    const { rerender } = render(
      <DecisionBox
        questions={[q1]}
        agents={snapshot.agents}
        onClose={() => {}}
        onSubmit={vi.fn()}
      />
    )
    const textarea = screen.getByLabelText(/com suas palavras/i)
    await userEvent.type(textarea, 'expira em ')

    // Simula chegada de evento: novas identidades de props, mesmo conteúdo.
    rerender(
      <DecisionBox
        questions={[{ ...q1 }]}
        agents={[...snapshot.agents]}
        onClose={() => {}}
        onSubmit={vi.fn()}
      />
    )

    // Com o bug, o Modal refocava o painel aqui e as próximas teclas se perdiam.
    expect(textarea).toHaveFocus()
    // keyboard() digita no elemento ATIVO — não re-foca o textarea por conta própria.
    await userEvent.keyboard('12 horas')
    expect(textarea).toHaveValue('expira em 12 horas')
    expect(textarea).toHaveFocus()
  })

  it('mostra contador, navega entre perguntas e preserva rascunhos', async () => {
    render(
      <DecisionBox
        questions={[q1, q2]}
        agents={snapshot.agents}
        onClose={() => {}}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog', { name: /2 pendente/i })).toBeInTheDocument()

    // rascunho na pergunta 1
    await userEvent.type(screen.getByLabelText(/com suas palavras/i), 'rascunho um')

    // navega para a pergunta do Backend
    await userEvent.click(screen.getByRole('button', { name: /nome do cookie/i }))
    expect(screen.getAllByText('Nome do cookie de sessão?').length).toBeGreaterThan(0)

    // volta: rascunho preservado
    await userEvent.click(screen.getByRole('button', { name: /tempo de expiração/i }))
    expect(screen.getByLabelText(/com suas palavras/i)).toHaveValue('rascunho um')
  })

  it('envia várias respostas de uma vez com "Enviar N respostas"', async () => {
    const onSubmit = vi.fn()
    render(
      <DecisionBox
        questions={[q1, q2]}
        agents={snapshot.agents}
        onClose={() => {}}
        onSubmit={onSubmit}
      />
    )
    expect(screen.getByRole('button', { name: /enviar 0 resposta/i })).toBeDisabled()

    await userEvent.click(screen.getByLabelText('Opção A'))
    await userEvent.click(screen.getByRole('button', { name: /nome do cookie/i }))
    await userEvent.type(screen.getByLabelText(/com suas palavras/i), '__Host-luthor')

    const submit = screen.getByRole('button', { name: /enviar 2 respostas/i })
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const inputs = onSubmit.mock.calls[0][0]
    expect(inputs).toHaveLength(2)
    expect(inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionId: 'q-1', optionId: 'q-1-a' }),
        expect.objectContaining({ questionId: 'q-2', freeText: '__Host-luthor' })
      ])
    )
  })
})

describe('ComposerModal — contexto e capacidades Codex (Fase 2B.1)', () => {
  const codexCaps = {
    provider: 'codex' as const,
    providerName: 'Codex',
    available: true,
    availableModels: [] as string[],
    modelConfigurable: true,
    availableEffortLevels: [] as string[],
    effortConfigurable: false,
    supportsUsageReporting: false,
    supportsImages: false,
    imageFlagDetected: true,
    supportsFileReferences: true,
    supportsPlanMode: false,
    supportsInteractiveQuestions: false,
    usageDashboardUrl: 'https://platform.openai.com/usage'
  }

  function renderCodexComposer(pick?: ReturnType<typeof vi.fn>) {
    const onSubmitNewTask = vi.fn()
    render(
      <ComposerModal
        kind="new_task"
        agents={snapshot.agents}
        codexAvailability={{ ok: true }}
        codexCapabilities={codexCaps}
        onPickContext={pick ?? vi.fn()}
        onClose={() => {}}
        onSubmitNewTask={onSubmitNewTask}
        onSubmitInstruction={vi.fn()}
      />
    )
    return onSubmitNewTask
  }

  it('executor explícito: Codex CLI, modelo padrão, esforço não configurável — sem modelos falsos', async () => {
    renderCodexComposer()
    await userEvent.click(screen.getByLabelText(/EXECUTOR CODEX/i))
    expect(screen.getByText('Codex CLI')).toBeInTheDocument()
    expect(screen.getByText(/padrão da CLI/i)).toBeInTheDocument()
    expect(screen.getByText(/não configurável nesta versão detectada/i)).toBeInTheDocument()
    expect(screen.getByText(/Fase 2C/i)).toBeInTheDocument()
    // Nenhum modelo fixo inventado nem seletor de perfil mockado.
    expect(screen.queryByText(/GPT-5|Opus|Sonnet/i)).not.toBeInTheDocument()
  })

  it('imagem detectada mas não suportada: aviso claro, sem aceitar anexo', async () => {
    renderCodexComposer()
    await userEvent.click(screen.getByLabelText(/EXECUTOR CODEX/i))
    expect(screen.getAllByText(/ainda não são suportadas/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Anexar imagem/i })).toBeDisabled()
  })

  it('adiciona contexto permitido, mostra bloqueio e remove item', async () => {
    const pick = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', ref: { relPath: 'src/a.ts', kind: 'file' } })
      .mockResolvedValueOnce({ status: 'blocked', message: 'Bloqueado por padrão: ".env" parece conter segredos.' })
    const onSubmit = renderCodexComposer(pick)
    await userEvent.click(screen.getByLabelText(/EXECUTOR CODEX/i))

    await userEvent.click(screen.getByRole('button', { name: '+ @arquivo' }))
    expect(await screen.findByText(/@src\/a\.ts/)).toBeInTheDocument()

    // segunda seleção bloqueada mostra a razão
    await userEvent.click(screen.getByRole('button', { name: '+ @arquivo' }))
    expect(await screen.findByText(/parece conter segredos/i)).toBeInTheDocument()

    // envia com o contexto permitido
    await userEvent.type(screen.getByLabelText(/Descreva a tarefa/i), 'documentar o projeto')
    await userEvent.click(screen.getByRole('button', { name: /executar de verdade/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'codex',
        contextRefs: [{ relPath: 'src/a.ts', kind: 'file' }]
      })
    )
  })

  it('remover contexto antes de iniciar tira o item da lista', async () => {
    const pick = vi
      .fn()
      .mockResolvedValue({ status: 'ok', ref: { relPath: 'src/a.ts', kind: 'file' } })
    renderCodexComposer(pick)
    await userEvent.click(screen.getByLabelText(/EXECUTOR CODEX/i))
    await userEvent.click(screen.getByRole('button', { name: '+ @arquivo' }))
    expect(await screen.findByText(/@src\/a\.ts/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Remover src\/a\.ts/i }))
    expect(screen.queryByText(/@src\/a\.ts/)).not.toBeInTheDocument()
  })

  it('autocomplete @: sugere sob demanda e a seleção vira chip', async () => {
    const suggest = vi
      .fn()
      .mockResolvedValue([{ relPath: 'src/App.tsx', kind: 'file' as const }])
    render(
      <ComposerModal
        kind="new_task"
        agents={snapshot.agents}
        codexAvailability={{ ok: true }}
        codexCapabilities={codexCaps}
        onPickContext={vi.fn()}
        onSuggestContext={suggest}
        onClose={() => {}}
        onSubmitNewTask={vi.fn()}
        onSubmitInstruction={vi.fn()}
      />
    )
    await userEvent.click(screen.getByLabelText(/EXECUTOR CODEX/i))
    await userEvent.type(screen.getByLabelText(/Descreva a tarefa/i), 'ver @App')
    expect(suggest).toHaveBeenCalled()
    const option = await screen.findByRole('option', { name: /src\/App\.tsx/i })
    await userEvent.click(option)
    // Vira chip de contexto.
    expect(screen.getByText(/@src\/App\.tsx/)).toBeInTheDocument()
  })

  it('/arquivo abre o seletor nativo (atalho local, não comando do provider)', async () => {
    const pick = vi.fn().mockResolvedValue({ status: 'cancelled' })
    render(
      <ComposerModal
        kind="new_task"
        agents={snapshot.agents}
        codexAvailability={{ ok: true }}
        codexCapabilities={codexCaps}
        onPickContext={pick}
        onSuggestContext={vi.fn().mockResolvedValue([])}
        onClose={() => {}}
        onSubmitNewTask={vi.fn()}
        onSubmitInstruction={vi.fn()}
      />
    )
    await userEvent.click(screen.getByLabelText(/EXECUTOR CODEX/i))
    await userEvent.type(screen.getByLabelText(/Descreva a tarefa/i), '/arquivo ')
    expect(pick).toHaveBeenCalledWith('file')
  })

  it('imagem colada exibe aviso e NÃO anexa', async () => {
    render(
      <ComposerModal
        kind="new_task"
        agents={snapshot.agents}
        codexAvailability={{ ok: true }}
        codexCapabilities={codexCaps}
        onPickContext={vi.fn()}
        onSuggestContext={vi.fn().mockResolvedValue([])}
        onClose={() => {}}
        onSubmitNewTask={vi.fn()}
        onSubmitInstruction={vi.fn()}
      />
    )
    await userEvent.click(screen.getByLabelText(/EXECUTOR CODEX/i))
    const textarea = screen.getByLabelText(/Descreva a tarefa/i)
    fireEvent.paste(textarea, { clipboardData: { items: [{ type: 'image/png' }], files: [] } })
    expect(screen.getAllByText(/ainda não são suportadas/i).length).toBeGreaterThan(0)
    expect(textarea).toHaveValue('') // nada foi anexado ao texto
  })
})

describe('RunResultPanel — resultado auditável (Fase 2B.1)', () => {
  const baseResult: RunResult = {
    provider: 'codex_cli',
    cliVersion: 'codex-cli 0.144.5',
    model: null,
    finalMessage: 'Resposta final completa da IA, com várias linhas.\nSegunda linha.',
    startedAt: 1000,
    finishedAt: 4000,
    exitCode: 0,
    cancelled: false,
    preExistingGitChanges: true,
    changedFiles: [
      { path: 'LUTHOR_SMOKE.md', status: '??', preExisting: false },
      { path: 'existing.ts', status: 'M', preExisting: true }
    ],
    changedFilesTruncated: false,
    usage: null
  }

  function makeRealSnapshot(overrides: Partial<RunResult> = {}): RunSnapshot {
    const snap = createSeedSnapshot()
    snap.run.executor = 'codex_cli'
    snap.run.state = 'completed'
    snap.result = { ...baseResult, ...overrides }
    snap.effectiveConfig = {
      profileId: 'codex-high',
      profileName: 'codex — padrão da CLI',
      appliedModel: null,
      appliedEffort: null,
      contextRefs: [{ relPath: 'README.md', kind: 'file' }]
    }
    return snap
  }

  it('mostra resposta final completa, metadados e arquivos alterados', () => {
    render(<RunResultPanel snapshot={makeRealSnapshot()} />)
    expect(screen.getByText(/Resposta final completa da IA/)).toBeInTheDocument()
    expect(screen.getByText(/codex-cli 0\.144\.5/)).toBeInTheDocument()
    expect(screen.getByText(/modelo não informado pela CLI/i)).toBeInTheDocument()
    expect(screen.getByText('LUTHOR_SMOKE.md')).toBeInTheDocument()
    expect(screen.getByText('já existia')).toBeInTheDocument() // arquivo pré-existente
    expect(screen.getByText(/já continha mudanças locais ANTES/i)).toBeInTheDocument()
  })

  it('uso ausente: "não informado" + link para painel oficial, sem estimar', () => {
    render(<RunResultPanel snapshot={makeRealSnapshot({ usage: null })} />)
    expect(screen.getByText(/Uso por run não informado pela CLI/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /painel oficial de uso/i })).toBeInTheDocument()
  })

  it('uso presente: só os números emitidos pela CLI', () => {
    render(<RunResultPanel snapshot={makeRealSnapshot({ usage: { input_tokens: 120 } })} />)
    expect(screen.getByText(/input_tokens: 120/)).toBeInTheDocument()
  })

  it('sem Git: resumo de arquivos indisponível', () => {
    render(
      <RunResultPanel
        snapshot={makeRealSnapshot({ changedFiles: null, preExistingGitChanges: null })}
      />
    )
    expect(screen.getByText(/sem repositório Git/i)).toBeInTheDocument()
  })
})

// ── Fase 2B.1 (rodada UX): worker honesto, conclusão, execução, composer ─────

function makeCodexAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'ag-codex',
    runId: 'run-codex-1',
    role: 'worker',
    name: 'Worker Codex',
    profileId: 'codex-cli',
    squadId: null,
    state: 'executing',
    subtask: 'Documentar o projeto',
    effort: 'low',
    writeScope: 'writer',
    worktreeRef: null,
    startedAt: 1000,
    finishedAt: null,
    lastEventAt: 1000,
    lastEventMessage: 'Iniciando processo Codex',
    ...overrides
  }
}

describe('AgentCard — run real: config efetiva e duração congelada', () => {
  it('mostra só a config efetiva (não "codex-high"/"high")', () => {
    render(
      <AgentCard
        agent={makeCodexAgent()}
        now={5000}
        effectiveConfigLabel="Codex CLI · padrão da CLI"
        onSelect={vi.fn()}
        onOpenQuestion={vi.fn()}
      />
    )
    expect(screen.getByText('Codex CLI · padrão da CLI')).toBeInTheDocument()
    expect(screen.queryByText('codex-high')).not.toBeInTheDocument()
    expect(screen.queryByText('high')).not.toBeInTheDocument()
  })

  it('question_pending mostra "Aguardando sua resposta"', () => {
    render(
      <AgentCard
        agent={makeCodexAgent({ state: 'question_pending' })}
        now={5000}
        effectiveConfigLabel="Codex CLI · padrão da CLI"
        onSelect={vi.fn()}
        onOpenQuestion={vi.fn()}
      />
    )
    expect(screen.getByText(/Aguardando sua resposta/i)).toBeInTheDocument()
  })

  it('REGRESSÃO duração: terminal congela — não muda quando "now" avança', () => {
    const agent = makeCodexAgent({ state: 'completed', startedAt: 1000, finishedAt: 4000 })
    const { rerender } = render(
      <AgentCard agent={agent} now={10_000} effectiveConfigLabel="Codex CLI · padrão da CLI" onSelect={vi.fn()} onOpenQuestion={vi.fn()} />
    )
    expect(screen.getByText('3s')).toBeInTheDocument() // 4000-1000
    rerender(
      <AgentCard agent={agent} now={999_999} effectiveConfigLabel="Codex CLI · padrão da CLI" onSelect={vi.fn()} onOpenQuestion={vi.fn()} />
    )
    // Duração NÃO acompanha "now" após terminal.
    expect(screen.getByText('3s')).toBeInTheDocument()
  })
})

describe('RunCompletionPanel — conclusão compacta no Agent Office', () => {
  function realSnap(state: RunSnapshot['run']['state'], finalMessage: string | null): RunSnapshot {
    const snap = createSeedSnapshot()
    snap.run.executor = 'codex_cli'
    snap.run.state = state
    snap.run.startedAt = 1000
    snap.run.finishedAt = 4000
    snap.result = {
      provider: 'codex_cli',
      cliVersion: 'codex-cli 0.144.6',
      model: null,
      finalMessage,
      startedAt: 1000,
      finishedAt: 4000,
      exitCode: 0,
      cancelled: false,
      preExistingGitChanges: false,
      changedFiles: [],
      changedFilesTruncated: false,
      usage: null
    }
    return snap
  }

  it('estado, duração congelada, trecho truncado e botões', () => {
    const long = 'x'.repeat(500)
    const onView = vi.fn()
    const onNew = vi.fn()
    render(
      <RunCompletionPanel
        snapshot={realSnap('completed', long)}
        onViewResult={onView}
        onNewTask={onNew}
        onAnswerAndContinue={vi.fn()}
      />
    )
    expect(screen.getByText(/duração 3s/i)).toBeInTheDocument()
    // Truncado: não duplica o texto inteiro (mostra reticências).
    expect(screen.getByText(/…$/)).toBeInTheDocument()
    expect(screen.queryByText(long)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver resultado completo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeInTheDocument()
  })

  it('resposta que parece pergunta oferece "Responder e continuar deste resultado"', () => {
    render(
      <RunCompletionPanel
        snapshot={realSnap('completed', 'Em qual arquivo devo adicionar as 2 linhas?')}
        onViewResult={vi.fn()}
        onNewTask={vi.fn()}
        onAnswerAndContinue={vi.fn()}
      />
    )
    expect(
      screen.getByRole('button', { name: /Responder e continuar deste resultado/i })
    ).toBeInTheDocument()
  })
})

describe('LuthorOrchestratorPanel — execução honesta, sem "0 de 0 etapas"', () => {
  it('mostra progresso de execução real e rótulo "sem IA própria"', () => {
    const snap = createSeedSnapshot()
    snap.run.executor = 'codex_cli'
    snap.steps = []
    snap.agents = [makeCodexAgent({ state: 'executing' })]
    render(<LuthorOrchestratorPanel snapshot={snap} />)
    expect(screen.getByText(/sem IA própria nesta fase/i)).toBeInTheDocument()
    expect(screen.getByText(/1 execução em andamento/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 de 0 etapas/i)).not.toBeInTheDocument()
  })
})

describe('RunProgressSummary — resumo agregado da barra superior', () => {
  const makeSteps = (statuses: Array<'verified' | 'in_progress' | 'pending' | 'failed'>) =>
    statuses.map((status, i) => ({
      id: `s-${i + 1}`,
      runId: 'r',
      index: i + 1,
      title: `Etapa ${i + 1}`,
      status,
      assignedAgentId: null
    }))

  const aggBlocks = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-agg-block]')).map(
      (b) => b.getAttribute('data-agg-block') ?? ''
    )

  it('REGRESSÃO squad: #01 e #05 verificadas => dois PRIMEIROS blocos verdes, nunca o último', () => {
    // Cenário real da squad: bugs 1 e 5 corrigidos, 2 e 3 em execução, 4 na fila.
    const { container } = render(
      <RunProgressSummary
        steps={makeSteps(['verified', 'in_progress', 'in_progress', 'pending', 'verified'])}
      />
    )
    expect(aggBlocks(container)).toEqual(['verified', 'verified', 'active', 'neutral', 'neutral'])
    expect(
      screen.getByRole('img', {
        name: '2 de 5 etapas verificadas · 2 em execução · 1 na fila'
      })
    ).toBeInTheDocument()
  })

  it('no máximo UM indicador ciano; sem trabalho em andamento, nenhum', () => {
    const { container } = render(
      <RunProgressSummary steps={makeSteps(['verified', 'pending', 'pending', 'pending', 'pending'])} />
    )
    expect(aggBlocks(container)).toEqual(['verified', 'neutral', 'neutral', 'neutral', 'neutral'])
  })

  it('5 de 5: todos os blocos verdes', () => {
    const { container } = render(
      <RunProgressSummary
        steps={makeSteps(['verified', 'verified', 'verified', 'verified', 'verified'])}
      />
    )
    expect(aggBlocks(container)).toEqual(['verified', 'verified', 'verified', 'verified', 'verified'])
    expect(screen.getByRole('img', { name: '5 de 5 etapas verificadas' })).toBeInTheDocument()
  })
})

describe('ComposerModal — Direcionar run', () => {
  it('exclui instâncias concluídas dos destinatários', async () => {
    // Seed: Pesquisador está completed — deve ficar fora da lista.
    render(
      <ComposerModal
        kind="instruction"
        agents={snapshot.agents}
        onClose={() => {}}
        onSubmitNewTask={vi.fn()}
        onSubmitInstruction={vi.fn()}
      />
    )
    await userEvent.click(screen.getByLabelText('Agente específico'))
    const select = screen.getByRole('combobox')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent ?? '')
    expect(options.some((o) => o.includes('Backend'))).toBe(true)
    expect(options.some((o) => o.includes('Pesquisador'))).toBe(false)
  })
})

describe('SquadCard', () => {
  const members = createSquadRunParts('run-squad-t', 'Corrigir cinco bugs', Date.now()).agents.filter(
    (a) => a.squadId !== null
  )

  it('mostra resumo agregado e expande para as instâncias', async () => {
    const onSelect = vi.fn()
    render(<SquadCard members={members} now={Date.now()} onSelect={onSelect} />)
    expect(screen.getByText(/2 ativos · 2 na fila · 1 concluído/)).toBeInTheDocument()
    expect(screen.getByText(/3 processos/)).toBeInTheDocument()
    expect(screen.queryByText('Sonnet #03')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /squad sonnet/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Sonnet #03')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /detalhes de Sonnet #03/i }))
    expect(onSelect).toHaveBeenCalledWith('ag-sonnet-3')
  })
})

describe('Modal — responsividade', () => {
  it('botões de envio ficam FORA da área rolável (nunca cortados)', () => {
    const q = makeQuestion('q-x', 'ag-verifier', 'Pergunta longa?')
    render(
      <DecisionBox questions={[q]} agents={snapshot.agents} onClose={() => {}} onSubmit={vi.fn()} />
    )
    const scrollArea = screen.getByTestId('modal-scroll-area')
    const submit = screen.getByRole('button', { name: /enviar 0 resposta/i })
    expect(submit).toBeInTheDocument()
    expect(scrollArea.contains(submit)).toBe(false)
  })
})

describe('ConnectionsPage — UX de Redetectar', () => {
  const codexConn = {
    id: 'codex' as const,
    name: 'Codex',
    status: 'configured' as const,
    detail: 'Pronto (codex-cli 0.144.5).',
    version: 'codex-cli 0.144.5',
    authenticated: true,
    binaryLabel: 'codex.exe',
    binarySource: 'auto' as const,
    capabilitiesSummary: ['exec --json', 'sandbox workspace-write']
  }

  afterEach(() => {
    delete (window as { luthor?: unknown }).luthor
  })

  function stubLuthor(refresh: () => Promise<(typeof codexConn)[]>): void {
    ;(window as { luthor?: unknown }).luthor = {
      connections: {
        list: async () => [codexConn],
        refresh,
        chooseCodexBinary: vi.fn(),
        clearCodexBinary: vi.fn()
      }
    }
  }

  it('carregando: indicador pixel visível + aria-busy; sucesso: "Detecção atualizada agora"', async () => {
    let release: (v: (typeof codexConn)[]) => void = () => {}
    stubLuthor(() => new Promise((resolve) => (release = resolve)))
    render(<ConnectionsPage />)
    expect(await screen.findByText('codex-cli 0.144.5')).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Redetectar' })
    await userEvent.click(button)

    // Estado de carregamento visível, não só troca de texto.
    expect(screen.getByTestId('connections-busy')).toBeInTheDocument()
    expect(
      screen.getByText('Verificando executável, versão e autenticação…')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificando…' })).toHaveAttribute(
      'aria-busy',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled()

    release([codexConn])
    expect(await screen.findByText('Detecção atualizada agora.')).toBeInTheDocument()
    // Versão, auth e capacidades continuam visíveis após atualizar.
    expect(screen.getByText('codex-cli 0.144.5')).toBeInTheDocument()
    expect(screen.getByText('autenticado')).toBeInTheDocument()
    expect(screen.getByText(/sandbox workspace-write/)).toBeInTheDocument()
  })

  it('falha: aviso coral com a razão — nunca silencioso', async () => {
    stubLuthor(async () => {
      throw new Error('Codex foi encontrado no terminal, mas o atalho do NVM não pode ser executado')
    })
    render(<ConnectionsPage />)
    await screen.findByText('codex-cli 0.144.5')
    await userEvent.click(screen.getByRole('button', { name: 'Redetectar' }))

    const feedback = await screen.findByTestId('connections-feedback')
    expect(feedback.textContent).toMatch(/atalho do NVM/)
    expect(feedback.className).toContain('text-alert')
  })
})

describe('AgentOfficePage — estados do run', () => {
  afterEach(() => {
    useRunStore.setState({ snapshot: null, lastEvent: null })
  })

  const renderOffice = (): void => {
    render(
      <MemoryRouter>
        <AgentOfficePage />
      </MemoryRouter>
    )
  }

  const withRunState = (state: RunSnapshot['run']['state']): RunSnapshot => {
    const snap = createSeedSnapshot()
    snap.run.state = state
    return snap
  }

  it('run ativo mostra "Pausar tudo", "Nova tarefa" e "Direcionar run"', () => {
    useRunStore.setState({ snapshot: withRunState('running') })
    renderOffice()
    expect(screen.getByRole('button', { name: 'Pausar tudo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Direcionar run' })).toBeInTheDocument()
  })

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'run %s: sem "Pausar tudo"/"Direcionar run", mas "Nova tarefa" e continuação presentes',
    (state) => {
      useRunStore.setState({ snapshot: withRunState(state) })
      renderOffice()
      expect(screen.queryByRole('button', { name: 'Pausar tudo' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Direcionar run' })).not.toBeInTheDocument()
      // "Nova tarefa" é persistente: caminho permanente para o orquestrador.
      expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeInTheDocument()
      expect(screen.getByTitle('Estado final do run')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Continuar a partir deste run' })
      ).toBeInTheDocument()
    }
  )
})
