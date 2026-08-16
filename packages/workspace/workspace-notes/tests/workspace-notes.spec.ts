import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry, { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { harness } from './helpers.ts'
import type { NotesHarness } from './helpers.ts'
import type { WorkspaceNote } from '../src/types.ts'

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u

const active: NotesHarness[] = []
afterEach(async () => {
  await Promise.all(active.splice(0).map(bench => bench.dispose()))
})

/** Mount a harness and keep it for teardown. */
async function boot(options: Parameters<typeof harness>[0] = {}): Promise<NotesHarness> {
  const bench = await harness(options)
  active.push(bench)
  return bench
}

/** Create one manual note and return the committed record. */
async function createNote(
  bench: NotesHarness,
  content: string,
  agentVisible = false,
): Promise<WorkspaceNote> {
  const created = await bench.service.create({
    workspaceId: bench.workspaceId,
    content,
    agentVisible,
    source: { kind: 'manual' },
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

describe('workspace notes service', () => {
  it('creates a revision-1 note and lists it in the committed view', async () => {
    const bench = await boot()
    const note = await createNote(bench, '# Title\nbody')
    expect(note.revision).toBe(1)
    expect(note.agentVisible).toBe(false)
    expect(note.source).toEqual({ kind: 'manual' })
    expect(ISO_LIKE.test(note.createdAt)).toBe(true)
    expect(note.updatedAt).toBe(note.createdAt)

    const listed = await bench.service.list({ workspaceId: bench.workspaceId })
    expect(listed).toEqual({ ok: true, value: { notes: [note], familyRevision: 1 } })
  })

  it('assigns strictly increasing updatedAt across same-millisecond creates', async () => {
    const bench = await boot()
    const first = await createNote(bench, 'first')
    const second = await createNote(bench, 'second')
    const third = await createNote(bench, 'third')
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt))
    expect(Date.parse(third.updatedAt)).toBeGreaterThan(Date.parse(second.updatedAt))

    const listed = await bench.service.list({ workspaceId: bench.workspaceId })
    if (!listed.ok) throw new Error(`expected list success, got ${listed.error.code}`)
    expect(listed.value.notes.map(note => note.content)).toEqual(['third', 'second', 'first'])
  })

  it('rejects blank and oversized content with stable failure codes', async () => {
    const bench = await boot({ maxContentBytes: 8 })
    const blank = await bench.service.create({
      workspaceId: bench.workspaceId,
      content: ' \n\t ',
      agentVisible: true,
      source: { kind: 'manual' },
    })
    expect(blank).toEqual({ ok: false, error: { code: 'content-blank' } })

    const large = await bench.service.create({
      workspaceId: bench.workspaceId,
      content: '0123456789',
      agentVisible: true,
      source: { kind: 'manual' },
    })
    expect(large).toEqual({ ok: false, error: { code: 'content-too-large', maxBytes: 8, actualBytes: 10 } })

    const missing = randomUUID() as WorkspaceNote['noteId']
    const update = await bench.service.update({ noteId: missing, expectedRevision: 1, content: ' ' })
    expect(update).toEqual({ ok: false, error: { code: 'content-blank' } })
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
      agentVisible: false,
      source: { kind: 'manual' },
    })).resolves.toEqual({
      ok: false,
      error: { code: 'unknown-workspace', workspaceId: missing },
    })
  })

  it('updates content against the observed revision and bumps it', async () => {
    const bench = await boot()
    const note = await createNote(bench, 'first')
    const updated = await bench.service.update({
      noteId: note.noteId,
      expectedRevision: note.revision,
      content: 'second',
      agentVisible: true,
    })
    if (!updated.ok) throw new Error(`expected update success, got ${updated.error.code}`)
    expect(updated.value.revision).toBe(2)
    expect(updated.value.content).toBe('second')
    expect(updated.value.agentVisible).toBe(true)
    expect(updated.value.source).toEqual({ kind: 'manual' })
    expect(updated.value.createdAt).toBe(note.createdAt)
  })

  it('returns the stored note without a revision bump on a matching no-op', async () => {
    const bench = await boot()
    const note = await createNote(bench, 'same')
    const noOp = await bench.service.update({
      noteId: note.noteId,
      expectedRevision: 1,
      content: 'same',
    })
    expect(noOp).toEqual({ ok: true, value: note })
    expect(bench.changes).toHaveLength(1)
  })

  it('rejects a stale update with the authoritative current note', async () => {
    const bench = await boot()
    const note = await createNote(bench, 'first')
    const committed = await bench.service.update({
      noteId: note.noteId,
      expectedRevision: 1,
      content: 'second',
    })
    if (!committed.ok) throw new Error('expected committed update')

    const stale = await bench.service.update({
      noteId: note.noteId,
      expectedRevision: 1,
      content: 'third',
    })
    expect(stale).toEqual({ ok: false, error: { code: 'revision-conflict', current: committed.value } })
  })

  it('rejects updates of an unknown note and deletes absent notes idempotently', async () => {
    const bench = await boot()
    const missing = randomUUID() as WorkspaceNote['noteId']
    await expect(bench.service.update({ noteId: missing, expectedRevision: 1, content: 'x' }))
      .resolves.toEqual({ ok: false, error: { code: 'unknown-note', noteId: missing } })
    await expect(bench.service.delete({ noteId: missing, expectedRevision: 1 }))
      .resolves.toEqual({ ok: true, value: { absent: true } })
  })

  it('deletes against the observed revision and stays idempotent', async () => {
    const bench = await boot()
    const note = await createNote(bench, 'doomed')
    const conflict = await bench.service.delete({ noteId: note.noteId, expectedRevision: 99 })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.error.code).toBe('revision-conflict')

    await expect(bench.service.delete({ noteId: note.noteId, expectedRevision: 1 }))
      .resolves.toEqual({ ok: true, value: { absent: true } })
    await expect(bench.service.delete({ noteId: note.noteId, expectedRevision: 1 }))
      .resolves.toEqual({ ok: true, value: { absent: true } })
    const listed = await bench.service.list({ workspaceId: bench.workspaceId })
    if (!listed.ok) throw new Error('expected list success')
    expect(listed.value.notes).toHaveLength(0)
  })

  it('orders the list by updatedAt descending then noteId', async () => {
    const bench = await boot()
    const first = await createNote(bench, 'first')
    // Distinct milliseconds keep the ordering assertion about updatedAt rather
    // than the same-millisecond noteId tiebreak.
    await new Promise((resolve) => { setTimeout(resolve, 2) })
    const second = await createNote(bench, 'second')
    await new Promise((resolve) => { setTimeout(resolve, 2) })
    // Updating `first` gives it the newest updatedAt, so it leads the view.
    await bench.service.update({ noteId: first.noteId, expectedRevision: 1, content: 'first!' })
    const listed = await bench.service.list({ workspaceId: bench.workspaceId })
    if (!listed.ok) throw new Error('expected list success')
    expect(listed.value.notes.map(note => note.content)).toEqual(['first!', 'second'])
    expect(listed.value.notes[0]?.noteId).toBe(first.noteId)
    expect(listed.value.notes[1]?.noteId).toBe(second.noteId)
  })

  it('emits monotone workspace-notes/changed revisions per commit', async () => {
    const bench = await boot()
    const note = await createNote(bench, 'one')
    await bench.service.update({ noteId: note.noteId, expectedRevision: 1, agentVisible: true })
    await bench.service.delete({ noteId: note.noteId, expectedRevision: 2 })
    expect(bench.changes.map(change => change.revision)).toEqual([1, 2, 3])
    expect(bench.changes.every(change => change.workspaceId === bench.workspaceId)).toBe(true)
  })

  it('reports the advancing family revision in every list', async () => {
    const bench = await boot()
    const empty = await bench.service.list({ workspaceId: bench.workspaceId })
    expect(empty.ok && empty.value.familyRevision).toBe(0)

    const note = await createNote(bench, 'one')
    const afterCreate = await bench.service.list({ workspaceId: bench.workspaceId })
    expect(afterCreate.ok && afterCreate.value.familyRevision).toBe(1)

    await bench.service.update({ noteId: note.noteId, expectedRevision: 1, content: 'two' })
    await bench.service.delete({ noteId: note.noteId, expectedRevision: 2 })
    const afterDelete = await bench.service.list({ workspaceId: bench.workspaceId })
    // The listed family revision always equals the latest changed-frame value.
    expect(afterDelete.ok && afterDelete.value.familyRevision).toBe(3)
    expect(bench.changes.at(-1)?.revision).toBe(3)
  })

  it('cleans up notes when the workspace registration is deleted', async () => {
    const bench = await boot()
    await createNote(bench, 'one')
    await createNote(bench, 'two')
    const changesBefore = bench.changes.length
    await bench.registry.delete(bench.workspaceId)
    await waitFor(() => bench.changes.length > changesBefore)
    await expect(bench.service.list({ workspaceId: bench.workspaceId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'unknown-workspace' },
    })
    const medium = bench.pool.media.get('workspace_notes')
    expect(medium?.tables.get('notes')?.size ?? 0).toBe(0)
    expect(medium?.tables.get('cleanupQueue')?.size ?? 0).toBe(0)
  })

  it('recovers an interrupted cleanup from the queue at open', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness({ pool })
    await createNote(first, 'queued for cleanup')
    const workspaceId = first.workspaceId
    const medium = pool.media.get('workspace_notes')
    await first.dispose()
    // Simulate a crash after the queue row landed but before the deletes; the
    // first boot's create already advanced that workspace's revision to 1.
    // The queue table's medium map materializes only on first write, so the
    // row is placed explicitly.
    medium?.tables.set('cleanup_queue', new Map([[String(workspaceId), { queuedAt: 1 }]]))

    const bench = await boot({ pool })
    expect(bench.changes).toEqual([{ workspaceId, revision: 2 }])
    const listed = await bench.service.list({ workspaceId })
    if (!listed.ok) throw new Error('expected list success for the still-registered workspace')
    expect(listed.value.notes).toHaveLength(0)
    expect(pool.media.get('workspace_notes')?.tables.get('cleanupQueue')?.size ?? 0).toBe(0)
  })

  it('reconciles orphaned notes whose workspace was deleted while the family was disabled', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness({ pool })
    await createNote(first, 'orphan')
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
    await createNote(first, 'survives restart')
    const listedBefore = await first.service.list({ workspaceId: first.workspaceId })
    await first.dispose()

    const bench = await boot({ pool })
    const listed = await bench.service.list({ workspaceId: first.workspaceId })
    expect(listed).toEqual(listedBefore)
  })
})
