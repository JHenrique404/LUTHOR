import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Workspace } from '../src/shared/domain'
import { createSeedSnapshot, createSeedWorkspaces } from '../src/main/services/db/seed'
import { SimulationEngine } from '../src/main/services/simulation/simulation-engine'
import {
  pathKey,
  validateWorkspacePath
} from '../src/main/services/workspaces/path-validation'
import { JsonWorkspaceRegistry } from '../src/main/services/workspaces/workspace-registry'
import { WorkspaceService } from '../src/main/services/workspaces/workspace-service'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'luthor-ws-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

async function makeProjectDir(name: string): Promise<string> {
  const path = join(dir, name)
  await fs.mkdir(path, { recursive: true })
  return path
}

describe('validateWorkspacePath — validação no processo main', () => {
  it('rejeita caminho relativo', async () => {
    const result = await validateWorkspacePath('projetos/meu-app')
    expect(result).toMatchObject({ ok: false, code: 'invalid_path' })
  })

  it('rejeita caminho vazio', async () => {
    const result = await validateWorkspacePath('   ')
    expect(result).toMatchObject({ ok: false, code: 'invalid_path' })
  })

  it('rejeita pasta inexistente', async () => {
    const result = await validateWorkspacePath(join(dir, 'nao-existe'))
    expect(result).toMatchObject({ ok: false, code: 'path_not_found' })
  })

  it('rejeita arquivo (não é diretório)', async () => {
    const file = join(dir, 'arquivo.txt')
    await fs.writeFile(file, 'x')
    const result = await validateWorkspacePath(file)
    expect(result).toMatchObject({ ok: false, code: 'not_a_directory' })
  })

  it('aceita diretório real e canonicaliza', async () => {
    const path = await makeProjectDir('meu-app')
    const result = await validateWorkspacePath(path)
    expect(result.ok).toBe(true)
    // realpath resolve links e expande nomes curtos 8.3 do Windows.
    const canonical = await fs.realpath(path)
    if (result.ok) expect(pathKey(result.canonicalPath)).toBe(pathKey(canonical))
  })
})

describe('JsonWorkspaceRegistry — persistência com migrações', () => {
  it('primeira execução: seeds demo aplicados e ativo definido', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const state = registry.state()
    expect(state.workspaces).toHaveLength(3)
    expect(state.workspaces.every((w) => w.origin === 'demo')).toBe(true)
    expect(state.activeWorkspaceId).toBe('ws-meu-saas')
  })

  it('cadastro persiste e sobrevive à reabertura (novo processo)', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const path = await makeProjectDir('projeto-real')
    const { workspace } = await registry.register({ path, origin: 'user' })
    await registry.setActive(workspace.id)

    const reopened = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const state = reopened.state()
    expect(state.workspaces).toHaveLength(4)
    expect(state.activeWorkspaceId).toBe(workspace.id)
    const persisted = state.workspaces.find((w) => w.id === workspace.id)
    expect(persisted?.path).toBe(path)
    expect(persisted?.origin).toBe('user')
    expect(persisted?.createdAt).toBeGreaterThan(0)
  })

  it('deduplica por caminho canônico (case e separador final no Windows)', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir })
    const path = await makeProjectDir('duplicado')
    const first = await registry.register({ path, origin: 'user' })
    const variant = process.platform === 'win32' ? `${path.toUpperCase()}${sep}` : `${path}${sep}`
    const second = await registry.register({ path: variant, origin: 'user' })
    expect(second.alreadyRegistered).toBe(true)
    expect(second.workspace.id).toBe(first.workspace.id)
    expect(registry.state().workspaces).toHaveLength(1)
  })

  it('reabrir workspace já cadastrado atualiza lastOpenedAt', async () => {
    let clock = 1_000
    const registry = await JsonWorkspaceRegistry.open({ dir, now: () => clock })
    const path = await makeProjectDir('reaberto')
    const first = await registry.register({ path, origin: 'user' })
    clock = 2_000
    const second = await registry.register({ path, origin: 'user' })
    expect(second.workspace.lastOpenedAt).toBeGreaterThan(first.workspace.lastOpenedAt)
  })

  it('remoção do ativo promove o mais recente restante', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const promoted = await registry.remove('ws-meu-saas')
    expect(promoted?.id).toBe('ws-site-portfolio')
    expect(registry.state().activeWorkspaceId).toBe('ws-site-portfolio')
    expect(registry.state().workspaces).toHaveLength(2)
  })

  it('INSTALAÇÃO NOVA abre limpa: sem seeds demo (produção usa seed vazio)', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: () => [] })
    expect(registry.state().workspaces).toHaveLength(0)
    expect(registry.state().activeWorkspaceId).toBeNull()
    expect(registry.countDemos()).toBe(0)
  })

  it('removeDemos apaga SÓ origin:demo; preserva workspaces do usuário', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const path = await makeProjectDir('projeto-real')
    const { workspace } = await registry.register({ path, origin: 'user' })
    expect(registry.countDemos()).toBe(3)

    const state = await registry.removeDemos()
    expect(state.workspaces).toHaveLength(1)
    expect(state.workspaces[0].id).toBe(workspace.id)
    expect(state.workspaces[0].origin).toBe('user')
    // Ativo era demo (ws-meu-saas) → promovido ao real restante.
    expect(state.activeWorkspaceId).toBe(workspace.id)
    expect(registry.countDemos()).toBe(0)
  })

  it('migra formato legado v0 (Fase 1) para v1', async () => {
    const legacy = {
      workspaces: [
        { id: 'ws-meu-saas', name: 'meu-saas', path: 'C:\\dev\\meu-saas', lastOpenedAt: 111 },
        { id: 'ws-antigo', name: 'antigo', path: 'C:\\dev\\antigo', lastOpenedAt: 999 }
      ]
    }
    await fs.writeFile(join(dir, 'workspaces.json'), JSON.stringify(legacy), 'utf8')
    const registry = await JsonWorkspaceRegistry.open({ dir })
    const state = registry.state()
    expect(state.workspaces).toHaveLength(2)
    expect(state.workspaces.find((w) => w.id === 'ws-meu-saas')?.origin).toBe('demo')
    const migrated = state.workspaces.find((w) => w.id === 'ws-antigo')
    expect(migrated?.origin).toBe('user')
    expect(migrated?.createdAt).toBe(999)
    expect(state.activeWorkspaceId).toBe('ws-antigo')
  })

  it('arquivo corrompido: preserva backup e recomeça com seeds', async () => {
    await fs.writeFile(join(dir, 'workspaces.json'), '{nem json', 'utf8')
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    expect(registry.state().workspaces).toHaveLength(3)
    const files = await fs.readdir(dir)
    expect(files.some((f) => f.includes('corrupt'))).toBe(true)
  })
})

function makeService(
  registry: JsonWorkspaceRegistry,
  busy: () => boolean,
  changes: Workspace[] = []
): WorkspaceService {
  return new WorkspaceService({
    registry,
    isRunBusy: busy,
    onActiveChanged: (ws) => changes.push(ws)
  })
}

describe('WorkspaceService — política de workspace ativo (Fase 2A)', () => {
  it('openPath valida, registra e ativa quando não há run ativo', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const changes: Workspace[] = []
    const service = makeService(registry, () => false, changes)
    const path = await makeProjectDir('novo-projeto')

    const result = await service.openPath(path)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.activated).toBe(true)
    expect(result.alreadyRegistered).toBe(false)
    expect(result.state.activeWorkspaceId).toBe(result.workspace.id)
    expect(changes.map((w) => w.id)).toContain(result.workspace.id)
  })

  it('removeDemos remove só exemplos; run ativo bloqueia', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const path = await makeProjectDir('meu-real')
    await registry.register({ path, origin: 'user' })

    // Bloqueado com run ativo.
    const blocked = await makeService(registry, () => true).removeDemos()
    expect(blocked.status).toBe('error')
    if (blocked.status === 'error') expect(blocked.code).toBe('blocked_by_active_run')

    // Livre: remove os 3 demos, mantém o real.
    const ok = await makeService(registry, () => false).removeDemos()
    expect(ok.status).toBe('ok')
    if (ok.status === 'ok') {
      expect(ok.state.workspaces).toHaveLength(1)
      expect(ok.state.workspaces[0].origin).toBe('user')
    }
  })

  it('openPath com run ativo: registra sem ativar (troca bloqueada)', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const service = makeService(registry, () => true)
    const path = await makeProjectDir('registrado-apenas')

    const result = await service.openPath(path)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.activated).toBe(false)
    expect(result.state.activeWorkspaceId).toBe('ws-meu-saas')
    expect(result.state.workspaces.map((w) => w.id)).toContain(result.workspace.id)
  })

  it('openPath rejeita pasta inválida', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir })
    const service = makeService(registry, () => false)
    const result = await service.openPath(join(dir, 'inexistente'))
    expect(result).toMatchObject({ status: 'error', code: 'path_not_found' })
  })

  it('setActive troca quando livre e bloqueia com run ativo', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    let busy = false
    const service = makeService(registry, () => busy)

    const ok = await service.setActive('ws-cli-tools')
    expect(ok).toMatchObject({ status: 'ok' })
    expect(registry.state().activeWorkspaceId).toBe('ws-cli-tools')

    busy = true
    const blocked = await service.setActive('ws-site-portfolio')
    expect(blocked).toMatchObject({ status: 'error', code: 'blocked_by_active_run' })
    expect(registry.state().activeWorkspaceId).toBe('ws-cli-tools')
  })

  it('setActive no workspace já ativo é no-op mesmo com run ativo', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const service = makeService(registry, () => true)
    const result = await service.setActive('ws-meu-saas')
    expect(result).toMatchObject({ status: 'ok' })
  })

  it('remover o ativo é bloqueado com run ativo; os demais podem sair', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir, seed: createSeedWorkspaces })
    const service = makeService(registry, () => true)

    const blocked = await service.remove('ws-meu-saas')
    expect(blocked).toMatchObject({ status: 'error', code: 'blocked_by_active_run' })

    const ok = await service.remove('ws-cli-tools')
    expect(ok).toMatchObject({ status: 'ok' })
    if (ok.status === 'ok') expect(ok.state.workspaces).toHaveLength(2)
  })

  it('workspace desconhecido gera erro claro', async () => {
    const registry = await JsonWorkspaceRegistry.open({ dir })
    const service = makeService(registry, () => false)
    expect(await service.setActive('ws-fantasma')).toMatchObject({
      status: 'error',
      code: 'unknown_workspace'
    })
    expect(await service.remove('ws-fantasma')).toMatchObject({
      status: 'error',
      code: 'unknown_workspace'
    })
  })
})

describe('SimulationEngine — integração com workspaces (Fase 2A)', () => {
  function makeEngine(): SimulationEngine {
    return new SimulationEngine({ snapshot: createSeedSnapshot(), emit: () => {} })
  }

  it('isBusy true com run em andamento; cancelRun libera', () => {
    const engine = makeEngine()
    expect(engine.isBusy()).toBe(true)
    const snapshot = engine.cancelRun()
    expect(snapshot.run.state).toBe('cancelled')
    expect(engine.isBusy()).toBe(false)
  })

  it('cancelRun em run terminal é no-op', () => {
    const engine = makeEngine()
    engine.cancelRun()
    const again = engine.cancelRun()
    expect(again.run.state).toBe('cancelled')
  })

  it('setWorkspace atualiza snapshot e novas tarefas pertencem ao ativo', () => {
    const engine = makeEngine()
    const workspace: Workspace = {
      id: 'ws-real',
      name: 'projeto-real',
      path: 'C:\\projetos\\real',
      origin: 'user',
      createdAt: 1,
      lastOpenedAt: 2
    }
    engine.setWorkspace(workspace)
    expect(engine.getSnapshot().workspace.id).toBe('ws-real')

    const snapshot = engine.startNewRun({ text: 'Nova tarefa de teste', mode: 'standard' })
    expect(snapshot.task.workspaceId).toBe('ws-real')
    expect(snapshot.workspace.id).toBe('ws-real')
    engine.stop()
  })
})
