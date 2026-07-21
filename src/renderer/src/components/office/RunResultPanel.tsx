import type { RunResult, RunSnapshot } from '@shared/domain'
import { RUN_STATE_LABELS } from '@shared/domain'
import { formatClock } from '@renderer/lib/state-ui'
import { PixelBadge } from '@renderer/components/ui/PixelBadge'

interface RunResultPanelProps {
  snapshot: RunSnapshot
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`
}

/**
 * Painel "Resultado" do run REAL — auditável e honesto. Cada dado só aparece
 * se de fato existir; nada é estimado. O resultado final NÃO fica escondido
 * como uma linha do feed.
 */
export function RunResultPanel({ snapshot }: RunResultPanelProps): React.JSX.Element {
  const result: RunResult | null = snapshot.result
  const cfg = snapshot.effectiveConfig
  const terminal = ['completed', 'failed', 'cancelled'].includes(snapshot.run.state)

  if (!result) {
    return (
      <div className="pixel-frame bg-night-800 p-4 [--px-border:var(--color-night-500)]">
        <p className="text-sm text-ink-dim">
          {terminal
            ? 'Resultado ainda sendo consolidado…'
            : 'O run real ainda está em execução. O resultado final aparece aqui ao concluir.'}
        </p>
      </div>
    )
  }

  const usageEntries = result.usage ? Object.entries(result.usage) : []

  return (
    <div className="space-y-4" data-testid="run-result">
      {/* Cabeçalho de metadados reais */}
      <div className="pixel-frame space-y-3 bg-night-800 p-4 [--px-border:var(--color-exec)]">
        <div className="flex flex-wrap items-center gap-2">
          <PixelBadge className="bg-exec-soft text-exec">
            {RUN_STATE_LABELS[snapshot.run.state]}
          </PixelBadge>
          <PixelBadge className="bg-night-700 text-ink-dim">
            {result.provider === 'codex_cli' ? 'Codex CLI' : result.provider}
            {result.cliVersion ? ` · ${result.cliVersion}` : ''}
          </PixelBadge>
          {result.model ? (
            <PixelBadge className="bg-night-700 text-ink-dim" title="Modelo informado pela CLI">
              modelo: {result.model}
            </PixelBadge>
          ) : (
            <PixelBadge className="bg-night-700 text-ink-faint">
              modelo não informado pela CLI
            </PixelBadge>
          )}
          <PixelBadge className="bg-night-700 text-ink-dim">
            duração {formatDuration(result.finishedAt - result.startedAt)}
          </PixelBadge>
          {result.exitCode !== null && (
            <PixelBadge className="bg-night-700 text-ink-faint">exit {result.exitCode}</PixelBadge>
          )}
        </div>

        {cfg && (
          <p className="text-[11px] text-ink-faint">
            perfil efetivo: <span className="text-ink-dim">{cfg.profileName}</span>
            {cfg.appliedModel ? ` · modelo aplicado: ${cfg.appliedModel}` : ' · modelo: padrão da CLI'}
            {cfg.contextRefs.length > 0
              ? ` · contexto: ${cfg.contextRefs.map((r) => r.relPath).join(', ')}`
              : ''}
          </p>
        )}

        {result.cancelled && (
          <p className="text-xs text-alert">
            Run cancelado pelo usuário — a resposta pode estar incompleta.
          </p>
        )}
        {!result.cancelled && result.exitCode !== 0 && result.exitCode !== null && (
          <p className="text-xs text-alert">
            O processo terminou com falha (exit {result.exitCode}).
          </p>
        )}
        {result.preExistingGitChanges === true && (
          <p className="text-xs text-warn">
            Atenção: a pasta já continha mudanças locais ANTES deste run. Elas não foram criadas
            pelo LUTHOR.
          </p>
        )}
      </div>

      {/* Resposta final da IA — sem truncamento artificial */}
      <section aria-label="Resposta final">
        <h3 className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">Resposta final</h3>
        {result.finalMessage ? (
          <pre className="pixel-frame-inset max-h-[40vh] overflow-y-auto bg-night-950 p-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
            {result.finalMessage}
          </pre>
        ) : (
          <p className="text-sm text-ink-faint">
            A CLI não emitiu uma mensagem final estruturada para este run.
          </p>
        )}
      </section>

      {/* Arquivos alterados — Git somente leitura */}
      <section aria-label="Arquivos alterados">
        <h3 className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">
          Arquivos alterados (Git de leitura)
        </h3>
        {result.changedFiles === null ? (
          <p className="text-sm text-ink-faint">
            Workspace sem repositório Git — resumo de arquivos indisponível.
          </p>
        ) : result.changedFiles.length === 0 ? (
          <p className="text-sm text-ink-dim">Nenhuma alteração detectada após o run.</p>
        ) : (
          <ul className="space-y-1">
            {result.changedFiles.map((file) => (
              <li
                key={file.path}
                className="font-logs flex items-center gap-2 text-[11px] text-ink-dim"
              >
                <span className="w-6 shrink-0 text-cyan-glow">{file.status || '—'}</span>
                <span className="truncate">{file.path}</span>
                {file.preExisting && (
                  <PixelBadge className="bg-warn-soft text-warn">já existia</PixelBadge>
                )}
              </li>
            ))}
            {result.changedFilesTruncated && (
              <li className="text-[11px] text-ink-faint">
                Lista truncada (muitos arquivos alterados).
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Uso — honesto: só o que a CLI emitir */}
      <section aria-label="Uso">
        <h3 className="font-pixel mb-2 text-[10px] uppercase text-ink-faint">Uso</h3>
        {usageEntries.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {usageEntries.map(([key, value]) => (
              <li key={key}>
                <PixelBadge className="bg-night-700 text-ink-dim">
                  {key}: {value}
                </PixelBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-dim">
            Uso por run não informado pela CLI.{' '}
            <a
              href="https://platform.openai.com/usage"
              className="text-cyan-glow underline"
              target="_blank"
              rel="noreferrer"
            >
              Consulte o painel oficial de uso do Codex
            </a>{' '}
            para tokens e custo reais. O LUTHOR nunca estima consumo.
          </p>
        )}
        <p className="mt-1 text-[10px] text-ink-faint">
          Consolidado em {formatClock(result.finishedAt)}.
        </p>
      </section>
    </div>
  )
}
