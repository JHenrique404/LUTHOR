# LUTHOR Pixel UI — Design System

Sistema visual do LUTHOR: pixel art funcional sobre fundo azul-noite. Este documento
descreve os tokens e regras já implementados em
[`src/renderer/src/styles/index.css`](../src/renderer/src/styles/index.css) e nos
componentes de [`src/renderer/src/components/ui/`](../src/renderer/src/components/ui/).
A identidade é original — nada de tema SaaS genérico nem cópia de referências.

## 1. Tokens de cor

Definidos via `@theme` (Tailwind v4). Sempre usar os tokens; nunca hex solto em componente.

### Superfícies (azul-noite/grafite)

| Token | Hex | Uso |
| --- | --- | --- |
| `night-950` | `#070b16` | fundo mais profundo: sidebar, poços de log/inputs |
| `night-900` | `#0b1020` | fundo padrão da janela |
| `night-800` | `#111731` | superfície de painéis e cards |
| `night-700` | `#1a2140` | superfície elevada, hover, tabs ativas |
| `night-600` | `#252d52` | bordas divisórias internas |
| `night-500` | `#333c66` | moldura pixel padrão |

### Texto

| Token | Hex | Uso |
| --- | --- | --- |
| `ink` | `#e8ecf8` | texto principal |
| `ink-dim` | `#9aa3c2` | texto secundário |
| `ink-faint` | `#626b8c` | rótulos, metadados, placeholders |

### Acentos funcionais (semânticos — não decorativos)

| Token | Hex | Par suave | Significado |
| --- | --- | --- | --- |
| `exec` | `#37e6a0` | `exec-soft #123528` | execução saudável, verificado, concluído |
| `cyan-glow` | `#45d8e8` | — | identidade/títulos, verificação em andamento, foco |
| `orch` | `#a583ff` | `orch-soft #251d45` | orquestração, ações do usuário sobre o run |
| `warn` | `#f6c245` | `warn-soft #3a2e10` | atenção: pergunta pendente, avisos de fase |
| `alert` | `#ff6f68` | `alert-soft #3c1622` | bloqueio, pausa, erro, ações destrutivas |

Regra: acento forte para texto/borda/dot; par `-soft` para fundo do mesmo elemento.
Mapeamentos estado→cor centralizados em
[`state-ui.ts`](../src/renderer/src/lib/state-ui.ts) (`AGENT_STATE_STYLE`,
`RUN_STATE_STYLE`, `STEP_STATUS_STYLE`) — novos componentes consomem esses mapas,
não recriam cores.

## 2. Tipografia

| Papel | Fonte | Classe | Onde usar |
| --- | --- | --- | --- |
| Pixel | Silkscreen | `font-pixel` | títulos, rótulos curtos (≤3 palavras), números, badges, botões |
| Corpo | Inter Variable | padrão (`font-body`) | qualquer texto longo, descrições, formulários |
| Logs | JetBrains Mono | `font-logs` | logs, feeds de evento, paths, ids de run |

Regras:
- `font-pixel` NUNCA em parágrafos ou texto corrido — só rótulos curtos, com
  `uppercase` + `tracking-wide`.
- Tamanhos pixel usuais: `text-[9px]`–`text-xs` para rótulos; `text-lg` só no título da página.
- Corpo: `text-sm` padrão, `text-xs` para secundário; logs `text-[11px]` com `leading-relaxed`.

## 3. Espaçamento

Escala Tailwind (base 4px). Convenções:

| Contexto | Valor |
| --- | --- |
| Padding de página | `p-6` (telas densas) ou `p-8` (telas de leitura) |
| Painel (`PixelPanel`) | `p-4` |
| Card de agente | `p-3` |
| Linhas de lista (steps, perfis) | `px-4 py-2`–`py-3` |
| Gap entre cards/painéis | `gap-4` |
| Gap interno de metadados | `gap-2` |
| Separadores internos | `border-t-2` / `border-b-2` com `night-600`/`night-700` |

A moldura pixel adiciona `margin: 3px` próprio (ver §4) — não compensar manualmente.

## 4. Moldura pixel

Assinatura visual do sistema: cantos "recortados" sem imagens, via box-shadow em degraus.

```css
.pixel-frame {
  --px-border: var(--color-night-500); /* cor da moldura, sobrescrevível */
  box-shadow:
    0 -3px 0 0 var(--px-border),
    0  3px 0 0 var(--px-border),
    -3px 0 0 0 var(--px-border),
    3px  0 0 0 var(--px-border);
  margin: 3px;
}
```

- Trocar a cor por elemento: `[--px-border:var(--color-warn)]` (ou `frameColor` no `PixelPanel`).
- `pixel-frame-inset`: variante rebaixada (sombras internas) para inputs, textareas e poços de log, sempre com fundo `night-950`.
- Cantos duros em tudo: **nenhum** `border-radius` no sistema.

## 5. Breakpoints e responsividade

Janela mínima do app: 1024×660 (definida no main process).

| Breakpoint | Uso |
| --- | --- |
| base (<1024) | tudo em 1 coluna |
| `md` | grades de 2–3 colunas em telas de leitura (Conexões, Config) |
| `lg` | cards de agente em 2 colunas |
| `xl` | cards de agente em 4 colunas |

Regras anti-overflow:
- Shell: sidebar `h-full` fixa; só o `<main>` rola (`overflow-y-auto`); `body { overflow: hidden }`.
- Todo container flex com texto truncável: `min-w-0` + `truncate`/`line-clamp-*`.
- Badges nunca vazam do card: linha superior com `flex-wrap`, badge com `max-w-full` e conteúdo `truncate` — quebra para nova linha antes de estourar.
- Blocos largos (logs, tabelas) rolam no próprio container, nunca na página.

## 6. Foco e acessibilidade

- Foco visível global: `outline: 2px dashed var(--color-cyan-glow)` com offset 2px — não remover, não sobrescrever.
- Drawer e Modal: `role="dialog"`, `aria-modal`, Esc fecha, foco entra no painel ao abrir. O foco **só** é puxado na abertura — nunca roubar foco em re-render (regressão coberta por teste).
- Tabs: padrão WAI-ARIA (`tablist`/`tab`/`tabpanel`) com navegação por setas.
- Feed de eventos: `aria-live="polite"`.
- Estado nunca é indicado apenas por cor: sempre cor + rótulo textual (badge).
- Contraste mínimo AA sobre as superfícies `night-800`/`night-900`.

## 7. Movimento

Animações comunicam eventos reais da simulação — nunca decoração em loop sem significado.
Todas definidas dentro de `@media (prefers-reduced-motion: no-preference)`; com redução
de movimento ativa, o app funciona 100% estático.

| Classe | Curva | Significado |
| --- | --- | --- |
| `anim-pulse` | `steps(2)` 1.6s | agente/run trabalhando (dot de estado) |
| `anim-blink` | `steps(2)` 1s | pergunta pendente / atenção |
| `anim-slide-in` | `steps(4)` 0.25s | novo evento entrou no feed |
| `anim-flash` | `steps(3)` 0.9s | card do agente que acabou de emitir evento |
| `anim-drawer-in` | `steps(4)` 0.2s | abertura do drawer |

Usar `steps()` (não easing suave) — movimento "quantizado" combina com a estética pixel.

## 8. Componentes e variantes

### PixelButton
Variantes: `primary` (exec/ciano — ação positiva), `orch` (roxo — ações de orquestração
do usuário), `warn` (âmbar — decisões pendentes), `danger` (coral — pausar/remover),
`ghost` (neutro — cancelar/secundário). Estados: hover (fundo mais forte),
`disabled` (opacity 40% + cursor bloqueado), foco (outline global).
Rótulo sempre `font-pixel` uppercase.

### PixelBadge
Selo curto `font-pixel` para estado/metadado. Combina par de cor
(`bg-*-soft` + `text-*`). Com `StatusDot` dentro quando representa estado vivo.

### PixelPanel
Container base com moldura pixel; `title` opcional (pixel, uppercase) e
`frameColor` para acento semântico (roxo = mesa do orquestrador, âmbar = avisos).

### StatusDot
Quadrado 10×10 na cor do estado; animação vem do mapa de estado (`anim` em
`state-ui.ts`). Sempre acompanhado de rótulo textual.

### StepProgress
Progresso **derivado**: blocos por etapa + texto "N de M etapas verificadas".
Nunca porcentagem inventada — regra de produto, não só de UI.

### PixelTabs
Tabs acessíveis; ativa: fundo `night-700`, texto ciano, régua inferior
`inset 0 -3px` ciano.

### Modal / Drawer
Overlay `bg-black/50–60`; painel com moldura pixel (Modal: âmbar por padrão —
decisões; Drawer: neutro). Fecham por Esc e clique no backdrop.

### DecisionBox
Modal de duas colunas: lista lateral de perguntas pendentes (com indicador de
rascunho) + detalhe com opções e resposta livre. Rodapé com "Enviar N respostas".

### AgentAvatar
Pixel art original 12×12 desenhada como `<rect>`s SVG inline
(`shape-rendering: crispEdges`), silhueta única por papel. Não usar imagens externas.

## 9. Voz e rótulos

- Interface em pt-BR; estados sempre pelos rótulos centralizados em
  [`labels.ts`](../src/shared/domain/labels.ts).
- Tudo que é simulado se declara: badge "fase 1 · simulado" na sidebar e avisos
  âmbar nas telas afetadas.
