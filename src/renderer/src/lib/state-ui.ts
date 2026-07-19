import type { AgentState, RunState, StepStatus } from '@shared/domain'

/**
 * Mapeamento estado -> cor funcional da paleta LUTHOR.
 * ciano/verde = execução saudável | roxo = orquestração
 * âmbar = atenção | coral = bloqueio/pausa/erro
 */

export interface StateStyle {
  /** cor do texto/badge */
  text: string
  /** cor de fundo suave */
  bg: string
  /** cor sólida (dot) */
  dot: string
  /** animação do dot (respeita prefers-reduced-motion via CSS) */
  anim: string
}

export const AGENT_STATE_STYLE: Record<AgentState, StateStyle> = {
  planning: { text: 'text-orch', bg: 'bg-orch-soft', dot: 'bg-orch', anim: 'anim-pulse' },
  waiting: { text: 'text-ink-dim', bg: 'bg-night-700', dot: 'bg-ink-faint', anim: '' },
  executing: { text: 'text-exec', bg: 'bg-exec-soft', dot: 'bg-exec', anim: 'anim-pulse' },
  verifying: {
    text: 'text-cyan-glow',
    bg: 'bg-exec-soft',
    dot: 'bg-cyan-glow',
    anim: 'anim-pulse'
  },
  question_pending: { text: 'text-warn', bg: 'bg-warn-soft', dot: 'bg-warn', anim: 'anim-blink' },
  paused: { text: 'text-alert', bg: 'bg-alert-soft', dot: 'bg-alert', anim: '' },
  completed: { text: 'text-exec', bg: 'bg-exec-soft', dot: 'bg-exec', anim: '' },
  failed: { text: 'text-alert', bg: 'bg-alert-soft', dot: 'bg-alert', anim: '' }
}

export const RUN_STATE_STYLE: Record<RunState, StateStyle> = {
  draft: { text: 'text-ink-dim', bg: 'bg-night-700', dot: 'bg-ink-faint', anim: '' },
  planning: { text: 'text-orch', bg: 'bg-orch-soft', dot: 'bg-orch', anim: 'anim-pulse' },
  running: { text: 'text-exec', bg: 'bg-exec-soft', dot: 'bg-exec', anim: 'anim-pulse' },
  awaiting_user: { text: 'text-warn', bg: 'bg-warn-soft', dot: 'bg-warn', anim: 'anim-blink' },
  paused: { text: 'text-alert', bg: 'bg-alert-soft', dot: 'bg-alert', anim: '' },
  verifying: { text: 'text-cyan-glow', bg: 'bg-exec-soft', dot: 'bg-cyan-glow', anim: 'anim-pulse' },
  completed: { text: 'text-exec', bg: 'bg-exec-soft', dot: 'bg-exec', anim: '' },
  failed: { text: 'text-alert', bg: 'bg-alert-soft', dot: 'bg-alert', anim: '' },
  cancelled: { text: 'text-ink-dim', bg: 'bg-night-700', dot: 'bg-ink-faint', anim: '' }
}

export const STEP_STATUS_STYLE: Record<StepStatus, StateStyle> = {
  pending: { text: 'text-ink-dim', bg: 'bg-night-700', dot: 'bg-ink-faint', anim: '' },
  in_progress: { text: 'text-exec', bg: 'bg-exec-soft', dot: 'bg-exec', anim: 'anim-pulse' },
  verified: { text: 'text-exec', bg: 'bg-exec-soft', dot: 'bg-exec', anim: '' },
  failed: { text: 'text-alert', bg: 'bg-alert-soft', dot: 'bg-alert', anim: '' }
}

export function formatElapsed(sinceMs: number, now = Date.now()): string {
  const total = Math.max(0, Math.floor((now - sinceMs) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
