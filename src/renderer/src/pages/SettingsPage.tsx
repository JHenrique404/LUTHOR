import { useEffect, useState } from 'react'
import type { AgentProfile, Effort, ProviderKind } from '@shared/domain'
import { EffortSchema, PROVIDER_LABELS, ProviderKindSchema } from '@shared/domain'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'
import { PixelButton } from '@renderer/components/ui/PixelButton'
import { PixelPanel } from '@renderer/components/ui/PixelPanel'

interface ProfileDraft {
  name: string
  provider: ProviderKind
  model: string
  effortDefault: Effort
  description: string
  active: boolean
}

function toDraft(p: AgentProfile): ProfileDraft {
  return {
    name: p.name,
    provider: p.provider,
    model: p.model,
    effortDefault: p.effortDefault,
    description: p.description,
    active: p.active
  }
}

/** Configurações: CRUD de perfis mockados (só nesta sessão — nada persiste). */
export function SettingsPage(): React.JSX.Element {
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({})
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const applyList = (list: AgentProfile[]): void => {
    setProfiles(list)
    setDrafts(Object.fromEntries(list.map((p) => [p.id, toDraft(p)])))
  }

  useEffect(() => {
    void window.luthor?.profiles.list().then(applyList)
  }, [])

  const flash = (id: string, message: string): void => {
    setFeedback((f) => ({ ...f, [id]: message }))
    setTimeout(() => setFeedback((f) => ({ ...f, [id]: '' })), 2500)
  }

  const setDraft = (id: string, patch: Partial<ProfileDraft>): void => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  const save = async (profileId: string): Promise<void> => {
    const draft = drafts[profileId]
    if (!draft) return
    try {
      const updated = await window.luthor?.profiles.update({ profileId, ...draft })
      if (updated) {
        applyList(updated)
        flash(profileId, 'salvo')
      }
    } catch {
      flash(profileId, 'erro ao salvar')
    }
  }

  const create = async (): Promise<void> => {
    const updated = await window.luthor?.profiles.create({
      name: `novo-perfil-${profiles.length + 1}`,
      provider: 'claude_code',
      model: 'claude-sonnet',
      effortDefault: 'medium',
      description: 'Novo perfil de execução (edite os campos).',
      active: true
    })
    if (updated) applyList(updated)
  }

  const duplicate = async (profileId: string): Promise<void> => {
    const updated = await window.luthor?.profiles.duplicate(profileId)
    if (updated) applyList(updated)
  }

  const remove = async (profileId: string): Promise<void> => {
    try {
      const updated = await window.luthor?.profiles.remove(profileId)
      if (updated) applyList(updated)
    } catch (err) {
      flash(profileId, err instanceof Error && /em uso/.test(err.message) ? 'em uso pelo run' : 'erro ao remover')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-cyan-glow text-lg tracking-widest">CONFIGURAÇÕES</h1>
          <p className="mt-1 text-sm text-ink-dim">Perfis de execução dos agentes.</p>
        </div>
        <PixelButton variant="primary" onClick={() => void create()}>
          Adicionar perfil
        </PixelButton>
      </header>

      <div className="pixel-frame bg-warn-soft/40 px-4 py-3 [--px-border:var(--color-warn)]">
        <p className="text-xs leading-relaxed text-ink-dim">
          <span className="font-pixel text-[10px] uppercase text-warn">Atenção · </span>
          As alterações de perfil desta Fase 1 existem apenas nesta sessão e não conectam
          provedores reais. Fechar o app descarta tudo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {profiles.map((profile) => {
          const draft = drafts[profile.id] ?? toDraft(profile)
          return (
            <PixelPanel
              key={profile.id}
              title={profile.name}
              titleAccent={draft.active ? 'var(--color-exec)' : 'var(--color-ink-faint)'}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PixelBadge className="bg-orch-soft text-orch">
                    {PROVIDER_LABELS[profile.provider]}
                  </PixelBadge>
                  <PixelBadge
                    className={draft.active ? 'bg-exec-soft text-exec' : 'bg-night-700 text-ink-faint'}
                  >
                    {draft.active ? 'ativo' : 'inativo'}
                  </PixelBadge>
                  {feedback[profile.id] && (
                    <PixelBadge className="bg-warn-soft text-warn">{feedback[profile.id]}</PixelBadge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-ink-dim">
                    <span className="font-pixel mb-1 block text-[9px] uppercase text-ink-faint">
                      Nome
                    </span>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => setDraft(profile.id, { name: e.target.value })}
                      className="pixel-frame-inset w-full bg-night-950 px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="block text-xs text-ink-dim">
                    <span className="font-pixel mb-1 block text-[9px] uppercase text-ink-faint">
                      Provider (mockado)
                    </span>
                    <select
                      value={draft.provider}
                      onChange={(e) =>
                        setDraft(profile.id, {
                          provider: ProviderKindSchema.parse(e.target.value)
                        })
                      }
                      className="pixel-frame-inset w-full bg-night-950 px-3 py-2 text-sm text-ink"
                    >
                      {ProviderKindSchema.options.map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-ink-dim">
                    <span className="font-pixel mb-1 block text-[9px] uppercase text-ink-faint">
                      Modelo
                    </span>
                    <input
                      type="text"
                      value={draft.model}
                      onChange={(e) => setDraft(profile.id, { model: e.target.value })}
                      className="pixel-frame-inset w-full bg-night-950 px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="block text-xs text-ink-dim">
                    <span className="font-pixel mb-1 block text-[9px] uppercase text-ink-faint">
                      Esforço padrão
                    </span>
                    <select
                      value={draft.effortDefault}
                      onChange={(e) =>
                        setDraft(profile.id, { effortDefault: EffortSchema.parse(e.target.value) })
                      }
                      className="pixel-frame-inset w-full bg-night-950 px-3 py-2 text-sm text-ink"
                    >
                      {EffortSchema.options.map((eff) => (
                        <option key={eff} value={eff}>
                          {eff}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block text-xs text-ink-dim">
                  <span className="font-pixel mb-1 block text-[9px] uppercase text-ink-faint">
                    Descrição
                  </span>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft(profile.id, { description: e.target.value })}
                    rows={2}
                    className="pixel-frame-inset w-full resize-none bg-night-950 px-3 py-2 text-sm text-ink"
                  />
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-dim">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => setDraft(profile.id, { active: e.target.checked })}
                    className="accent-(--color-exec)"
                  />
                  Perfil ativo (disponível para novos agentes)
                </label>

                <div className="flex flex-wrap gap-2">
                  <PixelButton variant="primary" onClick={() => void save(profile.id)}>
                    Salvar
                  </PixelButton>
                  <PixelButton variant="ghost" onClick={() => void duplicate(profile.id)}>
                    Duplicar
                  </PixelButton>
                  <PixelButton variant="danger" onClick={() => void remove(profile.id)}>
                    Remover
                  </PixelButton>
                </div>
              </div>
            </PixelPanel>
          )
        })}
      </div>
    </div>
  )
}
