# LUTHOR

Central de comando local (desktop, Windows) para orquestrar projetos e agentes de IA.
Você abre um workspace, envia uma tarefa para um orquestrador pai e acompanha os agentes
delegados (Frontend, Backend, Pesquisador, Verificador) em uma "Agent Office" pixel-art.

> **Fase 1 — fundação arquitetural e protótipo funcional.**
> Tudo o que se move na interface (agentes, eventos, logs, progresso, conexões) é
> **simulado**. Nenhuma integração real existe ainda — apenas contratos e pontos de
> extensão claros para a Fase 2.

## Stack

- **Electron + TypeScript + React + Vite** (via [electron-vite](https://electron-vite.org))
- **Tailwind CSS v4** com tema pixel próprio
- **Zod** — schemas de domínio são a fonte de verdade dos tipos
- **Zustand** — estado do renderer
- **Vitest + Testing Library** — testes
- Segurança: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  preload expõe apenas a API tipada `window.luthor` via `contextBridge`.

### Controles de segurança

- **Validação IPC em runtime** (`src/shared/ipc/schemas.ts` + `src/main/ipc/register.ts`):
  todo payload que chega ao main (`pauseAgent`, `resumeAgent`, `answerQuestion`,
  `profileUpdate`) é validado com Zod (`safeParse`, objetos `strict`, limites de
  tamanho). O main nunca confia nos tipos TypeScript do preload/renderer.
- **Navegação bloqueada** (`src/main/index.ts`): listener `will-navigate` impede a
  janela de navegar para fora do app (dev: só a origem do dev server; prod: só
  `file://`). `setWindowOpenHandler` nega janelas novas. Links externos abrem
  apenas no navegador do sistema e apenas com protocolo `https:`.
- **CSP por ambiente** (plugin `luthor-csp` em `electron.vite.config.ts`): o token
  `__CSP__` do `index.html` vira, em dev, o mínimo para Vite/HMR
  (`connect-src ws: http://localhost:*` + inline script do react-refresh); em
  prod/build empacotado, política restritiva sem `ws:`, sem `localhost` e sem
  scripts inline (`script-src 'self'; connect-src 'self'; object-src 'none'`).

## Como executar

```bash
npm install
npm run dev        # abre o app com hot reload
```

Scripts disponíveis:

| Script              | O que faz                                              |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Electron + Vite em modo desenvolvimento                |
| `npm run build`     | typecheck + build de main/preload/renderer para `out/` |
| `npm run package`   | build + empacota app Windows (dir) em `release/`       |
| `npm run lint`      | ESLint                                                 |
| `npm run typecheck` | `tsc --noEmit` (projetos node e web)                   |
| `npm run test`      | Vitest (state machine, schemas, simulação, componentes)|

## Arquitetura

```
┌─────────────────────────── Main process ────────────────────────────┐
│  index.ts (BrowserWindow seguro)                                    │
│  ipc/register.ts ............. handlers (invoke) por domínio        │
│  services/db/ ................ Repository (contrato) +              │
│                                InMemoryRepository (seeds) +         │
│                                schema.sql (SQLite p/ Fase 2)        │
│  services/simulation/ ........ SimulationEngine (eventos mockados)  │
│  services/integrations/ ...... SÓ CONTRATOS: AgentProvider,         │
│                                WorktreeStrategy (stubs simulados)   │
└───────────────┬─────────────────────────────────────────────────────┘
                │ IPC tipado (src/shared/ipc/contract.ts)
┌───────────────▼───────────┐   ┌────────────────────────────────────┐
│  Preload (contextBridge)  │   │  Shared                            │
│  expõe window.luthor      │   │  domain/ (schemas Zod + labels)    │
└───────────────┬───────────┘   │  state-machine/ (transições do Run)│
                │               └────────────────────────────────────┘
┌───────────────▼─────────────────────────────────────────────────────┐
│  Renderer (React + Tailwind, HashRouter)                            │
│  stores/run-store.ts ......... snapshot do run + assinatura eventos │
│  pages/ ...................... Home · Agent Office · Run ·          │
│                                Conexões · Configurações             │
│  components/ui/ .............. kit pixel acessível                  │
│  components/office/ .......... mesa do orquestrador, cards,         │
│                                drawer, modal de pergunta, ticker    │
└─────────────────────────────────────────────────────────────────────┘
```

Fluxo de dados: o `SimulationEngine` (main) mantém o snapshot do run demo e emite
`RunEvent`s em timers via `webContents.send`. O renderer assina os eventos pelo
preload e re-renderiza a partir do snapshot completo. Comandos do usuário
(pausar tudo, pausar agente, responder pergunta) voltam por `ipcRenderer.invoke`.

### Modelo de domínio (`src/shared/domain/schemas.ts`)

`Workspace`, `Task`, `Run`, `PlanStep`, `Agent`, `AgentProfile`, `Checkpoint`,
`Question`, `RunEvent` — todos com schema Zod.

- **Máquina de estados do Run** (`src/shared/state-machine/run-state.ts`):
  `draft → planning → running ⇄ awaiting_user ⇄ paused → verifying → completed | failed | cancelled`.
  Transições fora do mapa lançam `InvalidTransitionError`.
- **Estados de agente**: planejando, aguardando, executando, verificando,
  pergunta pendente, pausado, concluído, falhou.
- **Progresso** é sempre derivado dos steps ("3 de 5 etapas verificadas") —
  nunca porcentagem inventada.
- **Isolamento de escrita**: `Agent.writeScope` + `Agent.worktreeRef` preparam a
  estratégia de worktrees Git. Regra já validada (`validateWriterIsolation`):
  dois agentes `writer` jamais compartilham a mesma working copy.

## O que é mockado nesta fase

| Área                        | Estado na Fase 1                                             | Ponto de extensão                                   |
| --------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Eventos/logs/agentes        | `SimulationEngine` roteiriza o run demo                      | `src/main/services/simulation/`                     |
| Claude Code / Codex / Node  | Cards "não configurado", sem CLI, sem chaves, sem detecção   | `AgentProvider` em `services/integrations/`         |
| Worktrees Git               | Refs fictícios; regra de isolamento validada em memória      | `WorktreeStrategy` em `services/integrations/`      |
| Persistência                | `InMemoryRepository` com seeds                               | Interface `Repository` + `schema.sql` (SQLite)      |
| Abrir workspace             | Só seleciona e registra a pasta (nada é lido ou executado)   | handler em `src/main/ipc/register.ts`               |
| Terminal / Ollama / OAuth   | Não existem                                                  | Fase 2                                              |

### Interações da Agent Office

- **Caixa de Decisões**: perguntas pendentes de todos os agentes ficam consolidadas em
  um só lugar — contador no topo, lista lateral para navegar entre perguntas, rascunhos
  preservados e envio em lote ("Enviar N respostas"). Agentes consolidam dúvidas em vez
  de pausar sozinhos.
- **Composer persistente**: "Nova tarefa" está sempre disponível (inclusive com run
  terminado) e cria um **novo run simulado** no workspace ativo — com escolha de modo:
  fluxo padrão sequencial ou a demo explícita "corrigir cinco bugs" com squad dinâmica.
  "Direcionar run" só aparece com run ativo e registra `user_direction` no run atual
  (escopo: Orquestrador, todos ou uma instância ativa — concluídas ficam no histórico).
- **Estados terminais**: em `completed`/`failed`/`cancelled`, "Pausar tudo" e
  "Direcionar run" somem; ficam o selo de estado final, "Nova tarefa" e o painel de
  resumo com **"Continuar a partir deste run"** (vínculo conceitual mockado — sem
  memória real na Fase 1).
- **Squad dinâmica (demo)**: o orquestrador mockado cria instâncias `sonnet-worker`
  em grupo, com fila respeitando limites SIMULADOS (3 processos, 2 escritores por
  workspace — nenhum processo real). Na Agent Office a squad aparece como card
  agregado expansível (`Squad Sonnet · 2 ativos · 2 na fila · 1 concluído`).
- **Perfis × instâncias**: perfis (Configurações) são configurações reutilizáveis;
  instâncias de agentes são trabalhadores temporários de um run específico.
- **Configurações**: criar, duplicar, remover e ativar/desativar perfis mockados —
  tudo em memória, descartado ao fechar o app (aviso visível na tela).

### Run demo seedado

"**Adicionar autenticação ao projeto**" — 5 etapas (3 já verificadas), Backend
(`sonnet-worker`) executando a etapa 4, Frontend (`codex-high`) aguardando
dependência, Pesquisador (`local-helper`) concluído. Após alguns segundos o
Verificador abre uma **pergunta pendente** (expiração de sessão); responder
destrava a verificação da etapa 4 e o Frontend, até o run completar.
**Pausar tudo** congela o timer de eventos de verdade; **Retomar** continua.

## Bandeja do sistema (implementado para a simulação)

O LUTHOR agora vive na bandeja do Windows, ao lado do relógio:

- Clicar no **X** não encerra: a janela é ocultada e o `SimulationEngine` continua
  rodando (run em execução avança; run pausado permanece pausado). Uma notificação
  explica isso na primeira vez.
- Clique no ícone da bandeja (ou "Abrir LUTHOR" no menu) restaura e foca a janela.
- Menu de contexto: **Abrir LUTHOR** · **Pausar tudo** (só com run ativo) ·
  **Retomar tudo** (só com run pausado) · **Sair do LUTHOR** (encerramento real,
  sempre disponível). Sem trabalho ativo, pausar/retomar somem do menu.
- Ícone pixel original gerado em código (`src/main/tray/tray-icon.ts`) — sem asset
  externo e sem dependência de caminho, funcionando igual no empacotamento.
- Toda a lógica fica no processo main (`lifecycle/window-lifecycle.ts`, `tray/`);
  o renderer continua limitado à bridge IPC segura.

Roadmap: preferência configurável nas Configurações para escolher entre
"minimizar para a bandeja" e "encerrar ao clicar no X".

## Direção visual

Sistema documentado em [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) ("LUTHOR Pixel UI"):
tokens, tipografia, espaçamento, molduras pixel, breakpoints, foco, movimento e
variantes de componentes.

Interface escura azul-noite/grafite com pixel art funcional **original**
(molduras recortadas via box-shadow, avatares SVG desenhados no projeto).
Cores funcionais: ciano/verde = execução saudável · roxo = orquestração ·
âmbar = atenção · coral = bloqueio/pausa/erro. Fonte pixelada (Silkscreen) só em
títulos, rótulos e números; texto longo em Inter e logs em JetBrains Mono.
Animações pequenas só refletem eventos reais e respeitam `prefers-reduced-motion`.
