/**
 * Workspace todos surface plugin, browser half: the todos workbench tab over
 * lazily-created per-workspace read models. The committed
 * `workspace-todos/changed` push frame and the two connection-lifecycle
 * broadcasts keep each addressed manager's view fresh without a poll loop;
 * mutations ride the generated Remote namespace.
 * @module @deepseek-ai/dsh-client-ui-workspace-todos/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the workbench tab entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the layout service Context merge for the discoverable workbench transition.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { WorkspaceTodosManager } from '@deepseek-ai/dsh-workspace-todos/client'
import { WorkspaceTodosActions } from './controller.ts'
import { WorkspaceTodosAssignments } from './assignment.ts'
import { TodosPane } from './TodosPane.tsx'
import type { WorkspaceTodosInjected } from './slots.ts'
import { en, zh } from './locales.ts'

export { TodosPane } from './TodosPane.tsx'
export type { AssignableSession } from './TodosPane.tsx'
export { WorkspaceTodosActions } from './controller.ts'
export { WorkspaceTodosAssignments, assignmentText } from './assignment.ts'
export type { AssignmentIntent } from './assignment.ts'
export type {
  TodosCreateOutcome, TodosDeleteOutcome, TodosSetStatusOutcome, TodosTransportFailure,
  TodosAssignOutcome, TodosUpdateContentOutcome,
} from './controller.ts'
export type { TodosPaneProps, WorkspaceTodosInjected } from './slots.ts'
export type { WorkspaceTodosUiKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'todos'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'sessions', 'remote', 'remote.workspaceTodos', 'locale', 'layout']

/**
 * Client plugin body: the per-workspace todos read models behind the tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace-todos: dictionaries')

  const managers = new Map<WorkspaceId, WorkspaceTodosManager>()
  const managerFor = (workspaceId: WorkspaceId): WorkspaceTodosManager => {
    let manager = managers.get(workspaceId)
    if (manager === undefined) {
      manager = new WorkspaceTodosManager(ctx.remote.workspaceTodos, workspaceId)
      managers.set(workspaceId, manager)
      void manager.refresh()
    }
    return manager
  }
  const actions = new WorkspaceTodosActions(ctx.remote.workspaceTodos)
  const assignments = new WorkspaceTodosAssignments(ctx.sessions)
  const injected = (): WorkspaceTodosInjected => ({ managerFor, actions, assignments })

  ctx.effect(() => () => { managers.clear() }, 'ui-workspace-todos: manager map teardown')

  // The committed-change push: one frame per Host-side mutation (this client's
  // or another's); managers of other workspaces ignore it inside handleChanged.
  ctx.remote.$on('workspace-todos/changed', (change) => {
    managers.get(change.workspaceId)?.handleChanged(change)
  })
  // Connection lifecycle: mark every live manager stale when the generation
  // dies, repull each baseline once the next establishes. A never-addressed
  // manager does not exist yet; its first address starts the baseline itself.
  ctx.on('connection/reconnecting', () => {
    for (const manager of managers.values()) manager.handleDisconnected()
  })
  ctx.on('connection/reset', () => {
    for (const manager of managers.values()) manager.handleConnected()
  })

  ctx.slots.inject('conversation.workbench.tab', () => {
    const dispose = ctx.slots.register({
      name: 'conversation.workbench.tab',
      id: 'todos',
      order: 20,
      label: () => ctx.locale.bind(NS)('tab.todos'),
      locale: NS,
      inject: injected,
    }, TodosPane)
    ctx.layout.openDetails()
    return dispose
  })
}
