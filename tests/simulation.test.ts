import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimEventPayload } from '@shared/ipc/contract'
import { SimulationEngine } from '../src/main/services/simulation/simulation-engine'
import { createSeedSnapshot } from '../src/main/services/db/seed'

const TICK = 1000

function createEngine(): { engine: SimulationEngine; events: SimEventPayload[] } {
  const events: SimEventPayload[] = []
  const engine = new SimulationEngine({
    snapshot: createSeedSnapshot(),
    emit: (payload) => events.push(payload),
    tickMs: TICK
  })
  return { engine, events }
}

describe('SimulationEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emite eventos simulados em intervalos', () => {
    const { engine, events } = createEngine()
    engine.start()
    vi.advanceTimersByTime(TICK * 3)
    expect(events.length).toBe(3)
    expect(events.every((e) => e.event.type === 'agent_log')).toBe(true)
    engine.stop()
  })

  it('abre pergunta pendente e o run passa a awaiting_user', () => {
    const { engine, events } = createEngine()
    engine.start()
    vi.advanceTimersByTime(TICK * 4)
    const opened = events.find((e) => e.event.type === 'question_opened')
    expect(opened).toBeDefined()
    const snapshot = engine.getSnapshot()
    expect(snapshot.run.state).toBe('awaiting_user')
    expect(snapshot.questions[0]?.status).toBe('pending')
    expect(snapshot.agents.find((a) => a.id === 'ag-verifier')?.state).toBe('question_pending')
    engine.stop()
  })

  it('pausar tudo congela novos eventos; retomar continua', () => {
    const { engine, events } = createEngine()
    engine.start()
    vi.advanceTimersByTime(TICK * 2)

    const paused = engine.pauseAll()
    expect(paused.run.state).toBe('paused')
    const frozenCount = events.length

    vi.advanceTimersByTime(TICK * 10)
    expect(events.length).toBe(frozenCount) // congelado de verdade

    const resumed = engine.resumeAll()
    expect(resumed.run.state).toBe('running')
    vi.advanceTimersByTime(TICK * 2)
    expect(events.length).toBeGreaterThan(frozenCount)
    engine.stop()
  })

  it('responder a pergunta destrava verificação da etapa 4 e o Frontend', () => {
    const { engine } = createEngine()
    engine.start()
    vi.advanceTimersByTime(TICK * 4) // abre a pergunta

    const question = engine.getSnapshot().questions[0]
    engine.answerQuestion({ questionId: question.id, optionId: 'opt-24h' })

    let snapshot = engine.getSnapshot()
    expect(snapshot.run.state).toBe('running')
    expect(snapshot.questions[0].status).toBe('answered')
    expect(snapshot.questions[0].answer).toContain('24 horas')

    vi.advanceTimersByTime(TICK * 2) // verificação da etapa 4
    snapshot = engine.getSnapshot()
    expect(snapshot.steps.find((s) => s.index === 4)?.status).toBe('verified')
    expect(snapshot.agents.find((a) => a.id === 'ag-backend')?.state).toBe('completed')
    expect(snapshot.agents.find((a) => a.id === 'ag-frontend')?.state).toBe('executing')
    engine.stop()
  })

  it('roteiro completo termina com run completed e 5 de 5 verificadas', () => {
    const { engine } = createEngine()
    engine.start()
    vi.advanceTimersByTime(TICK * 4)
    engine.answerQuestion({ questionId: engine.getSnapshot().questions[0].id, optionId: 'opt-7d' })
    vi.advanceTimersByTime(TICK * 20)
    const snapshot = engine.getSnapshot()
    expect(snapshot.run.state).toBe('completed')
    expect(snapshot.steps.every((s) => s.status === 'verified')).toBe(true)
    engine.stop()
  })

  it('pausar agente individual suprime seus logs sem pausar o run', () => {
    const { engine, events } = createEngine()
    engine.start()
    engine.pauseAgent('ag-backend')
    expect(engine.getSnapshot().run.state).toBe('running')
    vi.advanceTimersByTime(TICK * 3)
    const backendLogs = events.filter(
      (e) => e.event.type === 'agent_log' && e.event.agentId === 'ag-backend'
    )
    expect(backendLogs).toHaveLength(0)

    engine.resumeAgent('ag-backend')
    expect(engine.getSnapshot().agents.find((a) => a.id === 'ag-backend')?.state).toBe('executing')
    engine.stop()
  })

  it('segunda pergunta é consolidada na espera; lote responde as duas', () => {
    const { engine } = createEngine()
    engine.start()
    vi.advanceTimersByTime(TICK * 4) // Verificador abre a 1ª pergunta
    vi.advanceTimersByTime(TICK * 2) // Backend consolida a 2ª em vez de pausar

    let snapshot = engine.getSnapshot()
    expect(snapshot.questions).toHaveLength(2)
    expect(snapshot.agents.find((a) => a.id === 'ag-backend')?.state).toBe('question_pending')
    expect(snapshot.run.state).toBe('awaiting_user')

    engine.answerQuestions([
      { questionId: 'q-session-expiry', optionId: 'opt-24h' },
      { questionId: 'q-cookie-name', freeText: '__Host-luthor' }
    ])
    snapshot = engine.getSnapshot()
    expect(snapshot.questions.every((q) => q.status === 'answered')).toBe(true)
    expect(snapshot.run.state).toBe('running')
    expect(snapshot.agents.find((a) => a.id === 'ag-backend')?.state).toBe('executing')

    vi.advanceTimersByTime(TICK * 2) // verificação da etapa 4 destravada
    expect(engine.getSnapshot().steps.find((s) => s.index === 4)?.status).toBe('verified')
    engine.stop()
  })

  it('composer registra user_direction como evento simulado', () => {
    const { engine, events } = createEngine()
    engine.addUserDirection({ kind: 'instruction', scopeType: 'all', text: 'Priorizar testes' })
    const direction = events.find((e) => e.event.type === 'user_direction')
    expect(direction).toBeDefined()
    expect(direction?.event.message).toContain('Instrução adicionada')
    expect(direction?.event.message).toContain('Priorizar testes')

    // escopo de agente inexistente: nenhum evento novo
    const count = events.length
    engine.addUserDirection({ kind: 'new_task', scopeType: 'agent', agentId: 'ag-nao-existe', text: 'x'.repeat(10) })
    expect(events.length).toBe(count)
  })

  it('Nova tarefa (fluxo padrão) cria run novo que progride até completed', () => {
    const { engine } = createEngine()
    engine.start()
    const snapshot = engine.startNewRun({ text: 'Melhorar onboarding', mode: 'standard' })

    expect(snapshot.run.id).not.toBe('run-auth-demo')
    expect(snapshot.run.state).toBe('running')
    expect(snapshot.task.title).toBe('Melhorar onboarding')
    expect(snapshot.steps).toHaveLength(5)
    expect(snapshot.agents.every((a) => a.squadId === null)).toBe(true)
    expect(snapshot.questions).toHaveLength(0)

    vi.advanceTimersByTime(TICK * 3)
    expect(engine.getSnapshot().steps[0].status).toBe('verified')

    vi.advanceTimersByTime(TICK * 40)
    const finished = engine.getSnapshot()
    expect(finished.run.state).toBe('completed')
    expect(finished.steps.every((s) => s.status === 'verified')).toBe(true)
    engine.stop()
  })

  it('demo squad SÓ quando escolhida: cria squad 2 ativos / 2 na fila / 1 concluído', () => {
    const { engine, events } = createEngine()
    const snapshot = engine.startNewRun({
      text: 'Corrigir cinco bugs',
      mode: 'squad_demo',
      continuedFromRunId: 'run-auth-demo'
    })

    const members = snapshot.agents.filter((a) => a.squadId === 'squad-sonnet')
    expect(members).toHaveLength(5)
    expect(members.filter((a) => a.state === 'executing')).toHaveLength(2)
    expect(members.filter((a) => a.state === 'waiting')).toHaveLength(2)
    expect(members.filter((a) => a.state === 'completed')).toHaveLength(1)

    expect(events.some((e) => e.event.type === 'plan_created' && /squad/i.test(e.event.message))).toBe(true)
    expect(
      events.some(
        (e) => e.event.type === 'user_direction' && e.event.message.includes('run-auth-demo')
      )
    ).toBe(true)
    engine.stop()
  })

  it('squad: fila é promovida quando um executante conclui (limite simulado)', () => {
    const { engine } = createEngine()
    engine.startNewRun({ text: 'Corrigir cinco bugs', mode: 'squad_demo' })

    vi.advanceTimersByTime(TICK * 4)
    let members = engine.getSnapshot().agents.filter((a) => a.squadId !== null)
    expect(members.find((a) => a.id === 'ag-sonnet-1')?.state).toBe('completed')
    expect(members.find((a) => a.id === 'ag-sonnet-3')?.state).toBe('executing')
    expect(members.find((a) => a.id === 'ag-sonnet-4')?.state).toBe('waiting')

    vi.advanceTimersByTime(TICK * 30)
    const finished = engine.getSnapshot()
    expect(finished.run.state).toBe('completed')
    members = finished.agents.filter((a) => a.squadId !== null)
    expect(members.every((a) => a.state === 'completed')).toBe(true)
    engine.stop()
  })

  it('rejeita resposta vazia', () => {
    const { engine } = createEngine()
    engine.start()
    vi.advanceTimersByTime(TICK * 4)
    const question = engine.getSnapshot().questions[0]
    engine.answerQuestion({ questionId: question.id })
    expect(engine.getSnapshot().questions[0].status).toBe('pending')
    engine.stop()
  })
})
