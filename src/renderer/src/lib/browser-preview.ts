import type { RunSnapshot } from '@shared/domain'
import { createSeedSnapshot, createSquadRunParts } from '../../../main/services/db/seed'

/**
 * Snapshot estático para inspecionar a UI num navegador comum (sem Electron).
 * SÓ usado em dev (import dinâmico guardado por import.meta.env.DEV no store).
 * Inclui perguntas pendentes e a squad demo para smoke visual de modais/cards.
 */
export function createBrowserPreviewSnapshot(): RunSnapshot {
  const snapshot = createSeedSnapshot()
  const now = Date.now()

  const squad = createSquadRunParts(snapshot.run.id, snapshot.task.title, now)
  snapshot.agents.push(...squad.agents.filter((a) => a.squadId !== null).map((a) => ({
    ...a,
    runId: snapshot.run.id
  })))

  snapshot.questions.push(
    {
      id: 'q-session-expiry',
      runId: snapshot.run.id,
      agentId: 'ag-verifier',
      text: 'Qual deve ser o tempo de expiração das sessões de usuário?',
      options: [
        { id: 'opt-24h', label: '24 horas (mais seguro)' },
        { id: 'opt-7d', label: '7 dias (equilíbrio)' },
        { id: 'opt-30d', label: '30 dias (mais conveniente)' }
      ],
      allowFreeText: true,
      status: 'pending',
      answer: null,
      createdAt: now
    },
    {
      id: 'q-cookie-name',
      runId: snapshot.run.id,
      agentId: 'ag-backend',
      text: 'Como nomear o cookie de sessão da aplicação?',
      options: [
        { id: 'opt-luthor', label: 'luthor_session' },
        { id: 'opt-app', label: 'app_session' },
        { id: 'opt-host', label: '__Host-session (mais estrito)' }
      ],
      allowFreeText: true,
      status: 'pending',
      answer: null,
      createdAt: now
    }
  )
  return snapshot
}
