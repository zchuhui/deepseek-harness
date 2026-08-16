/**
 * Injected face of the todos slot entry. The slot is declared and typed by
 * ui-conversation; this package only contributes the entry, so no SlotMap
 * merge lives here. The read model (`managerFor`) feeds the tab and the
 * mutation verbs (`actions`) drive every commit.
 * @module @deepseek-ai/dsh-client-ui-workspace-todos/client/slots
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { WorkspaceTodosManager } from '@deepseek-ai/dsh-workspace-todos/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'todos' seat).
import type {} from './locales.ts'
import type { WorkspaceTodosActions } from './controller.ts'
import type { WorkspaceTodosAssignments } from './assignment.ts'

/** Injected business face of the todos tab. */
export interface WorkspaceTodosInjected {
  /**
   * Per-workspace read models, created lazily on first address; creation
   * starts the baseline refresh (idempotent under concurrent callers).
   */
  managerFor: (workspaceId: WorkspaceId) => WorkspaceTodosManager
  /** Mutation verbs over the workspaceTodos Remote namespace. */
  actions: WorkspaceTodosActions
  /** Explicit assignment-intent coordinator; it prepares and sends no durable mutation itself. */
  assignments: WorkspaceTodosAssignments
}

/** Full props of the todos workbench tab pane. */
export type TodosPaneProps =
  PropsRuntime<'conversation.workbench.tab'>
  & InjectFace<WorkspaceTodosInjected>
  & PropsLocale<'todos'>
