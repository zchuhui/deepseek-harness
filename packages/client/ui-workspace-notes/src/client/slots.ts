/**
 * Injected faces of the two notes slot entries. Both slots are declared and
 * typed by ui-conversation; this package only contributes entries, so no
 * SlotMap merge lives here. The same face serves both: the read model
 * (`managerFor`) feeds the tab, the mutation verbs (`actions`) feed the tab
 * and the save-message action alike.
 * @module @deepseek-ai/dsh-client-ui-workspace-notes/client/slots
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { WorkspaceNotesManager } from '@deepseek-ai/dsh-workspace-notes/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'notes' seat).
import type {} from './locales.ts'
import type { WorkspaceNotesActions } from './controller.ts'

/** Injected business face of the notes tab and the save-message action. */
export interface WorkspaceNotesInjected {
  /**
   * Per-workspace read models, created lazily on first address; creation
   * starts the baseline refresh (idempotent under concurrent callers).
   */
  managerFor: (workspaceId: WorkspaceId) => WorkspaceNotesManager
  /** Mutation verbs over the workspaceNotes Remote namespace. */
  actions: WorkspaceNotesActions
}

/** Full props of the notes workbench tab pane. */
export type NotesPaneProps =
  PropsRuntime<'conversation.workbench.tab'>
  & InjectFace<WorkspaceNotesInjected>
  & PropsLocale<'notes'>

/** Full props of the save-message-as-note assistant action. */
export type MessageNoteActionProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & InjectFace<WorkspaceNotesInjected>
  & PropsLocale<'notes'>
