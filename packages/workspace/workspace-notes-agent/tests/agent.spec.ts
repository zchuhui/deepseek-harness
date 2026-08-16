/**
 * Plugin-level integration: deduplicated snapshot appends ahead of each step,
 * the project-memory assembly segment, and the two agent-scoped tools with
 * the `notes_write` approval gate, over the real storage/domain/registry/
 * notes composition.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import WorkspaceNotesService from '@deepseek-ai/dsh-workspace-notes'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as NotesAgent from '../src/index.ts'

const signal = new AbortController().signal
let agentCounter = 0

/** One mounted plugin harness over an in-memory medium and one workspace. */
interface Harness {
  readonly ctx: Context
  readonly workspaceId: WorkspaceId
  readonly dispose: () => Promise<void>
}

async function harness(config: NotesAgent.Config = { maxRenderBytes: 8192, maxNotes: 10 }): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('sessionPersistence', {
    list: async () => [],
    load: () => { throw new Error('event bodies must not be loaded') },
    inspect: () => { throw new Error('event bodies must not be inspected') },
  } as never)
  await ctx.plugin(SessionStore)
  await ctx.plugin(WorkspaceRegistry)
  await ctx.plugin(WorkspaceNotesService, { maxContentBytes: 4096 })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(NotesAgent, config)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-notes-agent-'))
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

/**
 * Build and announce one stub agent carrying a real store session and a real
 * scoped `agent.ctx` minted through `createScope`, exactly like the loop does.
 */
async function agentFor(bench: Harness, cwd: string): Promise<Agent & { session: Session }> {
  const ctx = bench.ctx
  agentCounter += 1
  const session = ctx.sessions.create(SessionId(`notes-agent-${agentCounter}`), { meta: { cwd } })
  const agent = {
    id: session.id,
    session,
    options: {},
    inject: () => {},
  } as unknown as Agent & { session: Session }
  let scoped!: Context
  await ctx.plugin(Object.assign((inner: Context) => { scoped = createScope(inner, agent).ctx }, {
    inject: ['tools', 'systemPrompt'],
  }))
  ;(agent as { ctx: Context }).ctx = scoped
  ctx.agents.enter(agent, undefined)
  ctx.agents.announce(agent)
  return agent
}

/** Dispatch the real pre-step waterfall, the plugin's snapshot boundary. */
async function boundary(ctx: Context, agent: Agent): Promise<void> {
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
function execute(bench: Harness, agent: Agent, name: string, args: unknown): Promise<ToolExecutionResult> {
  return bench.ctx.agents.withInitiator(agent, () => bench.ctx.tools.execute({
    signal,
    callId: CallId(`call-${Math.random()}`),
    name,
    arguments: args,
    agent,
  }))
}

/** The session's snapshot events in log order. */
function snapshots(agent: Agent & { session: Session }): SessionEvent<'workspace-notes/snapshot'>[] {
  return agent.session.events.filter(
    event => event.type === 'workspace-notes/snapshot',
  )
}

/** Compose every test agent into the harness workspace before announcing it. */
async function attachedAgent(bench: Harness): Promise<Agent & { session: Session }> {
  const workspace = bench.ctx.workspaceRegistry.get(bench.workspaceId)
  if (workspace === undefined) throw new Error('harness workspace disappeared')
  const agent = await agentFor(bench, workspace.path)
  await workspace.attachSession(agent.id)
  return agent
}

describe('the workspace-notes agent integration', () => {
  it('appends one ignorable snapshot before the first step and dedups an unchanged second step', async () => {
    const bench = await harness()
    try {
      const agent = await attachedAgent(bench)
      const created = await bench.ctx.workspaceNotes.create({
        workspaceId: bench.workspaceId,
        content: 'first durable fact',
        agentVisible: true,
        source: { kind: 'manual' },
      })
      if (!created.ok) throw new Error(`expected create success, got ${created.error.code}`)

      await boundary(bench.ctx, agent)
      await boundary(bench.ctx, agent)

      const logged = snapshots(agent)
      expect(logged).toHaveLength(1)
      const event = logged[0] as SessionEvent<'workspace-notes/snapshot'>
      expect(event.ignorable).toBe(true)
      expect(event.data.workspaceId).toBe(bench.workspaceId)
      expect(event.data.familyRevision).toBe(1)
      expect(event.data.configFingerprint).toBe('v1:8192:10')
      expect(event.data.notes).toEqual([{ noteId: created.value.noteId, revision: 1 }])
      expect(event.data.text).toContain('first durable fact')
      expect(event.data.omitted).toBe(0)
    } finally {
      await bench.dispose()
    }
  })

  it('keeps the project-memory segment absent until a snapshot exists, then renders its latest view', async () => {
    const bench = await harness()
    try {
      const agent = await attachedAgent(bench)
      const before = await bench.ctx.systemPrompt.assemble({ agent, scope: agent })
      expect(before.contexts.find(context => context.name === 'workspace-notes:project-memory')).toBeUndefined()

      await boundary(bench.ctx, agent)
      const created = await bench.ctx.workspaceNotes.create({
        workspaceId: bench.workspaceId,
        content: 'convention: pnpm only',
        agentVisible: true,
        source: { kind: 'manual' },
      })
      if (!created.ok) throw new Error(`expected create success, got ${created.error.code}`)
      await boundary(bench.ctx, agent)

      expect(snapshots(agent)).toHaveLength(2)
      const assembly = await bench.ctx.systemPrompt.assemble({ agent, scope: agent })
      const segment = assembly.contexts.find(context => context.name === 'workspace-notes:project-memory')?.text
      expect(segment).toContain('untrusted')
      expect(segment).toContain(`id="${String(created.value.noteId)}" revision="1"`)
      expect(segment).toContain('convention: pnpm only')
    } finally {
      await bench.dispose()
    }
  })

  it('commits approved notes_write calls and advances the snapshot to the new revision', async () => {
    const bench = await harness()
    try {
      bench.ctx.provide('approval', { request: async () => 'allowed-once' } as never)
      const agent = await attachedAgent(bench)
      // A real model call always follows a pre-step; the lazily resolved
      // workspace attaches there, before any tool of this integration runs.
      await boundary(bench.ctx, agent)

      const created = await execute(bench, agent, 'notes_write', { content: 'shared gotcha' })
      expect(created.isError).toBe(false)
      expect(created.value).toMatchObject({ ok: true, created: true, note: { revision: 1, agentVisible: true } })

      const noteId = (created.value as { note: { noteId: string } }).note.noteId
      const updated = await execute(bench, agent, 'notes_write', {
        noteId, expectedRevision: 1, content: 'shared gotcha, refined',
      })
      expect(updated.value).toMatchObject({ ok: true, created: false, note: { revision: 2 } })

      await boundary(bench.ctx, agent)
      const latest = snapshots(agent).at(-1)
      expect(latest?.data.notes).toEqual([{ noteId: noteId as never, revision: 2 }])
      const segment = (await bench.ctx.systemPrompt.assemble({ agent, scope: agent }))
        .contexts.find(context => context.name === 'workspace-notes:project-memory')?.text
      expect(segment).toContain('revision="2"')
      expect(segment).toContain('shared gotcha, refined')
    } finally {
      await bench.dispose()
    }
  })

  it('denies every notes_write without an approval channel, surfacing the gate reason', async () => {
    const bench = await harness()
    try {
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)

      const denied = await execute(bench, agent, 'notes_write', { content: 'unapproved' })
      expect(denied.isError).toBe(true)
      const block = denied.content[0]
      expect(block?.type).toBe('text')
      if (block?.type === 'text') expect(block.text).toContain('notes_write commits a shared workspace note')

      const listed = await bench.ctx.workspaceNotes.list({ workspaceId: bench.workspaceId })
      expect(listed).toMatchObject({ ok: true, value: { notes: [] } })
    } finally {
      await bench.dispose()
    }
  })

  it('surfaces the domain failure branches as canonical tool values', async () => {
    const bench = await harness()
    try {
      bench.ctx.provide('approval', { request: async () => 'allowed-once' } as never)
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)

      const hidden = await bench.ctx.workspaceNotes.create({
        workspaceId: bench.workspaceId,
        content: 'user-private note',
        agentVisible: false,
        source: { kind: 'manual' },
      })
      if (!hidden.ok) throw new Error(`expected create success, got ${hidden.error.code}`)
      const visible = await bench.ctx.workspaceNotes.create({
        workspaceId: bench.workspaceId,
        content: 'shared note',
        agentVisible: true,
        source: { kind: 'manual' },
      })
      if (!visible.ok) throw new Error(`expected create success, got ${visible.error.code}`)

      const unknown = await execute(bench, agent, 'notes_write', {
        noteId: 'missing-note', expectedRevision: 1, content: 'nope',
      })
      expect(unknown.value).toEqual({ ok: false, error: { code: 'unknown-note' } })

      const stale = await execute(bench, agent, 'notes_write', {
        noteId: String(visible.value.noteId), expectedRevision: 99, content: 'nope',
      })
      expect(stale.value).toEqual({ ok: false, error: { code: 'revision-conflict', currentRevision: 1 } })

      const private_ = await execute(bench, agent, 'notes_write', {
        noteId: String(hidden.value.noteId), expectedRevision: 1, content: 'nope',
      })
      expect(private_.value).toEqual({ ok: false, error: { code: 'not-agent-visible' } })

      const blank = await execute(bench, agent, 'notes_write', { content: '   ' })
      expect(blank.value).toEqual({ ok: false, error: { code: 'content-blank' } })
    } finally {
      await bench.dispose()
    }
  })

  it('reads only agent-visible notes and reports the render-limit omission', async () => {
    const bench = await harness({ maxRenderBytes: 8192, maxNotes: 2 })
    try {
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)
      for (const content of ['oldest', 'middle', 'newest']) {
        const created = await bench.ctx.workspaceNotes.create({
          workspaceId: bench.workspaceId,
          content,
          agentVisible: true,
          source: { kind: 'manual' },
        })
        if (!created.ok) throw new Error(`expected create success, got ${created.error.code}`)
      }
      const hidden = await bench.ctx.workspaceNotes.create({
        workspaceId: bench.workspaceId,
        content: 'never visible',
        agentVisible: false,
        source: { kind: 'manual' },
      })
      if (!hidden.ok) throw new Error(`expected create success, got ${hidden.error.code}`)

      const read = await execute(bench, agent, 'notes_read', {})
      expect(read.isError).toBe(false)
      const value = read.value as { ok: true; notes: { content: string }[]; omitted: number }
      expect(value.ok).toBe(true)
      expect(value.notes.map(note => note.content).sort()).toEqual(['middle', 'newest'])
      expect(value.omitted).toBe(1)
    } finally {
      await bench.dispose()
    }
  })

  it('attaches nothing to an agent whose session has no workspace', async () => {
    const bench = await harness()
    try {
      const strayDir = await mkdtemp(join(tmpdir(), 'dsh-notes-agent-stray-'))
      try {
        const agent = await agentFor(bench, strayDir)
        await boundary(bench.ctx, agent)
        expect(snapshots(agent)).toHaveLength(0)

        const read = await execute(bench, agent, 'notes_read', {})
        expect(read.isError).toBe(true)
      } finally {
        await rm(strayDir, { recursive: true, force: true })
      }
    } finally {
      await bench.dispose()
    }
  })

  it('skips the snapshot out-of-band when one note can never fit the render budget', async () => {
    const bench = await harness({ maxRenderBytes: 64, maxNotes: 10 })
    try {
      const agent = await attachedAgent(bench)
      const created = await bench.ctx.workspaceNotes.create({
        workspaceId: bench.workspaceId,
        content: 'x'.repeat(200),
        agentVisible: true,
        source: { kind: 'manual' },
      })
      if (!created.ok) throw new Error(`expected create success, got ${created.error.code}`)

      await boundary(bench.ctx, agent)
      expect(snapshots(agent)).toHaveLength(0)
    } finally {
      await bench.dispose()
    }
  })
})
