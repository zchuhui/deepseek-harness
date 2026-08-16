/**
 * Workspace notes surface plugin, browser half: the notes workbench tab and
 * the save-message-as-note action over lazily-created per-workspace read
 * models. The committed `workspace-notes/changed` push frame and the two
 * connection-lifecycle broadcasts keep each addressed manager's view fresh
 * without a poll loop; mutations ride the generated Remote namespace.
 * @module @deepseek-ai/dsh-client-ui-workspace-notes/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the workbench tab and assistant-actions entries).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the layout service Context merge for the discoverable workbench transition.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { WorkspaceNotesManager } from '@deepseek-ai/dsh-workspace-notes/client'
import { WorkspaceNotesActions } from './controller.ts'
import { NotesPane } from './NotesPane.tsx'
import { MessageNoteAction } from './MessageNoteAction.tsx'
import type { WorkspaceNotesInjected } from './slots.ts'
import { en, zh } from './locales.ts'

export { NotesPane } from './NotesPane.tsx'
export { MessageNoteAction } from './MessageNoteAction.tsx'
export { WorkspaceNotesActions } from './controller.ts'
export type {
  NotesCreateOutcome, NotesDeleteOutcome, NotesTransportFailure, NotesUpdateOutcome,
} from './controller.ts'
export type {
  MessageNoteActionProps, NotesPaneProps, WorkspaceNotesInjected,
} from './slots.ts'
export type { WorkspaceNotesUiKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'notes'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'remote', 'remote.workspaceNotes', 'locale', 'layout']

/**
 * Client plugin body: the per-workspace notes read models behind the tab and
 * the save-message action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace-notes: dictionaries')

  const managers = new Map<WorkspaceId, WorkspaceNotesManager>()
  const managerFor = (workspaceId: WorkspaceId): WorkspaceNotesManager => {
    let manager = managers.get(workspaceId)
    if (manager === undefined) {
      manager = new WorkspaceNotesManager(ctx.remote.workspaceNotes, workspaceId)
      managers.set(workspaceId, manager)
      void manager.refresh()
    }
    return manager
  }
  const actions = new WorkspaceNotesActions(ctx.remote.workspaceNotes)
  const injected = (): WorkspaceNotesInjected => ({ managerFor, actions })

  ctx.effect(() => () => { managers.clear() }, 'ui-workspace-notes: manager map teardown')

  // The committed-change push: one frame per Host-side mutation (this client's
  // or another's); managers of other workspaces ignore it inside handleChanged.
  ctx.remote.$on('workspace-notes/changed', (change) => {
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
      id: 'notes',
      order: 10,
      label: () => ctx.locale.bind(NS)('tab.notes'),
      locale: NS,
      inject: injected,
    }, NotesPane)
    ctx.layout.openDetails()
    return dispose
  })

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'note',
    order: 20,
    locale: NS,
    inject: injected,
  }, MessageNoteAction))
}
