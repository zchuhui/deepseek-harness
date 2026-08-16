import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry, { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { harness } from './helpers.ts'
import type { TodosHarness } from './helpers.ts'
import type { SharedTodo } from '../src/types.ts'

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u
const SESSION = SessionId('33333333-3333-3333-3333-333333333333')

const active: TodosHarness[] = []
afterEach(async () => {
  await Promise.all(active.splice(0).map(bench => bench.dispose()))
})

/** Mount a harness and keep it for teardown. */
async function boot(options: Parameters<typeof harness>[0] = {}): Promise<TodosHarness> {
  const bench = await harness(options)
  active.push(bench)
  return bench
}

/** Create one user todo and return the committed record. */
async function createTodo(bench: TodosHarness, content: string): Promise<SharedTodo> {
  const created = await bench.service.create({
    workspaceId: bench.workspaceId,
    content,
    createdBy: { kind: 'user' },
  })
  if (!created.ok) throw new Error(`expected create success, got ${created.error.code}`)
  return created.value
}

/** Resolve after the deferred cleanup chain settles (bounded polling). */
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !predicate(); attempt++) {
    await new Promise((resolve) => { setTimeout(resolve, 1) })
  }
  expect(predicate()).toBe(true)
}

/** Boot a registry-only context over the shared pool, for family-disabled windows. */
async function registryOnly(pool: MemoryMediaPool): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('sessionPersistence', { list: async () => [] } as never)
  await ctx.plugin(WorkspaceRegistry)
  return ctx
}

describe('workspace todos service', () => {
  it('creates a revision-1 pending todo and lists it in the committed view', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'ship the release')
    expect(todo.revision).toBe(1)
    expect(todo.status).toBe('pending')
    expect(todo.createdBy).toEqual({ kind: 'user' })
    expect(todo.assignedSessionId).toBeNull()
    expect(todo.completedAt).toBeNull()
    expect(ISO_LIKE.test(todo.createdAt)).toBe(true)
    expect(todo.updatedAt).toBe(todo.createdAt)

    const listed = await bench.service.list({ workspaceId: bench.workspaceId })
    expect(listed).toEqual({ ok: true, value: { todos: [todo] } })
  })

  it('rejects blank, multiline, and oversized content with stable failure codes', async () => {
    const bench = await boot({ maxContentBytes: 8 })
    const blank = await bench.service.create({
      workspaceId: bench.workspaceId,
      content: ' \t ',
      createdBy: { kind: 'user' },
    })
    expect(blank).toEqual({ ok: false, error: { code: 'content-blank' } })

    const multiline = await bench.service.create({
      workspaceId: bench.workspaceId,
      content: 'two\nlines',
      createdBy: { kind: 'user' },
    })
    expect(multiline).toEqual({ ok: false, error: { code: 'content-not-single-line' } })

    const large = await bench.service.create({
      workspaceId: bench.workspaceId,
      content: '0123456789',
      createdBy: { kind: 'user' },
    })
    expect(large).toEqual({ ok: false, error: { code: 'content-too-large', maxBytes: 8, actualBytes: 10 } })

    const missing = randomUUID() as SharedTodo['todoId']
    const update = await bench.service.updateContent({ todoId: missing, expectedRevision: 1, content: 'two\nlines' })
    expect(update).toEqual({ ok: false, error: { code: 'content-not-single-line' } })
  })

  it('rejects create and list for an unregistered workspace', async () => {
    const bench = await boot()
    const missing = WorkspaceId('00000000-0000-0000-0000-000000000000')
    await expect(bench.service.list({ workspaceId: missing })).resolves.toEqual({
      ok: false,
      error: { code: 'unknown-workspace', workspaceId: missing },
    })
    await expect(bench.service.create({
      workspaceId: missing,
      content: 'x',
      createdBy: { kind: 'user' },
    })).resolves.toEqual({
      ok: false,
      error: { code: 'unknown-workspace', workspaceId: missing },
    })
  })

  it('edits content against the observed revision and returns a no-op unchanged', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'first')
    const updated = await bench.service.updateContent({
      todoId: todo.todoId,
      expectedRevision: todo.revision,
      content: 'second',
    })
    if (!updated.ok) throw new Error(`expected update success, got ${updated.error.code}`)
    expect(updated.value.revision).toBe(2)
    expect(updated.value.content).toBe('second')
    expect(updated.value.createdAt).toBe(todo.createdAt)

    const noOp = await bench.service.updateContent({
      todoId: todo.todoId,
      expectedRevision: 2,
      content: 'second',
    })
    expect(noOp).toEqual({ ok: true, value: updated.value })
    expect(bench.changes).toHaveLength(2)
  })

  it('rejects a stale edit with the authoritative current todo', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'first')
    const committed = await bench.service.updateContent({
      todoId: todo.todoId,
      expectedRevision: 1,
      content: 'second',
    })
    if (!committed.ok) throw new Error('expected committed update')

    const stale = await bench.service.updateContent({
      todoId: todo.todoId,
      expectedRevision: 1,
      content: 'third',
    })
    expect(stale).toEqual({ ok: false, error: { code: 'revision-conflict', current: committed.value } })
  })

  it('walks the documented transitions and maintains completedAt', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'lifecycle')

    const started = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 1, status: 'in_progress' })
    if (!started.ok) throw new Error(`expected start success, got ${started.error.code}`)
    expect(started.value.revision).toBe(2)
    expect(started.value.status).toBe('in_progress')
    expect(started.value.completedAt).toBeNull()

    const done = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 2, status: 'completed' })
    if (!done.ok) throw new Error(`expected complete success, got ${done.error.code}`)
    expect(done.value.status).toBe('completed')
    expect(done.value.completedAt).not.toBeNull()

    const reopened = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 3, status: 'pending' })
    if (!reopened.ok) throw new Error(`expected reopen success, got ${reopened.error.code}`)
    expect(reopened.value.status).toBe('pending')
    expect(reopened.value.completedAt).toBeNull()
    expect(reopened.value.revision).toBe(4)

    const cancelled = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 4, status: 'cancelled' })
    if (!cancelled.ok) throw new Error(`expected cancel success, got ${cancelled.error.code}`)
    const revived = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 5, status: 'pending' })
    if (!revived.ok) throw new Error(`expected revive success, got ${revived.error.code}`)

    const sameStatus = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 6, status: 'pending' })
    expect(sameStatus).toEqual({ ok: true, value: revived.value })
  })

  it('rejects undocumented transitions with current and requested statuses', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'guarded')
    const done = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 1, status: 'in_progress' })
    if (!done.ok) throw new Error('expected start success')
    await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 2, status: 'completed' })

    const illegal = await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 3, status: 'cancelled' })
    expect(illegal).toEqual({
      ok: false,
      error: { code: 'invalid-transition', current: 'completed', requested: 'cancelled' },
    })
  })

  it('commits assignment as pending → in_progress plus assignedSessionId', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'hand it over')
    const assigned = await bench.service.assign({
      todoId: todo.todoId,
      expectedRevision: 1,
      sessionId: SESSION,
    })
    if (!assigned.ok) throw new Error(`expected assign success, got ${assigned.error.code}`)
    expect(assigned.value.revision).toBe(2)
    expect(assigned.value.status).toBe('in_progress')
    expect(assigned.value.assignedSessionId).toBe(SESSION)

    const repeat = await bench.service.assign({
      todoId: todo.todoId,
      expectedRevision: 2,
      sessionId: SESSION,
    })
    expect(repeat).toEqual({
      ok: false,
      error: { code: 'invalid-transition', current: 'in_progress', requested: 'in_progress' },
    })

    // A todo that cycled back to pending can be reassigned to another session.
    await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 2, status: 'pending' })
    const other = SessionId('44444444-4444-4444-4444-444444444444')
    const reassigned = await bench.service.assign({ todoId: todo.todoId, expectedRevision: 3, sessionId: other })
    if (!reassigned.ok) throw new Error(`expected reassign success, got ${reassigned.error.code}`)
    expect(reassigned.value.assignedSessionId).toBe(other)
  })

  it('rejects operations on an unknown todo and deletes absent todos idempotently', async () => {
    const bench = await boot()
    const missing = randomUUID() as SharedTodo['todoId']
    await expect(bench.service.updateContent({ todoId: missing, expectedRevision: 1, content: 'x' }))
      .resolves.toEqual({ ok: false, error: { code: 'unknown-todo', todoId: missing } })
    await expect(bench.service.setStatus({ todoId: missing, expectedRevision: 1, status: 'completed' }))
      .resolves.toEqual({ ok: false, error: { code: 'unknown-todo', todoId: missing } })
    await expect(bench.service.assign({ todoId: missing, expectedRevision: 1, sessionId: SESSION }))
      .resolves.toEqual({ ok: false, error: { code: 'unknown-todo', todoId: missing } })
    await expect(bench.service.delete({ todoId: missing, expectedRevision: 1 }))
      .resolves.toEqual({ ok: true, value: { absent: true } })
  })

  it('deletes against the observed revision and stays idempotent', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'doomed')
    const conflict = await bench.service.delete({ todoId: todo.todoId, expectedRevision: 99 })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.error.code).toBe('revision-conflict')

    await expect(bench.service.delete({ todoId: todo.todoId, expectedRevision: 1 }))
      .resolves.toEqual({ ok: true, value: { absent: true } })
    await expect(bench.service.delete({ todoId: todo.todoId, expectedRevision: 1 }))
      .resolves.toEqual({ ok: true, value: { absent: true } })
    const listed = await bench.service.list({ workspaceId: bench.workspaceId })
    if (!listed.ok) throw new Error('expected list success')
    expect(listed.value.todos).toHaveLength(0)
  })

  it('orders the list by status rank then createdAt then todoId', async () => {
    const bench = await boot()
    await createTodo(bench, 'first')
    const second = await createTodo(bench, 'second')
    const third = await createTodo(bench, 'third')
    await new Promise((resolve) => { setTimeout(resolve, 2) })
    // second goes in_progress, third completes; first stays pending and leads.
    await bench.service.setStatus({ todoId: second.todoId, expectedRevision: 1, status: 'in_progress' })
    await bench.service.setStatus({ todoId: third.todoId, expectedRevision: 1, status: 'in_progress' })
    await bench.service.setStatus({ todoId: third.todoId, expectedRevision: 2, status: 'completed' })

    const listed = await bench.service.list({ workspaceId: bench.workspaceId })
    if (!listed.ok) throw new Error('expected list success')
    expect(listed.value.todos.map(todo => todo.content)).toEqual(['first', 'second', 'third'])
  })

  it('emits monotone workspace-todos/changed revisions per commit', async () => {
    const bench = await boot()
    const todo = await createTodo(bench, 'one')
    await bench.service.setStatus({ todoId: todo.todoId, expectedRevision: 1, status: 'in_progress' })
    await bench.service.delete({ todoId: todo.todoId, expectedRevision: 2 })
    expect(bench.changes.map(change => change.revision)).toEqual([1, 2, 3])
    expect(bench.changes.every(change => change.workspaceId === bench.workspaceId)).toBe(true)
  })

  it('cleans up todos when the workspace registration is deleted', async () => {
    const bench = await boot()
    await createTodo(bench, 'one')
    await createTodo(bench, 'two')
    const changesBefore = bench.changes.length
    await bench.registry.delete(bench.workspaceId)
    await waitFor(() => bench.changes.length > changesBefore)
    await expect(bench.service.list({ workspaceId: bench.workspaceId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'unknown-workspace' },
    })
    const medium = bench.pool.media.get('workspace_todos')
    expect(medium?.tables.get('todos')?.size ?? 0).toBe(0)
    expect(medium?.tables.get('cleanupQueue')?.size ?? 0).toBe(0)
  })

  it('recovers an interrupted cleanup from the queue at open', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness({ pool })
    await createTodo(first, 'queued for cleanup')
    const workspaceId = first.workspaceId
    const medium = pool.media.get('workspace_todos')
    await first.dispose()
    // Simulate a crash after the queue row landed but before the deletes; the
    // first boot's create already advanced that workspace's revision to 1.
    medium?.tables.set('cleanup_queue', new Map([[String(workspaceId), { queuedAt: 1 }]]))

    const bench = await boot({ pool })
    expect(bench.changes).toEqual([{ workspaceId, revision: 2 }])
    const listed = await bench.service.list({ workspaceId })
    if (!listed.ok) throw new Error('expected list success for the still-registered workspace')
    expect(listed.value.todos).toHaveLength(0)
    expect(pool.media.get('workspace_todos')?.tables.get('cleanupQueue')?.size ?? 0).toBe(0)
  })

  it('reconciles orphaned todos whose workspace was deleted while the family was disabled', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness({ pool })
    await createTodo(first, 'orphan')
    const workspaceId = first.workspaceId
    await first.dispose()

    // The registration is deleted while the family is disabled, so no queue
    // row can land for it.
    const ctx = await registryOnly(pool)
    await ctx.workspaceRegistry.delete(workspaceId)
    await ctx.fiber.dispose()

    const bench = await boot({ pool })
    expect(bench.changes).toEqual([{ workspaceId, revision: 2 }])
    await expect(bench.service.list({ workspaceId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'unknown-workspace' },
    })
  })

  it('preserves records of registered workspaces across disable and re-enable', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness({ pool })
    await createTodo(first, 'survives restart')
    const listedBefore = await first.service.list({ workspaceId: first.workspaceId })
    await first.dispose()

    const bench = await boot({ pool })
    const listed = await bench.service.list({ workspaceId: first.workspaceId })
    expect(listed).toEqual(listedBefore)
  })
})
