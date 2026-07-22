# LUTHOR

Central de comando local (desktop, Windows) para trabalho real em projetos com o
executor **Codex CLI**. Você abre um workspace real, cria uma tarefa e acompanha a
execução em uma "Agent Office" pixel-art. Instalação nova abre **limpa** (sem
conteúdo demonstrativo) — o CTA é **Abrir workspace**. Modos simulados existem
apenas para explorar a interface sem chamar IA.

> **Fase 2B — primeiro executor REAL via Codex CLI (concluída).**
> "Nova tarefa" agora oferece o modo **Executor Codex (real)**: um único processo
> `codex exec` por vez, rodando com `cwd` no workspace ativo validado, sandbox
> `workspace-write`, logs JSONL estruturados, cancelamento gracioso e transcript
> local. A CLI é **detectada** (binário/versão/auth) — nada é assumido; sem login
> automático e sem tokens armazenados. A simulação da Fase 1 permanece como modo
> padrão e fallback visual.

## Executor real — Codex CLI (Fase 2B)

- **Detecção honesta** (`src/main/services/codex/codex-detector.ts`): `codex
  --version`, capacidades via `codex exec --help` (`--json`, `--sandbox`,
  `--cd`, `--skip-git-repo-check`) e auth via `codex login status`. Se não
  autenticado, a tela Conexões instrui `codex login` no SEU terminal.
- **Processo isolado** (`codex-runner.ts`): spawn sem shell, `cwd` = caminho
  canônico do workspace ativo, `--sandbox workspace-write` (trabalho só dentro
  do workspace; nunca `danger-full-access` nem bypass de aprovações).
- **Sem dados inventados**: modelo aparece só se a CLI informar nos eventos
  JSONL; não há steps, porcentagens, tokens nem custo fabricados.
- **Git só leitura antes do run**: `rev-parse` + `status --porcelain` para
  avisar sobre mudanças pré-existentes (registradas no metadata). Nenhuma
  escrita Git.
- **Cancelamento real**: sem pausa fingida — "Cancelar run" interrompe
  graciosamente e força (`taskkill /T`) só após 5s. "Sair do LUTHOR" com run
  real ativo pergunta: cancelar e sair, ou manter aberto.
- **Transcript local** em `userData/runs/<runId>/` (JSONL limitado a 2 MB +
  metadata.json), sem variáveis de ambiente, tokens ou segredos.
- **X da janela** continua só ocultando para a bandeja; o processo real segue
  rodando oculto.

## Console de execução real e contexto seguro (Fase 2B.1)

- **Aba "Resultado"** no detalhe de um run real (`RunResultPanel`): resposta
  final da IA **sem truncar**, estado final, provider/versão, modelo só se a
  CLI informar, duração, cancelamento/falha, aviso de mudanças Git
  pré-existentes e **resumo de arquivos alterados** (Git de leitura,
  novos × pré-existentes). Logs técnicos ficam em aba própria; o transcript
  bruto continua local e limitado.
- **Capacidades honestas por provider** (`shared/domain/provider-capabilities.ts`):
  contrato genérico (modelos, esforço, uso, imagens, referências, plano,
  perguntas). Para o Codex atual: **não enumera modelos** → composer mostra só
  "Usar padrão da CLI"; esforço não configurável; o perfil exibido reflete a
  **configuração efetiva** (`effectiveConfig`), não um nome decorativo.
  Estrutura preparada para o futuro `claude-opus-orchestrator` (Fase 2C, não
  integrado).
- **Contexto @arquivo/@pasta** (`context-references.ts`): picker nativo limitado
  ao workspace ativo, caminhos **relativos**, denylist por padrão (.env, chaves,
  .git, node_modules, binários, arquivos > 1 MB), lista removível e instrução
  clara anexada ao prompt. Sem varredura ampla — o Codex decide o que abrir.
- **Uso honesto**: só tokens/custo que a CLI emitir estruturados; caso
  contrário, "Uso por run não informado pela CLI" + link para o painel oficial.
  Nunca estimamos consumo.
- **Imagens**: a flag pode existir, mas o envio **não é suportado** nesta fase —
  o composer avisa em vez de aceitar e descartar silenciosamente.

## Refinamento de UX do executor real (rodada 2B.1b)

- **Conclusão no Agent Office** (`RunCompletionPanel`): em run real terminal, um
  painel compacto abaixo do orquestrador mostra estado, **duração congelada**,
  o começo da resposta (truncado), "Ver resultado completo" e "Nova tarefa". A
  aba Resultado continua sendo a fonte auditável completa.
- **Nova tarefa no detalhe do Run**: botão no header (mesmo em estado terminal)
  cria um novo run; "Continuar a partir deste run" é só prefill conceitual.
- **Duração honesta** (domínio `finishedAt` em Agent/Run + `durationMs`):
  congela ao concluir/falhar/cancelar; nunca usa "agora" para item terminal.
- **Orquestrador LUTHOR vs Worker Codex** (`LuthorOrchestratorPanel`): camada
  local "sem IA própria nesta fase" + progresso de execução honesto
  (`1 execução em andamento/concluída/aguardando`), nunca "0 de 0 etapas". O
  card do worker mostra só a **configuração efetiva** (`Codex CLI · padrão da
  CLI`), nunca `codex-high`/`high`.
- **Composer**: resumo explícito (Executor: Codex CLI · Modelo: padrão da CLI ·
  Esforço: não configurável) + nota "Fase 2C"; autocomplete `@` sob demanda,
  atalhos `/arquivo` e `/pasta` (locais, não comandos do provider); imagem com
  controle desabilitado e aviso ao colar/arrastar.
- **Pergunta estruturada → `awaiting_user`** (marcador `@@LUTHOR_NEEDS_INPUT@@`):
  o run real NÃO conclui silenciosamente pedindo esclarecimento — vira
  `awaiting_user`, o worker fica "Aguardando sua resposta" e a Caixa de Decisões
  abre a pergunta. Responder inicia uma **continuação auditável real** (nova
  execução com tarefa original + resposta + contexto limitado), sem depender de
  `resume` não verificado da CLI. Runs antigos com pergunta não estruturada têm
  "Responder e continuar deste resultado" (prefill, sem retomar o processo).

## Produto focado em workspaces reais (rodada 2B.1c)

- **Instalação nova = estado limpo**: nenhum workspace demo, run simulado ou
  agente fictício é criado automaticamente; a Agent Office abre com o CTA
  **Abrir workspace** / **Nova tarefa**. O `SimulationEngine` e as fixtures
  seguem só para testes/dev. Demos antigas persistidas são preservadas e
  removíveis com **"Remover demonstrações"** (só registros `origin: demo`;
  projetos reais nunca são tocados).
- **Timer terminal congelado de verdade**: além do helper de domínio, as
  origens renderizadas (`AgentCard`, `SquadCard`, aba de execução do Run) usam
  `formatDuration(startedAt, finishedAt, terminal, now)` — item terminal nunca
  usa `now`. Verificado por smoke visual: um agente concluído manteve `13m00s`
  por ~73s enquanto os ativos avançaram.
- **Referências no texto + paleta `/`**: a escolha por `@` autocomplete ou pelo
  diálogo insere um token legível (`@src/teste.ts`) na frase, vinculado à chip;
  remover a chip remove o token; digitar `@algo` à mão NÃO anexa. A barra `/`
  abre a paleta local do Composer — `/arquivo` e `/pasta` funcionam; `/skill`,
  `/plan`, `/goal` aparecem preparados mas desabilitados (não fingem funcionar).
- **Abas contextuais do Run**: principais **Resultado · Execução · Logs**;
  **Plano** só com plano real, **Agentes** só com múltiplas instâncias,
  **Decisões** (ex-"Perguntas") só com pergunta/resposta/continuação,
  **Checkpoints** só com marco real. Áreas que podem ficar vazias explicam para
  que servem.

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
- **Workspaces validados no main** (`src/main/services/workspaces/`): o renderer
  nunca envia caminhos livres nem acessa filesystem — a única origem de um caminho
  é o diálogo nativo, e mesmo esse resultado é validado no main (absoluto,
  existente, diretório, canonicalizado via `realpath`, deduplicado por chave de
  caminho case-insensitive no Windows). Nenhuma leitura ampla do disco: apenas
  `stat`/`realpath` da pasta escolhida; nada dentro do workspace é lido, inspecionado
  ou executado (nem Git).

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
│                                InMemoryRepository (run demo/perfis) │
│                                + schema.sql (SQLite futuro)         │
│  services/workspaces/ ........ Fase 2A: registro REAL e persistente │
│                                (JSON versionado + migrações),       │
│                                validação de caminho e política de   │
│                                workspace ativo                      │
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

## Workspaces reais (Fase 2A)

- **Home = central de workspaces**: cadastrar ("Abrir workspace" via diálogo
  nativo), ativar, remover registro e navegar para o detalhe de cada workspace.
  Projetos reais (`origin: user`) e exemplos demonstrativos (`origin: demo`,
  removíveis) ficam em seções separadas — nunca se misturam.
- **Persistência com migrações**: `workspaces.json` versionado em `userData`
  (gravação atômica via arquivo temporário + rename; arquivo corrompido vira
  backup `.corrupt-*` e o registro recomeça com seeds). Migração v0→v1 cobre o
  formato da Fase 1. Persistidos: nome, caminho, origem, data de cadastro,
  última abertura e workspace ativo.
- **Um workspace ativo, um run por vez**: o ativo aparece na barra de título,
  na Home e no Agent Office. Com run simulado ativo, a troca/remoção do
  workspace ativo é **bloqueada** com aviso na UI (concorrência entre
  workspaces é fase futura) — dá para aguardar concluir ou cancelar o run.
- **Detalhe do workspace** (`/workspace/:id`): nome, caminho, datas, origem e o
  estado "pronto para agentes na Fase 2B", com o aviso de que nesta fase nenhum
  arquivo do projeto é alterado.

## O que segue mockado nesta fase

| Área                        | Estado na Fase 2A                                            | Ponto de extensão                                   |
| --------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Eventos/logs/agentes        | `SimulationEngine` roteiriza o run demo                      | `src/main/services/simulation/`                     |
| Claude Code / Codex / Node  | Cards "não configurado", sem CLI, sem chaves, sem detecção   | `AgentProvider` em `services/integrations/`         |
| Worktrees Git               | Refs fictícios; regra de isolamento validada em memória      | `WorktreeStrategy` em `services/integrations/`      |
| Run demo + perfis           | `InMemoryRepository` com seeds (descartados ao fechar)       | Interface `Repository` + `schema.sql` (SQLite)      |
| Conteúdo do workspace       | Nada é lido, inspecionado ou executado (nem Git)             | Fase 2B                                             |
| Terminal / Ollama / OAuth   | Não existem                                                  | Fase 2B+                                            |

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

## Roadmap

- **Fase 1 — protótipo visual/simulado**: ✅ concluída e congelada (identidade
  LUTHOR Pixel UI, segurança Electron, bandeja, simulação e testes preservados).
- **Fase 2A — workspaces locais reais e persistentes**: ✅ concluída (registro
  persistente com migrações, validação de caminho no main, workspace ativo,
  bloqueio de troca com run ativo, telas de central e detalhe).
- **Fase 2B — primeiro executor real (Codex CLI)**: ✅ concluída. Um único
  processo real por vez, sandboxed no workspace ativo, com detecção de CLI,
  logs estruturados, cancelamento gracioso e transcript local — mesma IPC,
  mesmo snapshot, mesmo renderer.
- **Fase 2B.1 — console de execução real e contexto seguro**: ✅ concluída. Aba
  Resultado auditável, capacidades honestas por provider, referências
  @arquivo/@pasta limitadas ao workspace e seção de Uso sem estimativas.
- **Fase 2C (reservada) — Claude/Opus como orquestrador**: perfil
  `claude-opus-orchestrator` (estrutura já preparada, não integrada),
  delegação e múltiplos agentes reais.
- **Fases futuras**: workspaces em paralelo, worktrees Git reais, diff visual,
  anexos de imagem, `/plan` executável, perguntas interativas da CLI, OAuth e
  modelos locais.

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
