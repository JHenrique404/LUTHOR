import type { AgentProfile, RunSnapshot, Workspace } from '@shared/domain'

/**
 * Dados demonstrativos da Fase 1 — TUDO AQUI É SIMULADO.
 * Run demo: "Adicionar autenticação ao projeto".
 */

const MIN = 60_000

export function createSeedProfiles(): AgentProfile[] {
  return [
    {
      id: 'opus-orchestrator',
      name: 'opus-orchestrator',
      provider: 'claude_code',
      model: 'claude-opus',
      effortDefault: 'high',
      active: true,
      description: 'Perfil de orquestração: planeja, delega e verifica etapas.'
    },
    {
      id: 'sonnet-worker',
      name: 'sonnet-worker',
      provider: 'claude_code',
      model: 'claude-sonnet',
      effortDefault: 'medium',
      active: true,
      description: 'Perfil de execução para subtasks de código.'
    },
    {
      id: 'codex-high',
      name: 'codex-high',
      provider: 'codex',
      model: 'codex',
      effortDefault: 'high',
      active: true,
      description: 'Perfil Codex com esforço alto para tarefas complexas.'
    },
    {
      id: 'local-helper',
      name: 'local-helper',
      provider: 'local_node',
      model: 'local-small',
      effortDefault: 'low',
      active: true,
      description: 'Perfil local para pesquisas e tarefas auxiliares.'
    }
  ]
}

export function createSeedWorkspaces(now = Date.now()): Workspace[] {
  return [
    {
      id: 'ws-meu-saas',
      name: 'meu-saas',
      path: 'C:\\dev\\meu-saas',
      lastOpenedAt: now - 8 * MIN
    },
    {
      id: 'ws-site-portfolio',
      name: 'site-portfolio',
      path: 'C:\\dev\\site-portfolio',
      lastOpenedAt: now - 26 * 60 * MIN
    },
    {
      id: 'ws-cli-tools',
      name: 'cli-tools',
      path: 'C:\\dev\\cli-tools',
      lastOpenedAt: now - 3 * 24 * 60 * MIN
    }
  ]
}

export function createSeedSnapshot(now = Date.now()): RunSnapshot {
  const workspace = createSeedWorkspaces(now)[0]
  const runId = 'run-auth-demo'

  return {
    workspace,
    task: {
      id: 'task-auth',
      workspaceId: workspace.id,
      title: 'Adicionar autenticação ao projeto',
      prompt:
        'Adicionar autenticação completa: modelo de usuários, sessões, endpoints de login/registro, proteção de rotas e telas de login.',
      createdAt: now - 42 * MIN
    },
    run: {
      id: runId,
      taskId: 'task-auth',
      state: 'running',
      startedAt: now - 40 * MIN,
      updatedAt: now
    },
    steps: [
      {
        id: 'step-1',
        runId,
        index: 1,
        title: 'Mapear rotas e requisitos de autenticação',
        status: 'verified',
        assignedAgentId: 'ag-researcher'
      },
      {
        id: 'step-2',
        runId,
        index: 2,
        title: 'Modelar usuários e sessões no banco',
        status: 'verified',
        assignedAgentId: 'ag-backend'
      },
      {
        id: 'step-3',
        runId,
        index: 3,
        title: 'Implementar endpoints de login e registro',
        status: 'verified',
        assignedAgentId: 'ag-backend'
      },
      {
        id: 'step-4',
        runId,
        index: 4,
        title: 'Proteger rotas da API com middleware de sessão',
        status: 'in_progress',
        assignedAgentId: 'ag-backend'
      },
      {
        id: 'step-5',
        runId,
        index: 5,
        title: 'Criar telas de login e registro no frontend',
        status: 'pending',
        assignedAgentId: 'ag-frontend'
      }
    ],
    agents: [
      {
        id: 'ag-orchestrator',
        runId,
        role: 'orchestrator',
        name: 'Orquestrador',
        profileId: 'opus-orchestrator',
        state: 'executing',
        subtask: 'Coordenar o plano de autenticação e verificar etapas',
        effort: 'high',
        writeScope: 'read_only',
        worktreeRef: null,
        startedAt: now - 40 * MIN,
        lastEventAt: now - MIN,
        lastEventMessage: 'Etapa 4 delegada ao Backend'
      },
      {
        id: 'ag-backend',
        runId,
        role: 'backend',
        name: 'Backend',
        profileId: 'sonnet-worker',
        state: 'executing',
        subtask: 'Middleware de sessão e proteção de rotas da API',
        effort: 'medium',
        writeScope: 'writer',
        worktreeRef: 'wt/backend-auth',
        startedAt: now - 18 * MIN,
        lastEventAt: now - MIN,
        lastEventMessage: 'Escrevendo middleware de sessão'
      },
      {
        id: 'ag-frontend',
        runId,
        role: 'frontend',
        name: 'Frontend',
        profileId: 'codex-high',
        state: 'waiting',
        subtask: 'Telas de login e registro',
        effort: 'high',
        writeScope: 'writer',
        worktreeRef: 'wt/frontend-auth',
        startedAt: now - 12 * MIN,
        lastEventAt: now - 5 * MIN,
        lastEventMessage: 'Aguardando conclusão da etapa 4'
      },
      {
        id: 'ag-researcher',
        runId,
        role: 'researcher',
        name: 'Pesquisador',
        profileId: 'local-helper',
        state: 'completed',
        subtask: 'Comparar estratégias de hash de senha',
        effort: 'low',
        writeScope: 'read_only',
        worktreeRef: null,
        startedAt: now - 38 * MIN,
        lastEventAt: now - 25 * MIN,
        lastEventMessage: 'Relatório entregue ao orquestrador'
      },
      {
        id: 'ag-verifier',
        runId,
        role: 'verifier',
        name: 'Verificador',
        profileId: 'sonnet-worker',
        state: 'verifying',
        subtask: 'Validar fluxo de sessão de ponta a ponta',
        effort: 'medium',
        writeScope: 'read_only',
        worktreeRef: null,
        startedAt: now - 10 * MIN,
        lastEventAt: now - 2 * MIN,
        lastEventMessage: 'Analisando expiração de sessão'
      }
    ],
    questions: [],
    checkpoints: [
      {
        id: 'cp-1',
        runId,
        label: 'Plano aprovado com 5 etapas',
        stepIndex: 0,
        createdAt: now - 39 * MIN
      },
      {
        id: 'cp-2',
        runId,
        label: 'Modelo de usuários e sessões verificado',
        stepIndex: 2,
        createdAt: now - 24 * MIN
      },
      {
        id: 'cp-3',
        runId,
        label: 'Endpoints de login e registro verificados',
        stepIndex: 3,
        createdAt: now - 9 * MIN
      }
    ],
    events: [
      {
        id: 'evt-seed-1',
        runId,
        agentId: null,
        type: 'task_received',
        message: 'Tarefa recebida: Adicionar autenticação ao projeto',
        at: now - 42 * MIN
      },
      {
        id: 'evt-seed-2',
        runId,
        agentId: 'ag-orchestrator',
        type: 'plan_created',
        message: 'Orquestrador criou plano com 5 etapas',
        at: now - 39 * MIN
      },
      {
        id: 'evt-seed-3',
        runId,
        agentId: 'ag-backend',
        type: 'step_verified',
        message: 'Etapa 3 verificada: endpoints de login e registro',
        at: now - 9 * MIN
      },
      {
        id: 'evt-seed-4',
        runId,
        agentId: 'ag-backend',
        type: 'agent_log',
        message: 'Backend iniciou middleware de sessão (etapa 4)',
        at: now - 2 * MIN
      }
    ],
    profiles: createSeedProfiles()
  }
}
