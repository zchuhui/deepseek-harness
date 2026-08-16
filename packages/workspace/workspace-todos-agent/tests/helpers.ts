/** Shared harness: storage + domain form + registry + todos + tools + agents + integration. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import WorkspaceTodosService from '@deepseek-ai/dsh-workspace-todos'
import type { SharedTodo } from '@deepseek-ai/dsh-workspace-todos/types'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as TodosAgent from '../src/index.ts'

/** One mounted plugin harness over an in-memory medium and one workspace. */
export interface TodosAgentHarness {
  readonly ctx: Context
  readonly workspaceId: WorkspaceId
  /** Dispose the whole context and remove the temp directory. */
  dispose: () => Promise<void>
}

/**
 * Boot the real storage/domain/registry/todos/tools/agents composition with
 * the todos agent integration mounted under the given approval policy.
 * @param config - deployment approval policy for the integration.
 * @returns the mounted harness.
 */
export async function harness(
  config: TodosAgent.Config = { statusUpdateApproval: 'ask' },
): Promise<TodosAgentHarness> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  // Header-only persistence peer: sessions created in tests are never reloaded.
  ctx.provide('sessionPersistence', {
    list: async () => [],
    load: () => { throw new Error('event bodies must not be loaded') },
    inspect: () => { throw new Error('event bodies must not be inspected') },
  } as never)
  await ctx.plugin(SessionStore)
  await ctx.plugin(WorkspaceRegistry)
  await ctx.plugin(WorkspaceTodosService, { maxContentBytes: 2048 })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(TodosAgent, config)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-todos-agent-'))
  const workspace = await ctx.workspaceRegistry.create(dir, 'harness')
  return {
    ctx,
    workspaceId: workspace.id,
    dispose: async () => {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

const signal = new AbortController().signal
let agentCounter = 0

/**
 * Build and announce one stub agent carrying a real store session and a real
 * scoped `agent.ctx` minted through `createScope`, exactly like the loop does.
 */
export async function agentFor(bench: TodosAgentHarness, cwd: string): Promise<Agent & { session: Session }> {
  const ctx = bench.ctx
  agentCounter += 1
  const session = ctx.sessions.create(SessionId(`todos-agent-${agentCounter}`), { meta: { cwd } })
  const agent = {
    id: session.id,
    session,
    options: {},
    inject: () => {},
  } as unknown as Agent & { session: Session }
  let scoped!: Context
  await ctx.plugin(Object.assign((inner: Context) => { scoped = createScope(inner, agent).ctx }, {
    inject: ['tools'],
  }))
  ;(agent as { ctx: Context }).ctx = scoped
  ctx.agents.enter(agent, undefined)
  ctx.agents.announce(agent)
  return agent
}

/** Dispatch the real pre-step waterfall, the plugin's attachment boundary. */
export async function boundary(ctx: Context, agent: Agent): Promise<void> {
  const message = createUserMessage({
    content: [{ type: 'text', text: 'boundary probe' }],
    source: { kind: 'user' },
  })
  await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [message], turn: 1, step: 1, signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
  )
}

/** Execute one tool exactly as the loop would, inside the agent's initiator. */
export function execute(
  bench: TodosAgentHarness,
  agent: Agent,
  name: string,
  args: unknown,
): Promise<ToolExecutionResult> {
  return bench.ctx.agents.withInitiator(agent, () => bench.ctx.tools.execute({
    signal,
    callId: CallId(`call-${Math.random()}`),
    name,
    arguments: args,
    agent,
  }))
}

/** Compose every test agent into the harness workspace before announcing it. */
export async function attachedAgent(bench: TodosAgentHarness): Promise<Agent & { session: Session }> {
  const workspace = bench.ctx.workspaceRegistry.get(bench.workspaceId)
  if (workspace === undefined) throw new Error('harness workspace disappeared')
  const agent = await agentFor(bench, workspace.path)
  await workspace.attachSession(agent.id)
  return agent
}

/** Create one user-provenance todo and return the committed record. */
export async function createUserTodo(bench: TodosAgentHarness, content: string): Promise<SharedTodo> {
  const created = await bench.ctx.workspaceTodos.create({
    workspaceId: bench.workspaceId,
    content,
    createdBy: { kind: 'user' },
  })
  if (!created.ok) throw new Error(`expected create success, got ${created.error.code}`)
  return created.value
}

/** Move one todo through one allowed transition via the domain service. */
export async function moveUserTodo(
  bench: TodosAgentHarness,
  todo: SharedTodo,
  status: SharedTodo['status'],
): Promise<SharedTodo> {
  const moved = await bench.ctx.workspaceTodos.setStatus({
    todoId: todo.todoId,
    expectedRevision: todo.revision,
    status,
  })
  if (!moved.ok) throw new Error(`expected setStatus success, got ${moved.error.code}`)
  return moved.value
}
