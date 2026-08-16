/**
 * Durable, workspace-scoped notes with revision compare-and-set, queued
 * workspace-removal cleanup, and a Typert remote namespace.
 * @module @deepseek-ai/dsh-workspace-notes
 */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { DomainChanged, KvTable, DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { workspaceNotesDomainSpec } from './spec.ts'
import type { WorkspaceNotesCleanupRow, WorkspaceNotesRevisions } from './spec.ts'
import type {
  WorkspaceNote,
  WorkspaceNotesCreateRequest,
  WorkspaceNotesCreateResult,
  WorkspaceNotesDeleteRequest,
  WorkspaceNotesDeleteResult,
  WorkspaceNotesDeleteValue,
  WorkspaceNotesFailure,
  WorkspaceNotesListRequest,
  WorkspaceNotesListResult,
  WorkspaceNotesListValue,
  WorkspaceNotesRejected,
  WorkspaceNotesSuccess,
  WorkspaceNotesUpdateRequest,
  WorkspaceNotesUpdateResult,
} from './types.ts'

export type * from './types.ts'
export {
  workspaceNotesDomainSpec,
  workspaceNoteSchema,
  workspaceNoteSourceSchema,
  workspaceNotesCleanupRowSchema,
  workspaceNotesRevisionsSchema,
} from './spec.ts'
export type {
  WorkspaceNotesCleanupRow,
  WorkspaceNotesRevisions,
} from './spec.ts'

/** Required deployment policy for workspace notes. */
export interface Config {
  /** Maximum UTF-8 byte length accepted for one note's content. */
  readonly maxContentBytes: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workspaceNotes: WorkspaceNotesService
  }
}

/** Validate the one deployment-varying limit at the configuration boundary. */
function resolveMaxContentBytes(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `workspace-notes: maxContentBytes must be a positive safe integer, got ${String(value)}`,
    )
  }
  return value
}

/** Copy and freeze one note before it crosses the service boundary. */
function snapshotNote(note: WorkspaceNote): WorkspaceNote {
  return Object.freeze({
    noteId: note.noteId,
    workspaceId: note.workspaceId,
    revision: note.revision,
    content: note.content,
    agentVisible: note.agentVisible,
    source: Object.freeze({ ...note.source }),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  })
}

/** Build a frozen success branch. */
function success<T>(value: T): WorkspaceNotesSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected<E extends WorkspaceNotesFailure>(error: E): WorkspaceNotesRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Ordered view: `updatedAt` descending, then `noteId` ascending. */
function compareNotes(left: WorkspaceNote, right: WorkspaceNote): number {
  return right.updatedAt.localeCompare(left.updatedAt)
    || (left.noteId < right.noteId ? -1 : left.noteId > right.noteId ? 1 : 0)
}

/** Validated content or one explicit request failure. */
type ResolvedContent =
  | WorkspaceNotesSuccess<string>
  | WorkspaceNotesRejected<Extract<WorkspaceNotesFailure, { code: 'content-blank' | 'content-too-large' }>>

/**
 * Workspace-scoped notes service. It owns the `workspace-notes` storage
 * domain, serializes each workspace's mutations, queues record cleanup when a
 * workspace registration is deleted, and recovers interrupted cleanups on
 * open. Disabling the plugin closes the domain without deleting it; reopening
 * restores every still-registered workspace's notes.
 */
export class WorkspaceNotesService extends TypertRemoteService {
  static inject = ['storageDomain', 'workspaceRegistry']

  /** Loader validation for the required content-size policy. */
  static Config: s<Config> = s.object({
    maxContentBytes: s.number().step(1).min(1).required(),
  })

  private readonly maxContentBytes: number
  private notes?: KvTable<WorkspaceNote['noteId'], WorkspaceNote>
  private cleanupQueue?: KvTable<WorkspaceId, WorkspaceNotesCleanupRow>
  private revisions?: DomainGlobal<WorkspaceNotesRevisions>
  private readonly operationTails = new Map<WorkspaceId, Promise<void>>()
  private mutationAdmissionOpen = true

  /**
   * @param ctx - Host context carrying the storage-domain form and the
   * workspace registry.
   * @param config - Required content-size policy.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'workspaceNotes')
    this.maxContentBytes = resolveMaxContentBytes(config.maxContentBytes)
  }

  /** Open the domain, recover interrupted cleanups, and watch workspace removals. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(workspaceNotesDomainSpec)
    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await Promise.all(this.operationTails.values())
      await domain.close()
    }, 'workspace-notes.domainClose')
    this.notes = domain.table('notes')
    this.cleanupQueue = domain.table('cleanup_queue')
    this.revisions = domain.global

    // Recovery reruns every queued entry; record deletion is idempotent, so a
    // crash between steps is safe to replay.
    for (const key of [...this.requireCleanupQueue().keys()]) {
      await this.runCleanup(key as WorkspaceId)
    }
    // Notes whose workspace was deleted while this family was disabled never
    // entered the queue; reconcile them the same way at open.
    const orphans = new Set<WorkspaceId>()
    for (const [, note] of this.requireNotes().entries()) {
      if (this.ctx.workspaceRegistry.get(note.workspaceId) === undefined) orphans.add(note.workspaceId)
    }
    for (const workspaceId of orphans) await this.enqueueCleanup(workspaceId)

    this.ctx.on('domain/changed', (change: DomainChanged) => {
      if (change.domain !== 'workspace' || change.table !== 'workspaces' || change.operation !== 'deleted') return
      // A rejection here means the service is disposing; the queue row then
      // never landed, and the next open's orphan reconciliation owns the
      // cleanup instead.
      this.enqueueCleanup(change.key as WorkspaceId).catch((error: unknown) => {
        this.ctx.logger.warn(`workspace-notes: deferred cleanup of '${change.key}' failed: ${String(error)}`)
      })
    })
  }

  /**
   * Read the ordered note view of one registered workspace.
   * @param request - Workspace whose notes should be read.
   * @returns the ordered immutable view or `unknown-workspace`.
   */
  @Remote('list')
  list(request: WorkspaceNotesListRequest): Promise<WorkspaceNotesListResult> {
    if (this.ctx.workspaceRegistry.get(request.workspaceId) === undefined) {
      return Promise.resolve(rejected({ code: 'unknown-workspace', workspaceId: request.workspaceId }))
    }
    const notes = [...this.requireNotes().entries()]
      .map(([, note]) => note)
      .filter(note => note.workspaceId === request.workspaceId)
      .sort(compareNotes)
    const copied = Object.freeze(notes.map(snapshotNote))
    const familyRevision = this.requireRevisions().get().revisions[request.workspaceId] ?? 0
    return Promise.resolve(success(
      Object.freeze({ notes: copied, familyRevision }) as WorkspaceNotesListValue,
    ))
  }

  /**
   * Create one note in a registered workspace at revision 1.
   * @param request - owning workspace, validated content, visibility, and
   * immutable provenance.
   * @returns the committed note or an explicit business failure.
   */
  @Remote('create')
  create(request: WorkspaceNotesCreateRequest): Promise<WorkspaceNotesCreateResult> {
    const content = this.resolveContent(request.content)
    if (!content.ok) return Promise.resolve(content)
    return this.enqueue(request.workspaceId, async () => {
      if (this.ctx.workspaceRegistry.get(request.workspaceId) === undefined) {
        return rejected({ code: 'unknown-workspace', workspaceId: request.workspaceId })
      }
      // A fresh note must outrank every note already in the workspace: the
      // ordered view (`updatedAt` desc) is the deterministic truncation input,
      // so a same-millisecond tie would make the newest note's rank depend on
      // its random id. Advance past the newest existing stamp instead.
      let stamp = Date.now()
      for (const [, note] of this.requireNotes().entries()) {
        if (note.workspaceId === request.workspaceId) {
          stamp = Math.max(stamp, Date.parse(note.updatedAt) + 1)
        }
      }
      const now = new Date(stamp).toISOString()
      const note = snapshotNote({
        noteId: randomUUID() as WorkspaceNote['noteId'],
        workspaceId: request.workspaceId,
        revision: 1,
        content: content.value,
        agentVisible: request.agentVisible,
        source: request.source,
        createdAt: now,
        updatedAt: now,
      })
      await this.requireNotes().put(note.noteId, note)
      const revision = await this.bumpRevision(request.workspaceId)
      this.emitChanged(request.workspaceId, revision)
      return success(note)
    })
  }

  /**
   * Edit one note's content and/or Agent visibility against an observed
   * revision. A matching no-op returns the stored note without changing its
   * revision.
   * @param request - target, observed revision, and desired fields.
   * @returns the committed note or an explicit business failure.
   */
  @Remote('update')
  update(request: WorkspaceNotesUpdateRequest): Promise<WorkspaceNotesUpdateResult> {
    const content = request.content === undefined ? undefined : this.resolveContent(request.content)
    if (content !== undefined && !content.ok) return Promise.resolve(content)
    const stored = this.requireNotes().get(request.noteId)
    if (stored === undefined) {
      return Promise.resolve(rejected({ code: 'unknown-note', noteId: request.noteId }))
    }
    return this.enqueue(stored.workspaceId, async () => this.updateCommitted(request, content))
  }

  /**
   * Delete one note against an observed revision. Absence is successful
   * regardless of the supplied revision.
   * @param request - target note and observed revision.
   * @returns the stable absent postcondition, or an explicit failure.
   */
  @Remote('delete')
  delete(request: WorkspaceNotesDeleteRequest): Promise<WorkspaceNotesDeleteResult> {
    const stored = this.requireNotes().get(request.noteId)
    if (stored === undefined) {
      return Promise.resolve(success<WorkspaceNotesDeleteValue>(Object.freeze({ absent: true })))
    }
    return this.enqueue(stored.workspaceId, async () => {
      const current = this.requireNotes().get(request.noteId)
      if (current === undefined) {
        return success<WorkspaceNotesDeleteValue>(Object.freeze({ absent: true }))
      }
      if (this.ctx.workspaceRegistry.get(current.workspaceId) === undefined) {
        return rejected({ code: 'unknown-workspace', workspaceId: current.workspaceId })
      }
      if (request.expectedRevision !== current.revision) {
        return rejected({
          code: 'revision-conflict',
          current: snapshotNote(current),
        })
      }
      const workspaceId = current.workspaceId
      await this.requireNotes().delete(request.noteId)
      const revision = await this.bumpRevision(workspaceId)
      this.emitChanged(workspaceId, revision)
      return success<WorkspaceNotesDeleteValue>(Object.freeze({ absent: true }))
    })
  }

  /** Compare-and-set body of `update`, running inside the workspace's chain. */
  private async updateCommitted(
    request: WorkspaceNotesUpdateRequest,
    content: WorkspaceNotesSuccess<string> | undefined,
  ): Promise<WorkspaceNotesUpdateResult> {
    const current = this.requireNotes().get(request.noteId)
    if (current === undefined) {
      return rejected({ code: 'unknown-note', noteId: request.noteId })
    }
    if (this.ctx.workspaceRegistry.get(current.workspaceId) === undefined) {
      return rejected({ code: 'unknown-workspace', workspaceId: current.workspaceId })
    }
    if (request.expectedRevision !== current.revision) {
      return rejected({
        code: 'revision-conflict',
        current: snapshotNote(current),
      })
    }
    const nextContent = content?.value
    const nextVisible = request.agentVisible
    if (nextContent === undefined && nextVisible === undefined) {
      return success(snapshotNote(current))
    }
    if (nextContent === current.content
      && (nextVisible === undefined || nextVisible === current.agentVisible)) {
      return success(snapshotNote(current))
    }
    const updatedTs = Math.max(Date.now(), Date.parse(current.updatedAt))
    const note = snapshotNote({
      noteId: current.noteId,
      workspaceId: current.workspaceId,
      revision: current.revision + 1,
      content: nextContent ?? current.content,
      agentVisible: nextVisible ?? current.agentVisible,
      source: current.source,
      createdAt: current.createdAt,
      updatedAt: new Date(updatedTs).toISOString(),
    })
    await this.requireNotes().put(note.noteId, note)
    const revision = await this.bumpRevision(note.workspaceId)
    this.emitChanged(note.workspaceId, revision)
    return success(note)
  }

  /**
   * Queue and run the cleanup of one deregistered workspace's records,
   * serialized behind that workspace's prior mutations so a late write cannot
   * resurrect a record the cleanup already removed: the queue row lands
   * first, the notes delete next, and the queue row goes last — so any
   * interruption between steps replays safely on the next open.
   * @param workspaceId - Workspace whose registration was deleted.
   * @returns resolution after the queue row is durable.
   */
  private enqueueCleanup(workspaceId: WorkspaceId): Promise<void> {
    return this.enqueue(workspaceId, async () => {
      await this.requireCleanupQueue().put(workspaceId, { queuedAt: Date.now() })
      await this.runCleanup(workspaceId)
    })
  }

  /** Delete every note of one workspace, then its queue row, then publish. */
  private async runCleanup(workspaceId: WorkspaceId): Promise<void> {
    const notes = this.requireNotes()
    for (const [noteId, note] of notes.entries()) {
      if (note.workspaceId === workspaceId) await notes.delete(noteId)
    }
    await this.requireCleanupQueue().delete(workspaceId)
    const revision = await this.bumpRevision(workspaceId)
    this.emitChanged(workspaceId, revision)
  }

  /** Advance one workspace's artifact-family revision and persist it. */
  private async bumpRevision(workspaceId: WorkspaceId): Promise<number> {
    const global = this.requireRevisions()
    const current = global.get()
    const next = (current.revisions[workspaceId] ?? 0) + 1
    const revisions = { ...current.revisions, [workspaceId]: next }
    await global.set({ revisions })
    return next
  }

  /** Publish one committed change to host-event subscribers. */
  private emitChanged(workspaceId: WorkspaceId, revision: number): void {
    this.ctx.emit('workspace-notes/changed', { workspaceId, revision })
  }

  /** Validate content semantics and the configured complete UTF-8 byte bound. */
  private resolveContent(content: string): ResolvedContent {
    if (content.trim().length === 0) return rejected({ code: 'content-blank' })
    const actualBytes = Buffer.byteLength(content, 'utf8')
    if (actualBytes > this.maxContentBytes) {
      return rejected({ code: 'content-too-large', maxBytes: this.maxContentBytes, actualBytes })
    }
    return success(content)
  }

  /** Queue a complete read/compare/write mutation behind this workspace's prior mutation. */
  private enqueue<T>(workspaceId: WorkspaceId, operation: () => Promise<T>): Promise<T> {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error('workspace-notes: service is disposing'))
    }
    const previous = this.operationTails.get(workspaceId) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.operationTails.set(workspaceId, tail)
    return result.finally(() => {
      if (this.operationTails.get(workspaceId) === tail) this.operationTails.delete(workspaceId)
    })
  }

  /** Resolve the initialized notes table or fail a broken service lifecycle. */
  private requireNotes(): KvTable<string, WorkspaceNote> {
    if (this.notes === undefined) {
      throw new Error('workspace-notes: durable domain is not initialized')
    }
    return this.notes
  }

  /** Resolve the initialized cleanup-queue table or fail a broken service lifecycle. */
  private requireCleanupQueue(): KvTable<string, WorkspaceNotesCleanupRow> {
    if (this.cleanupQueue === undefined) {
      throw new Error('workspace-notes: durable domain is not initialized')
    }
    return this.cleanupQueue
  }

  /** Resolve the initialized revision global or fail a broken service lifecycle. */
  private requireRevisions(): DomainGlobal<WorkspaceNotesRevisions> {
    if (this.revisions === undefined) {
      throw new Error('workspace-notes: durable domain is not initialized')
    }
    return this.revisions
  }
}

export default WorkspaceNotesService
