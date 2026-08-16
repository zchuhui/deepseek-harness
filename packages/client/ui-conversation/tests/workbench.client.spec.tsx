// @vitest-environment jsdom
// Workbench host behavior: the details column's tab owner joins the built-in
// Details pane with 'conversation.workbench.tab' entries — no contributors
// renders the Details pane exactly as before (one tab, no strip per the
// view-ring rule), one contributor shows the strip, the per-workspace
// selection persists, a stale memory falls back to Details, and a tool-call
// selection claims the Details tab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import {
  createSnapshotStore, EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ConversationSnapshot, SessionId, SessionListState, WorkspaceId, WorkspaceListState, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { createChatStore, createWorkbenchStore } from '../src/client/stores.ts'
import {
  DEFAULT_WORKBENCH_TAB_ID, resolveActiveWorkbenchTab, type WorkbenchTab,
} from '../src/client/contract/workbench.ts'
import type { WorkbenchTabOwnerProps } from '../src/client/contract/slots.ts'
import type { SelectionTarget } from '../src/client/contract/views.ts'
import { Workbench } from '../src/client/skeleton/Workbench.tsx'
import type { WorkbenchProps } from '../src/client/skeleton/Workbench.tsx'
import { zh } from '../src/client/locales.ts'

// Mirrors the real lookup chain (conversation namespace, then common).
const t: WorkbenchProps['t'] = makeTranslate(zh, commonZh)

const SID = 's1' as SessionId
const WID = 'w1' as WorkspaceId

/** Minimal framework seat for direct Workbench host tests. */
const SessionProviderStub: SessionProviderComponent = ({ children }) => children(SID)

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

describe('resolveActiveWorkbenchTab', () => {
  const ENTRIES: readonly WorkbenchTab[] = [{ id: 'notes', label: '笔记' }]

  it('defaults to Details when nothing is remembered', () => {
    expect(resolveActiveWorkbenchTab(ENTRIES, undefined)).toBe(DEFAULT_WORKBENCH_TAB_ID)
  })

  it('keeps a remembered Details selection', () => {
    expect(resolveActiveWorkbenchTab(ENTRIES, DEFAULT_WORKBENCH_TAB_ID)).toBe(DEFAULT_WORKBENCH_TAB_ID)
  })

  it('keeps a remembered live entry', () => {
    expect(resolveActiveWorkbenchTab(ENTRIES, 'notes')).toBe('notes')
  })

  it('falls back to Details when the remembered entry is gone', () => {
    expect(resolveActiveWorkbenchTab(ENTRIES, 'removed-plugin')).toBe(DEFAULT_WORKBENCH_TAB_ID)
  })
})

function snapshotBase(): ConversationSnapshot {
  return {
    sessionId: SID, views: EMPTY_CONVERSATION_VIEWS, chat: EMPTY_CHAT_SNAPSHOT,
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
    pending: [], queue: [], running: false, composerPhase: 'active', removed: false, openState: 'open', openError: null,
    hasMore: false, loadingOlder: false, promptError: null, blank: false, subagent: null, lastAgentError: null,
  }
}

/** Records workbench-tab owner currency; the details tool seat renders a marker. */
function renderSlotProbe(owners: WorkbenchTabOwnerProps[]): WorkbenchProps['renderSlot'] {
  return ((key: string, owner: unknown, opts?: { only?: string }) => {
    if (key === 'conversation.workbench.tab') {
      owners.push(owner as WorkbenchTabOwnerProps)
      return <div data-testid="external-pane" data-only={opts?.only ?? ''} />
    }
    return <div data-testid="tool-details-seat" />
  }) as WorkbenchProps['renderSlot']
}

interface MountOptions {
  /** External tab entries (registration order). */
  tabs?: readonly WorkbenchTab[]
  /** Pre-seeded workspace memory. */
  remembered?: Record<string, string>
}

/** Direct-mount harness binding the real chat + workbench stores (apply-mirrored selectTab). */
function mountWorkbench({ tabs = [], remembered = {} }: MountOptions = {}) {
  const chat = createChatStore().create()
  const workbenchStore = createWorkbenchStore()
  workbenchStore.update((draft) => { draft.activeTab = { ...remembered } })
  const selectTab = (workspaceId: WorkspaceId | undefined, tabId: string): void => {
    workbenchStore.update((draft) => {
      if (workspaceId !== undefined) draft.activeTab[workspaceId] = tabId
    })
  }
  const openDetails = vi.fn()
  const version = 0
  const ledger = {
    list: (): readonly WorkbenchTab[] => tabs,
    subscribe: () => () => {},
    version: () => version,
  }
  const owners: WorkbenchTabOwnerProps[] = []
  const sessions = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: SID, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  const workspaces = createSnapshotStore<WorkspaceListState>({
    items: [{
      workspaceId: WID, path: '/projects/one', title: 'one', sessionIds: [SID],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    } satisfies WorkspaceView],
    archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  const view = render(
    <Workbench
      SessionProvider={SessionProviderStub}
      renderSlot={renderSlotProbe(owners)}
      sessionId={SID}
      useSession={bindSnapshotSelector({ getSnapshot: () => snapshotBase(), subscribe: () => () => {} })}
      useSessions={bindSnapshotSelector(sessions)}
      useWorkspaces={bindSnapshotSelector(workspaces)}
      useProjection={(() => undefined)}
      useInput={(() => { throw new Error('unused') })}
      inputActions={{
        setDraft: () => {},
        addImages: () => true,
        removeImage: () => {},
        pruneImages: () => {},
        submit: () => {},
      }}
      useStore={bindSnapshotSelector(chat)}
      actions={chat.actions}
      openDetails={openDetails}
      closeDetails={vi.fn()}
      tabs={ledger}
      useWorkbench={bindSnapshotSelector(workbenchStore)}
      selectTab={selectTab}
      t={t}
    />,
  )
  return { view, owners, chat, workbenchStore, selectTab, ledger, openDetails }
}

describe('Workbench host', () => {
  it('renders the Details pane with no strip when no plugin contributes a tab', () => {
    const { view } = mountWorkbench()
    // View-ring rule: one tab, no strip — the pre-workbench Details render.
    expect(view.container.querySelector('[role="tablist"]')).toBeNull()
    expect(view.getByText('详情')).toBeTruthy()
    expect(view.getByText('点击消息流中的工具行查看详情')).toBeTruthy()
  })

  it('joins one contributor into a strip, switches panes, and remembers the workspace selection', () => {
    const { view, owners, workbenchStore, openDetails } = mountWorkbench({ tabs: [{ id: 'notes', label: '笔记' }] })
    const strip = view.container.querySelector('[role="tablist"]')
    expect(strip).not.toBeNull()
    const tabs = view.container.querySelectorAll('[role="tab"]')
    expect(Array.from(tabs).map(tab => tab.textContent)).toEqual(['详情', '笔记'])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(owners).toHaveLength(0)
    expect(openDetails).toHaveBeenCalledTimes(1)

    act(() => { fireEvent.click(view.getByText('笔记')) })
    expect(view.getByTestId('external-pane').getAttribute('data-only')).toBe('notes')
    expect(owners.at(-1)).toMatchObject({ workspaceId: WID, activeTabId: 'notes' })
    expect(workbenchStore.getSnapshot().activeTab[WID]).toBe('notes')

    act(() => { fireEvent.click(view.getByText('详情')) })
    expect(view.container.querySelector('[data-testid="external-pane"]')).toBeNull()
    expect(view.getByText('点击消息流中的工具行查看详情')).toBeTruthy()
    expect(workbenchStore.getSnapshot().activeTab[WID]).toBe('details')
  })

  it('falls back to the Details pane when the remembered tab entry is gone', () => {
    const { view } = mountWorkbench({
      tabs: [{ id: 'notes', label: '笔记' }],
      remembered: { [WID]: 'removed-plugin' },
    })
    const tabs = view.container.querySelectorAll('[role="tab"]')
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(view.getByText('点击消息流中的工具行查看详情')).toBeTruthy()
  })

  it('claims the Details tab when a tool call is selected through the shared chat store', () => {
    const { view, chat, workbenchStore } = mountWorkbench({
      tabs: [{ id: 'notes', label: '笔记' }],
      remembered: { [WID]: 'notes' },
    })
    expect(view.getByTestId('external-pane')).toBeTruthy()

    act(() => {
      chat.actions.select({ turnSeq: 1, callId: 'call-1' } satisfies SelectionTarget)
    })
    expect(workbenchStore.getSnapshot().activeTab[WID]).toBe('details')
    // The selected call is outside the fixture window — the Details pane's
    // selection-state empty copy proves the pane switched in.
    expect(view.getByText('该调用不在当前窗口内')).toBeTruthy()
  })
})
