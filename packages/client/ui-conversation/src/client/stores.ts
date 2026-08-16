/**
 * Per-session chat store shared by conversation and details registrations.
 * The plugin creates its handle at apply time so identity follows the fiber.
 */
import { createSnapshotStore, defineStore, type EngineStoreHandle, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { CallId, ChatStoreState, SelectionTarget } from './contract/views.ts'
import type { WorkbenchState } from './contract/workbench.ts'

/** Declared action shape used to give the exported factory a stable return type. */
type ChatActions = {
  select: (draft: ChatStoreState, target: SelectionTarget | null) => void
  setDraft: (draft: ChatStoreState, text: string) => void
  setView: (draft: ChatStoreState, view: string) => void
  setInspect: (draft: ChatStoreState, target: { callId: CallId } | null) => void
}

/**
 * Declares the per-session chat state and write surface.
 * @returns the store handle.
 */
export function createChatStore(): EngineStoreHandle<ChatStoreState, ChatActions> {
  return defineStore({
    // Anchored to the contract shape: consumers read the store through
    // PropsStore<ChatStore>'s SnapshotSelectorHook<ChatStoreState>, so init
    // and the contract cannot drift.
    init: (): ChatStoreState => ({ selection: null, draft: '', view: null, inspect: null }),
    persist: 'dsh.conversation.chat',
    actions: {
      select: (d, target: SelectionTarget | null) => { d.selection = target },
      setDraft: (d, text: string) => { d.draft = text },
      setView: (d, view: string) => { d.view = view },
      setInspect: (d, target: { callId: CallId } | null) => { d.inspect = target },
    },
  })
}

/**
 * Root-lifetime workbench tab memory (per-workspace last selection), created
 * once in apply and consumed as a bare observable through the workbench
 * host's inject hooks compartment — writes go through the injected callback,
 * never the engine face.
 * @returns the workbench memory store.
 */
export function createWorkbenchStore(): SnapshotStore<WorkbenchState> {
  return createSnapshotStore<WorkbenchState>(
    { activeTab: {} },
    { persist: { name: 'dsh.conversation.workbench' } },
  )
}
