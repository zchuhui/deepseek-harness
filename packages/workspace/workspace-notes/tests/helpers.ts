/** Shared harness: storage + domain form + workspace registry + notes service. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SessionHeader } from '@deepseek-ai/dsh-session/types'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import WorkspaceNotesService from '../src/index.ts'
import type { WorkspaceNotesChanged } from '../src/types.ts'

/** One harness boot over a (possibly shared) media pool. */
export interface NotesHarness {
  readonly ctx: Context
  readonly pool: MemoryMediaPool
  readonly registry: WorkspaceRegistry
  readonly service: WorkspaceNotesService
  /** Every `workspace-notes/changed` emission after boot, in order. */
  readonly changes: WorkspaceNotesChanged[]
  /** Registered workspace directory (realpathed). */
  readonly dir: string
  readonly workspaceId: WorkspaceId
  /** Dispose the whole context and remove the temp directory. */
  dispose: () => Promise<void>
}

const header = (id: string): SessionHeader => ({ version: 0, id: SessionId(id), createdAt: 0 })

/**
 * Boot the real storage/domain/registry/notes composition over an in-memory
 * medium and one registered workspace.
 * @param options - shared pool (restart simulation) and content-size policy.
 * @returns the mounted harness.
 */
export async function harness(options: {
  readonly pool?: MemoryMediaPool
  readonly maxContentBytes?: number
} = {}): Promise<NotesHarness> {
  const pool = options.pool ?? new MemoryMediaPool()
  const dir = await mkdtemp(join(tmpdir(), 'dsh-workspace-notes-'))
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  // Header-only persistence peer: the registry bootstraps from `list` and the
  // notes service never reads event bodies.
  const listed: SessionHeader[] = [header('seed-session')]
  ctx.provide('sessionPersistence', {
    list: async () => listed,
    load: () => { throw new Error('event bodies must not be loaded') },
    inspect: () => { throw new Error('event bodies must not be inspected') },
  } as never)
  await ctx.plugin(WorkspaceRegistry)
  // Attached before the notes service mounts so init-time recovery emissions
  // land in `changes` too.
  const changes: WorkspaceNotesChanged[] = []
  ctx.on('workspace-notes/changed', (change) => { changes.push(change) })
  await ctx.plugin(WorkspaceNotesService, { maxContentBytes: options.maxContentBytes ?? 4096 })
  const workspace = await ctx.workspaceRegistry.create(dir, 'harness')
  return {
    ctx,
    pool,
    registry: ctx.workspaceRegistry,
    service: ctx.workspaceNotes,
    changes,
    dir,
    workspaceId: workspace.id,
    dispose: async () => {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
