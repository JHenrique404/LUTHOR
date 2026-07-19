import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Question, RunSnapshot } from '@shared/domain'
import { StepProgress } from '@renderer/components/ui/StepProgress'
import { RunProgressSummary } from '@renderer/components/ui/RunProgressSummary'
import { AgentCard } from '@renderer/components/office/AgentCard'
import { ComposerModal } from '@renderer/components/office/ComposerModal'
import { DecisionBox } from '@renderer/components/office/DecisionBox'
import { SquadCard } from '@renderer/components/office/SquadCard'
import { AgentOfficePage } from '@renderer/pages/AgentOfficePage'
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

describe('AgentOfficePage — estados do run', () => {
  afterEach(() => {
    useRunStore.setState({ snapshot: null, lastEvent: null })
  })

  const withRunState = (state: RunSnapshot['run']['state']): RunSnapshot => {
    const snap = createSeedSnapshot()
    snap.run.state = state
    return snap
  }

  it('run ativo mostra "Pausar tudo", "Nova tarefa" e "Direcionar run"', () => {
    useRunStore.setState({ snapshot: withRunState('running') })
    render(<AgentOfficePage />)
    expect(screen.getByRole('button', { name: 'Pausar tudo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Direcionar run' })).toBeInTheDocument()
  })

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'run %s: sem "Pausar tudo"/"Direcionar run", mas "Nova tarefa" e continuação presentes',
    (state) => {
      useRunStore.setState({ snapshot: withRunState(state) })
      render(<AgentOfficePage />)
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
