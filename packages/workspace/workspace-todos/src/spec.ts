/**
 * Durable storage-domain declaration for workspace-scoped shared todos.
 * @module @deepseek-ai/dsh-workspace-todos/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  SharedTodo,
  SharedTodoCreatedBy,
  SharedTodoId,
} from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveRevision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for one opaque todo identity stored as the record key. */
export const sharedTodoIdSchema = z.string().min(1).transform(value => value as SharedTodoId)

/** Runtime schema for one opaque workspace identity stored on a record. */
export const workspaceIdSchema = z.string().min(1).transform(value => value as WorkspaceId)

/** Runtime schema for the closed lifecycle status. */
export const sharedTodoStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled'])

/** Runtime schema for the closed creation-provenance discriminant. */
// Zod infers transformed branded fields structurally, so it cannot name the
// public union even though every branded output is created below.
export const sharedTodoCreatedBySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user') }),
  z.object({
    kind: z.literal('agent'),
    sessionId: z.string().min(1).transform(value => value as SessionId),
  }),
]) as unknown as z.ZodType<SharedTodoCreatedBy>

/** Runtime schema for one current todo record. */
export const sharedTodoSchema = z.object({
  todoId: sharedTodoIdSchema,
  workspaceId: workspaceIdSchema,
  revision: positiveRevision,
  content: z.string().min(1),
  status: sharedTodoStatusSchema,
  createdBy: sharedTodoCreatedBySchema,
  assignedSessionId: z.string().min(1).transform(value => value as SessionId).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
}).refine(todo => todo.updatedAt >= todo.createdAt, {
  path: ['updatedAt'],
  message: 'shared todo updatedAt must not precede createdAt',
}).refine(todo => (todo.status === 'completed') === (todo.completedAt !== null), {
  path: ['completedAt'],
  message: 'shared todo completedAt must be set exactly when status is completed',
}) as unknown as z.ZodType<SharedTodo>

/** Persisted row of the `cleanup_queue` table: one workspace awaiting record deletion. */
export interface SharedTodosCleanupRow {
  /** Host-assigned enqueue time in Unix epoch milliseconds. */
  readonly queuedAt: number
}

/** Runtime schema for one cleanup-queue row. */
export const sharedTodosCleanupRowSchema = z.object({
  queuedAt: nonNegativeSafeInteger,
})

/**
 * Per-workspace monotone artifact-family revision counters, advanced after
 * every committed change and completed cleanup so push frames can order
 * invalidations.
 */
export interface SharedTodosRevisions {
  readonly revisions: Readonly<Record<string, number>>
}

/** Runtime schema for the domain global. */
export const sharedTodosRevisionsSchema = z.object({
  revisions: z.record(z.string(), positiveRevision),
})

/** The one workspace-todos domain: todos by id, cleanup queue by workspace id. */
export const sharedTodosDomainSpec = defineDomain({
  name: 'workspace_todos',
  version: 0,
  global: {
    schema: sharedTodosRevisionsSchema,
    initial: { revisions: {} } satisfies SharedTodosRevisions,
  },
  tables: {
    todos: domainTable<SharedTodoId, SharedTodo>(sharedTodoSchema),
    cleanup_queue: domainTable<WorkspaceId, SharedTodosCleanupRow>(sharedTodosCleanupRowSchema),
  },
})
