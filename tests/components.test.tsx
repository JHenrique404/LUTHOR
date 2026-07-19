import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Question, RunSnapshot } from '@shared/domain'
import { StepProgress } from '@renderer/components/ui/StepProgress'
import { AgentCard } from '@renderer/components/office/AgentCard'
import { DecisionBox } from '@renderer/components/office/DecisionBox'
import { AgentOfficePage } from '@renderer/pages/AgentOfficePage'
import { useRunStore } from '@renderer/stores/run-store'
import { createSeedSnapshot } from '../src/main/services/db/seed'

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
  it('mostra progresso derivado, nunca porcentagem', () => {
    render(<StepProgress steps={snapshot.steps} />)
    expect(screen.getByText('3 de 5 etapas verificadas')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
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

describe('AgentOfficePage — estados do run', () => {
  afterEach(() => {
    useRunStore.setState({ snapshot: null, lastEvent: null })
  })

  const withRunState = (state: RunSnapshot['run']['state']): RunSnapshot => {
    const snap = createSeedSnapshot()
    snap.run.state = state
    return snap
  }

  it('run ativo mostra "Pausar tudo" e o composer', () => {
    useRunStore.setState({ snapshot: withRunState('running') })
    render(<AgentOfficePage />)
    expect(screen.getByRole('button', { name: 'Pausar tudo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeInTheDocument()
  })

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'run %s esconde "Pausar tudo" e mostra selo de estado final',
    (state) => {
      useRunStore.setState({ snapshot: withRunState(state) })
      render(<AgentOfficePage />)
      expect(screen.queryByRole('button', { name: 'Pausar tudo' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Nova tarefa' })).not.toBeInTheDocument()
      expect(screen.getByTitle('Estado final do run')).toBeInTheDocument()
    }
  )
})
