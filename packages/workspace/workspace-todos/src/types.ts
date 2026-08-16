/**
 * Public request, value, and failure vocabulary for workspace-scoped shared
 * todos. This module contains types only so generated Remote clients can
 * consume it without importing Host runtime code.
 * @module @deepseek-ai/dsh-workspace-todos/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Opaque identity of one shared todo inside its workspace-todos domain. */
export type SharedTodoId = Branded<'SharedTodoId'>

/**
 * Lifecycle status of one shared todo. Allowed transitions are
 * `pending → in_progress | cancelled`, `in_progress → pending | completed |
 * cancelled`, `completed → pending`, and `cancelled → pending`.
 */
export type SharedTodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

/**
 * How one shared todo was created. The discriminant is closed: `switch` on
 * `kind` and end in `assertNever`-style exhaustiveness.
 */
export type SharedTodoCreatedBy =
  | SharedTodoCreatedByUser
  | SharedTodoCreatedByAgent

/** Created by hand in the todos workbench tab. */
export interface SharedTodoCreatedByUser {
  readonly kind: 'user'
}

/** Created by an Agent through the approved todos_update tool. */
export interface SharedTodoCreatedByAgent {
  readonly kind: 'agent'
  /** Session whose Agent created this todo. */
  readonly sessionId: SessionId
}

/** One committed shared todo and its compare-and-set revision. */
export interface SharedTodo {
  /** Stable identity within the workspace-todos domain. */
  readonly todoId: SharedTodoId
  /** Owning registered workspace. */
  readonly workspaceId: WorkspaceId
  /** Positive integer incremented by every material update. */
  readonly revision: number
  /** Single-line body, preserved verbatim after validation. */
  readonly content: string
  /** Current lifecycle status. */
  readonly status: SharedTodoStatus
  /** Immutable creation provenance. */
  readonly createdBy: SharedTodoCreatedBy
  /**
   * Session the assignment action committed, or `null` while unassigned.
   * Written only by `assign`.
   */
  readonly assignedSessionId: SessionId | null
  /** Host-assigned creation time, ISO-8601 with milliseconds. */
  readonly createdAt: string
  /** Host-assigned time of the most recent material update, ISO-8601 with milliseconds. */
  readonly updatedAt: string
  /**
   * Time this todo entered its current `completed` status, or `null` in every
   * other status. Set on entering `completed`, cleared on leaving it.
   */
  readonly completedAt: string | null
}

/** Read the ordered todo view of one registered workspace. */
export interface SharedTodosListRequest {
  /** Workspace whose todos should be read. */
  readonly workspaceId: WorkspaceId
}

/**
 * Ordered todo view: status rank (`pending`, then `in_progress`, then
 * `completed`, then `cancelled`), then `createdAt` ascending, then `todoId`
 * ascending.
 */
export interface SharedTodosListValue {
  /** Fresh immutable todo snapshots. */
  readonly todos: readonly SharedTodo[]
}

/** Create one shared todo in a registered workspace at revision 1. */
export interface SharedTodosCreateRequest {
  /** Owning registered workspace. */
  readonly workspaceId: WorkspaceId
  /** Single-line body; non-blank and within the configured byte limit. */
  readonly content: string
  /** Immutable creation provenance. */
  readonly createdBy: SharedTodoCreatedBy
}

/** Edit one shared todo's content against an observed revision. */
export interface SharedTodosUpdateContentRequest {
  /** Target todo identity. */
  readonly todoId: SharedTodoId
  /** Revision the caller observed; must equal the stored revision. */
  readonly expectedRevision: number
  /** Replacement single-line body. */
  readonly content: string
}

/**
 * Move one shared todo to a new status against an observed revision. The
 * requested transition must be one of the documented allowed transitions.
 */
export interface SharedTodosSetStatusRequest {
  /** Target todo identity. */
  readonly todoId: SharedTodoId
  /** Revision the caller observed; must equal the stored revision. */
  readonly expectedRevision: number
  /** Requested status. */
  readonly status: SharedTodoStatus
}

/**
 * Commit one assignment: `pending → in_progress` plus `assignedSessionId` in
 * one atomic compare-and-set.
 */
export interface SharedTodosAssignRequest {
  /** Target todo identity. */
  readonly todoId: SharedTodoId
  /** Revision the caller observed; must equal the stored revision. */
  readonly expectedRevision: number
  /** Session the assignment addresses. */
  readonly sessionId: SessionId
}

/** Delete one shared todo against an observed revision. */
export interface SharedTodosDeleteRequest {
  /** Target todo identity. */
  readonly todoId: SharedTodoId
  /** Revision the caller observed; ignored when the todo is already absent. */
  readonly expectedRevision: number
}

/** Idempotent deletion acknowledgement. */
export interface SharedTodosDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}

/** The addressed workspace is not registered. */
export interface SharedTodosUnknownWorkspace {
  readonly code: 'unknown-workspace'
  readonly workspaceId: WorkspaceId
}

/** The addressed todo does not exist. */
export interface SharedTodosUnknownTodo {
  readonly code: 'unknown-todo'
  readonly todoId: SharedTodoId
}

/** A material mutation did not match the addressed todo's current revision. */
export interface SharedTodosRevisionConflict {
  readonly code: 'revision-conflict'
  /** Authoritative current todo, or `null` when it does not exist. */
  readonly current: SharedTodo | null
}

/** The requested status change is not one of the allowed transitions. */
export interface SharedTodosInvalidTransition {
  readonly code: 'invalid-transition'
  /** Status the todo is in. */
  readonly current: SharedTodoStatus
  /** Status the request asked for. */
  readonly requested: SharedTodoStatus
}

/** A supplied content contains no non-whitespace character. */
export interface SharedTodosContentBlank {
  readonly code: 'content-blank'
}

/** A supplied content contains a line break. */
export interface SharedTodosContentNotSingleLine {
  readonly code: 'content-not-single-line'
}

/** A supplied content exceeds the configured UTF-8 byte limit. */
export interface SharedTodosContentTooLarge {
  readonly code: 'content-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}

/** Failures shared by the public workspace-todos operations. */
export type SharedTodosFailure =
  | SharedTodosUnknownWorkspace
  | SharedTodosUnknownTodo
  | SharedTodosRevisionConflict
  | SharedTodosInvalidTransition
  | SharedTodosContentBlank
  | SharedTodosContentNotSingleLine
  | SharedTodosContentTooLarge

/** Successful public operation result. */
export interface SharedTodosSuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Rejected public operation result with a stable business failure. */
export interface SharedTodosRejected<E extends SharedTodosFailure> {
  readonly ok: false
  readonly error: E
}

/** Result returned by the workspace-todos `list` operation. */
export type SharedTodosListResult =
  | SharedTodosSuccess<SharedTodosListValue>
  | SharedTodosRejected<SharedTodosUnknownWorkspace>

/** Result returned by the workspace-todos `create` operation. */
export type SharedTodosCreateResult =
  | SharedTodosSuccess<SharedTodo>
  | SharedTodosRejected<
    | SharedTodosUnknownWorkspace
    | SharedTodosContentBlank
    | SharedTodosContentNotSingleLine
    | SharedTodosContentTooLarge
  >

/** Result returned by the workspace-todos `updateContent` operation. */
export type SharedTodosUpdateContentResult =
  | SharedTodosSuccess<SharedTodo>
  | SharedTodosRejected<
    | SharedTodosUnknownWorkspace
    | SharedTodosUnknownTodo
    | SharedTodosRevisionConflict
    | SharedTodosContentBlank
    | SharedTodosContentNotSingleLine
    | SharedTodosContentTooLarge
  >

/** Result returned by the workspace-todos `setStatus` operation. */
export type SharedTodosSetStatusResult =
  | SharedTodosSuccess<SharedTodo>
  | SharedTodosRejected<
    | SharedTodosUnknownWorkspace
    | SharedTodosUnknownTodo
    | SharedTodosRevisionConflict
    | SharedTodosInvalidTransition
  >

/** Result returned by the workspace-todos `assign` operation. */
export type SharedTodosAssignResult =
  | SharedTodosSuccess<SharedTodo>
  | SharedTodosRejected<
    | SharedTodosUnknownWorkspace
    | SharedTodosUnknownTodo
    | SharedTodosRevisionConflict
    | SharedTodosInvalidTransition
  >

/** Result returned by the workspace-todos `delete` operation. */
export type SharedTodosDeleteResult =
  | SharedTodosSuccess<SharedTodosDeleteValue>
  | SharedTodosRejected<
    | SharedTodosUnknownWorkspace
    | SharedTodosRevisionConflict
  >

/** One committed change or recovered cleanup of a workspace's todos. */
export interface SharedTodosChanged {
  /** Workspace whose todos view changed. */
  readonly workspaceId: WorkspaceId
  /** New monotone artifact-family revision of that workspace's todos. */
  readonly revision: number
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A workspace's todos view changed after a committed create, content
     * edit, status change, assignment, delete, or completed cleanup
     * recovery. Emitted after the storage domain acknowledges durability and
     * the per-workspace artifact-family revision advances; forwarded to
     * consumers as the push invalidation signal.
     * @param change - owning workspace and its new todos-family revision.
     * @mode emit
     */
    'workspace-todos/changed'(change: SharedTodosChanged): void
  }
}
