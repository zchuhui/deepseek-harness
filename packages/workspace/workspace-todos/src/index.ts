/**
 * Durable, workspace-scoped shared todos with revision compare-and-set,
 * validated status transitions, committed assignment, queued
 * workspace-removal cleanup, and a Typert remote namespace.
 * @module @deepseek-ai/dsh-workspace-todos
 */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { DomainChanged, KvTable, DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { sharedTodosDomainSpec } from './spec.ts'
import type { SharedTodosCleanupRow, SharedTodosRevisions } from './spec.ts'
import type {
  SharedTodo,
  SharedTodoStatus,
  SharedTodosAssignRequest,
  SharedTodosAssignResult,
  SharedTodosCreateRequest,
  SharedTodosCreateResult,
  SharedTodosDeleteRequest,
  SharedTodosDeleteResult,
  SharedTodosDeleteValue,
  SharedTodosFailure,
  SharedTodosListRequest,
  SharedTodosListResult,
  SharedTodosListValue,
  SharedTodosRejected,
  SharedTodosSetStatusRequest,
  SharedTodosSetStatusResult,
  SharedTodosSuccess,
  SharedTodosUpdateContentRequest,
  SharedTodosUpdateContentResult,
} from './types.ts'

export type * from './types.ts'
export {
  sharedTodosDomainSpec,
  sharedTodoSchema,
  sharedTodoStatusSchema,
  sharedTodoCreatedBySchema,
  sharedTodosCleanupRowSchema,
  sharedTodosRevisionsSchema,
} from './spec.ts'
export type {
  SharedTodosCleanupRow,
  SharedTodosRevisions,
} from './spec.ts'

/** Required deployment policy for shared todos. */
export interface Config {
  /** Maximum UTF-8 byte length accepted for one todo's single-line content. */
  readonly maxContentBytes: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workspaceTodos: WorkspaceTodosService
  }
}

/** Validate the one deployment-varying limit at the configuration boundary. */
function resolveMaxContentBytes(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `workspace-todos: maxContentBytes must be a positive safe integer, got ${String(value)}`,
    )
  }
  return value
}

/** Copy and freeze one todo before it crosses the service boundary. */
function snapshotTodo(todo: SharedTodo): SharedTodo {
  return Object.freeze({
    todoId: todo.todoId,
    workspaceId: todo.workspaceId,
    revision: todo.revision,
    content: todo.content,
    status: todo.status,
    createdBy: Object.freeze({ ...todo.createdBy }),
    assignedSessionId: todo.assignedSessionId,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    completedAt: todo.completedAt,
  })
}

/** Build a frozen success branch. */
function success<T>(value: T): SharedTodosSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected<E extends SharedTodosFailure>(error: E): SharedTodosRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Rank the four statuses for the ordered view. */
const STATUS_RANK: Readonly<Record<SharedTodoStatus, number>> = Object.freeze({
  pending: 0,
  in_progress: 1,
  completed: 2,
  cancelled: 3,
})

/** Ordered view: status rank, then `createdAt` ascending, then `todoId` ascending. */
function compareTodos(left: SharedTodo, right: SharedTodo): number {
  return STATUS_RANK[left.status] - STATUS_RANK[right.status]
    || left.createdAt.localeCompare(right.createdAt)
    || (left.todoId < right.todoId ? -1 : left.todoId > right.todoId ? 1 : 0)
}

/** Documented allowed status transitions. */
const ALLOWED_TRANSITIONS: Readonly<Record<SharedTodoStatus, readonly SharedTodoStatus[]>> = Object.freeze({
  pending: Object.freeze(['in_progress', 'cancelled'] as const),
  in_progress: Object.freeze(['pending', 'completed', 'cancelled'] as const),
  completed: Object.freeze(['pending'] as const),
  cancelled: Object.freeze(['pending'] as const),
})

/** Validated content or one explicit request failure. */
type ResolvedContent =
  | SharedTodosSuccess<string>
  | SharedTodosRejected<Extract<SharedTodosFailure, { code: 'content-blank' | 'content-not-single-line' | 'content-too-large' }>>

/**
 * Workspace-scoped shared todos service. It owns the `workspace-todos`
 * storage domain, serializes each workspace's mutations, validates the
 * documented status transitions, commits assignments atomically, queues
 * record cleanup when a workspace registration is deleted, and recovers
 * interrupted cleanups on open. Disabling the plugin closes the domain
 * without deleting it; reopening restores every still-registered
 * workspace's todos.
 */
export class WorkspaceTodosService extends TypertRemoteService {
  static inject = ['storageDomain', 'workspaceRegistry']

  /** Loader validation for the required content-size policy. */
  static Config: s<Config> = s.object({
    maxContentBytes: s.number().step(1).min(1).required(),
  })

  private readonly maxContentBytes: number
  private todos?: KvTable<SharedTodo['todoId'], SharedTodo>
  private cleanupQueue?: KvTable<WorkspaceId, SharedTodosCleanupRow>
  private revisions?: DomainGlobal<SharedTodosRevisions>
  private readonly operationTails = new Map<WorkspaceId, Promise<void>>()
  private mutationAdmissionOpen = true

  /**
   * @param ctx - Host context carrying the storage-domain form and the
   * workspace registry.
   * @param config - Required content-size policy.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'workspaceTodos')
    this.maxContentBytes = resolveMaxContentBytes(config.maxContentBytes)
  }

  /** Open the domain, recover interrupted cleanups, and watch workspace removals. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(sharedTodosDomainSpec)
    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await Promise.all(this.operationTails.values())
      await domain.close()
    }, 'workspace-todos.domainClose')
    this.todos = domain.table('todos')
    this.cleanupQueue = domain.table('cleanup_queue')
    this.revisions = domain.global

    // Recovery reruns every queued entry; record deletion is idempotent, so a
    // crash between steps is safe to replay.
    for (const key of [...this.requireCleanupQueue().keys()]) {
      await this.runCleanup(key as WorkspaceId)
    }
    // Todos whose workspace was deleted while this family was disabled never
    // entered the queue; reconcile them the same way at open.
    const orphans = new Set<WorkspaceId>()
    for (const [, todo] of this.requireTodos().entries()) {
      if (this.ctx.workspaceRegistry.get(todo.workspaceId) === undefined) orphans.add(todo.workspaceId)
    }
    for (const workspaceId of orphans) await this.enqueueCleanup(workspaceId)

    this.ctx.on('domain/changed', (change: DomainChanged) => {
      if (change.domain !== 'workspace' || change.table !== 'workspaces' || change.operation !== 'deleted') return
      // A rejection here means the service is disposing; the queue row then
      // never landed, and the next open's orphan reconciliation owns the
      // cleanup instead.
      this.enqueueCleanup(change.key as WorkspaceId).catch((error: unknown) => {
        this.ctx.logger.warn(`workspace-todos: deferred cleanup of '${change.key}' failed: ${String(error)}`)
      })
    })
  }

  /**
   * Read the ordered todo view of one registered workspace.
   * @param request - Workspace whose todos should be read.
   * @returns the ordered immutable view or `unknown-workspace`.
   */
  @Remote('list')
  list(request: SharedTodosListRequest): Promise<SharedTodosListResult> {
    if (this.ctx.workspaceRegistry.get(request.workspaceId) === undefined) {
      return Promise.resolve(rejected({ code: 'unknown-workspace', workspaceId: request.workspaceId }))
    }
    const todos = [...this.requireTodos().entries()]
      .map(([, todo]) => todo)
      .filter(todo => todo.workspaceId === request.workspaceId)
      .sort(compareTodos)
    const copied = Object.freeze(todos.map(snapshotTodo))
    return Promise.resolve(success(Object.freeze({ todos: copied }) as SharedTodosListValue))
  }

  /**
   * Create one shared todo in a registered workspace at revision 1 in
   * status `pending`.
   * @param request - owning workspace, validated content, and immutable
   * provenance.
   * @returns the committed todo or an explicit business failure.
   */
  @Remote('create')
  create(request: SharedTodosCreateRequest): Promise<SharedTodosCreateResult> {
    const content = this.resolveContent(request.content)
    if (!content.ok) return Promise.resolve(content)
    return this.enqueue(request.workspaceId, async () => {
      if (this.ctx.workspaceRegistry.get(request.workspaceId) === undefined) {
        return rejected({ code: 'unknown-workspace', workspaceId: request.workspaceId })
      }
      const now = new Date().toISOString()
      const todo = snapshotTodo({
        todoId: randomUUID() as SharedTodo['todoId'],
        workspaceId: request.workspaceId,
        revision: 1,
        content: content.value,
        status: 'pending',
        createdBy: request.createdBy,
        assignedSessionId: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })
      await this.requireTodos().put(todo.todoId, todo)
      const revision = await this.bumpRevision(request.workspaceId)
      this.emitChanged(request.workspaceId, revision)
      return success(todo)
    })
  }

  /**
   * Edit one shared todo's content against an observed revision. A matching
   * no-op returns the stored todo without changing its revision.
   * @param request - target, observed revision, and replacement content.
   * @returns the committed todo or an explicit business failure.
   */
  @Remote('updateContent')
  updateContent(request: SharedTodosUpdateContentRequest): Promise<SharedTodosUpdateContentResult> {
    const content = this.resolveContent(request.content)
    if (!content.ok) return Promise.resolve(content)
    const stored = this.requireTodos().get(request.todoId)
    if (stored === undefined) {
      return Promise.resolve(rejected({ code: 'unknown-todo', todoId: request.todoId }))
    }
    return this.enqueue(stored.workspaceId, async () => this.updateContentCommitted(request, content))
  }

  /**
   * Move one shared todo to a requested status against an observed revision.
   * The transition must be one of the documented allowed transitions; a
   * request for the current status is a matching no-op.
   * @param request - target, observed revision, and requested status.
   * @returns the committed todo or an explicit business failure.
   */
  @Remote('setStatus')
  setStatus(request: SharedTodosSetStatusRequest): Promise<SharedTodosSetStatusResult> {
    const stored = this.requireTodos().get(request.todoId)
    if (stored === undefined) {
      return Promise.resolve(rejected({ code: 'unknown-todo', todoId: request.todoId }))
    }
    return this.enqueue(stored.workspaceId, async () => {
      const current = this.requireTodos().get(request.todoId)
      if (current === undefined) {
        return rejected({ code: 'unknown-todo', todoId: request.todoId })
      }
      if (this.ctx.workspaceRegistry.get(current.workspaceId) === undefined) {
        return rejected({ code: 'unknown-workspace', workspaceId: current.workspaceId })
      }
      if (request.expectedRevision !== current.revision) {
        return rejected({ code: 'revision-conflict', current: snapshotTodo(current) })
      }
      if (request.status === current.status) {
        return success(snapshotTodo(current))
      }
      if (!ALLOWED_TRANSITIONS[current.status].includes(request.status)) {
        return rejected({ code: 'invalid-transition', current: current.status, requested: request.status })
      }
      const updatedTs = Math.max(Date.now(), Date.parse(current.updatedAt))
      const todo = snapshotTodo({
        ...current,
        revision: current.revision + 1,
        status: request.status,
        completedAt: request.status === 'completed' ? new Date(updatedTs).toISOString() : null,
        updatedAt: new Date(updatedTs).toISOString(),
      })
      await this.requireTodos().put(todo.todoId, todo)
      const revision = await this.bumpRevision(todo.workspaceId)
      this.emitChanged(todo.workspaceId, revision)
      return success(todo)
    })
  }

  /**
   * Commit one assignment: `pending → in_progress` plus `assignedSessionId`
   * in one atomic compare-and-set. Reassignment of a `pending` todo that
   * carries an earlier assignment (for example after `completed → pending`)
   * replaces that session id.
   * @param request - target, observed revision, and addressed session.
   * @returns the committed todo or an explicit business failure.
   */
  @Remote('assign')
  assign(request: SharedTodosAssignRequest): Promise<SharedTodosAssignResult> {
    const stored = this.requireTodos().get(request.todoId)
    if (stored === undefined) {
      return Promise.resolve(rejected({ code: 'unknown-todo', todoId: request.todoId }))
    }
    return this.enqueue(stored.workspaceId, async () => {
      const current = this.requireTodos().get(request.todoId)
      if (current === undefined) {
        return rejected({ code: 'unknown-todo', todoId: request.todoId })
      }
      if (this.ctx.workspaceRegistry.get(current.workspaceId) === undefined) {
        return rejected({ code: 'unknown-workspace', workspaceId: current.workspaceId })
      }
      if (request.expectedRevision !== current.revision) {
        return rejected({ code: 'revision-conflict', current: snapshotTodo(current) })
      }
      if (current.status !== 'pending') {
        return rejected({ code: 'invalid-transition', current: current.status, requested: 'in_progress' })
      }
      const updatedTs = Math.max(Date.now(), Date.parse(current.updatedAt))
      const todo = snapshotTodo({
        ...current,
        revision: current.revision + 1,
        status: 'in_progress',
        assignedSessionId: request.sessionId,
        updatedAt: new Date(updatedTs).toISOString(),
      })
      await this.requireTodos().put(todo.todoId, todo)
      const revision = await this.bumpRevision(todo.workspaceId)
      this.emitChanged(todo.workspaceId, revision)
      return success(todo)
    })
  }

  /**
   * Delete one shared todo against an observed revision. Absence is
   * successful regardless of the supplied revision.
   * @param request - target todo and observed revision.
   * @returns the stable absent postcondition, or an explicit failure.
   */
  @Remote('delete')
  delete(request: SharedTodosDeleteRequest): Promise<SharedTodosDeleteResult> {
    const stored = this.requireTodos().get(request.todoId)
    if (stored === undefined) {
      return Promise.resolve(success<SharedTodosDeleteValue>(Object.freeze({ absent: true })))
    }
    return this.enqueue(stored.workspaceId, async () => {
      const current = this.requireTodos().get(request.todoId)
      if (current === undefined) {
        return success<SharedTodosDeleteValue>(Object.freeze({ absent: true }))
      }
      if (this.ctx.workspaceRegistry.get(current.workspaceId) === undefined) {
        return rejected({ code: 'unknown-workspace', workspaceId: current.workspaceId })
      }
      if (request.expectedRevision !== current.revision) {
        return rejected({ code: 'revision-conflict', current: snapshotTodo(current) })
      }
      const workspaceId = current.workspaceId
      await this.requireTodos().delete(request.todoId)
      const revision = await this.bumpRevision(workspaceId)
      this.emitChanged(workspaceId, revision)
      return success<SharedTodosDeleteValue>(Object.freeze({ absent: true }))
    })
  }

  /** Compare-and-set body of `updateContent`, running inside the workspace's chain. */
  private async updateContentCommitted(
    request: SharedTodosUpdateContentRequest,
    content: SharedTodosSuccess<string>,
  ): Promise<SharedTodosUpdateContentResult> {
    const current = this.requireTodos().get(request.todoId)
    if (current === undefined) {
      return rejected({ code: 'unknown-todo', todoId: request.todoId })
    }
    if (this.ctx.workspaceRegistry.get(current.workspaceId) === undefined) {
      return rejected({ code: 'unknown-workspace', workspaceId: current.workspaceId })
    }
    if (request.expectedRevision !== current.revision) {
      return rejected({ code: 'revision-conflict', current: snapshotTodo(current) })
    }
    if (content.value === current.content) {
      return success(snapshotTodo(current))
    }
    const updatedTs = Math.max(Date.now(), Date.parse(current.updatedAt))
    const todo = snapshotTodo({
      ...current,
      revision: current.revision + 1,
      content: content.value,
      updatedAt: new Date(updatedTs).toISOString(),
    })
    await this.requireTodos().put(todo.todoId, todo)
    const revision = await this.bumpRevision(todo.workspaceId)
    this.emitChanged(todo.workspaceId, revision)
    return success(todo)
  }

  /**
   * Queue and run the cleanup of one deregistered workspace's records,
   * serialized behind that workspace's prior mutations so a late write cannot
   * resurrect a record the cleanup already removed: the queue row lands
   * first, the todos delete next, and the queue row goes last — so any
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

  /** Delete every todo of one workspace, then its queue row, then publish. */
  private async runCleanup(workspaceId: WorkspaceId): Promise<void> {
    const todos = this.requireTodos()
    for (const [todoId, todo] of todos.entries()) {
      if (todo.workspaceId === workspaceId) await todos.delete(todoId)
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
    this.ctx.emit('workspace-todos/changed', { workspaceId, revision })
  }

  /** Validate single-line content semantics and the configured complete UTF-8 byte bound. */
  private resolveContent(content: string): ResolvedContent {
    if (content.trim().length === 0) return rejected({ code: 'content-blank' })
    if (/[\r\n]/.test(content)) return rejected({ code: 'content-not-single-line' })
    const actualBytes = Buffer.byteLength(content, 'utf8')
    if (actualBytes > this.maxContentBytes) {
      return rejected({ code: 'content-too-large', maxBytes: this.maxContentBytes, actualBytes })
    }
    return success(content)
  }

  /** Queue a complete read/compare/write mutation behind this workspace's prior mutation. */
  private enqueue<T>(workspaceId: WorkspaceId, operation: () => Promise<T>): Promise<T> {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error('workspace-todos: service is disposing'))
    }
    const previous = this.operationTails.get(workspaceId) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.operationTails.set(workspaceId, tail)
    return result.finally(() => {
      if (this.operationTails.get(workspaceId) === tail) this.operationTails.delete(workspaceId)
    })
  }

  /** Resolve the initialized todos table or fail a broken service lifecycle. */
  private requireTodos(): KvTable<string, SharedTodo> {
    if (this.todos === undefined) {
      throw new Error('workspace-todos: durable domain is not initialized')
    }
    return this.todos
  }

  /** Resolve the initialized cleanup-queue table or fail a broken service lifecycle. */
  private requireCleanupQueue(): KvTable<string, SharedTodosCleanupRow> {
    if (this.cleanupQueue === undefined) {
      throw new Error('workspace-todos: durable domain is not initialized')
    }
    return this.cleanupQueue
  }

  /** Resolve the initialized revision global or fail a broken service lifecycle. */
  private requireRevisions(): DomainGlobal<SharedTodosRevisions> {
    if (this.revisions === undefined) {
      throw new Error('workspace-todos: durable domain is not initialized')
    }
    return this.revisions
  }
}

export default WorkspaceTodosService
