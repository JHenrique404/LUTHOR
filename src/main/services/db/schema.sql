-- LUTHOR — schema SQLite preparado para a Fase 2.
-- NÃO usado na Fase 1 (InMemoryRepository é o caminho garantido).
-- Espelha os schemas Zod em src/shared/domain/schemas.ts.

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  last_opened_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  state TEXT NOT NULL CHECK (state IN (
    'draft','planning','running','awaiting_user','paused',
    'verifying','completed','failed','cancelled')),
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','in_progress','verified','failed')),
  assigned_agent_id TEXT
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('claude_code','codex','local_node')),
  model TEXT NOT NULL,
  effort_default TEXT NOT NULL CHECK (effort_default IN ('low','medium','high')),
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  role TEXT NOT NULL CHECK (role IN ('orchestrator','frontend','backend','researcher','verifier')),
  name TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES agent_profiles(id),
  state TEXT NOT NULL CHECK (state IN (
    'planning','waiting','executing','verifying',
    'question_pending','paused','completed','failed')),
  subtask TEXT NOT NULL,
  effort TEXT NOT NULL CHECK (effort IN ('low','medium','high')),
  -- Preparação para worktrees Git: writers exigem worktree_ref exclusivo.
  write_scope TEXT NOT NULL CHECK (write_scope IN ('read_only','writer')),
  worktree_ref TEXT,
  started_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  last_event_message TEXT NOT NULL
);

-- Dois writers jamais compartilham a mesma working copy.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_writer_worktree
  ON agents(run_id, worktree_ref) WHERE write_scope = 'writer';

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  label TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  text TEXT NOT NULL,
  options_json TEXT NOT NULL,
  allow_free_text INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','answered')),
  answer TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  agent_id TEXT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, at);
