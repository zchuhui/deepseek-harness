/**
 * Public vocabulary of the workspace-todos agent integration: the todos tool
 * result unions and the status-approval policy. Types only, so generated
 * faces can consume them without Host runtime code.
 * @module @deepseek-ai/dsh-workspace-todos-agent/types
 */

import type { SharedTodo, SharedTodoStatus } from '@deepseek-ai/dsh-workspace-todos/types'

/**
 * Whether `todos_update` set-status calls ask a human before they commit.
 * Create and content-edit calls always ask regardless of this policy.
 */
export type TodosStatusApprovalPolicy = 'ask' | 'allow'

/** Business failure codes shared by the todos tools. */
export type WorkspaceTodosToolFailure =
  | { readonly code: 'no-workspace' }
  | { readonly code: 'unknown-workspace' }
  | { readonly code: 'unknown-todo' }
  | { readonly code: 'revision-conflict'; readonly currentRevision: number }
  | { readonly code: 'invalid-transition'; readonly current: SharedTodoStatus; readonly requested: SharedTodoStatus }
  | { readonly code: 'content-blank' }
  | { readonly code: 'content-not-single-line' }
  | { readonly code: 'content-too-large' }

/** Failure codes `todos_read` can surface, matching its output schema. */
export type WorkspaceTodosReadFailure =
  | { readonly code: 'no-workspace' }
  | { readonly code: 'unknown-workspace' }

/** Result of `todos_read`: the workspace's committed ordered view, or a business failure. */
export type TodosReadResult =
  | { readonly ok: true; readonly todos: SharedTodo[] }
  | { readonly ok: false; readonly error: WorkspaceTodosReadFailure }

/** Result of `todos_update`: the committed todo, or a business failure. */
export type TodosUpdateResult =
  | { readonly ok: true; readonly todo: SharedTodo; readonly created: boolean }
  | { readonly ok: false; readonly error: WorkspaceTodosToolFailure }
