/**
 * Workbench host of the details column: joins the built-in Details pane with
 * the root-scoped 'conversation.workbench.tab' entries into one tab strip.
 * The strip stays hidden at one tab (the view-ring rule), so a no-contributor
 * assembly renders the Details pane exactly as before. The host remembers
 * each workspace's last tab and claims the Details tab whenever a tool call
 * is selected through the shared chat store.
 */

import { useEffect, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { WorkbenchSlotProps } from '../contract/slots.ts'
import { DEFAULT_WORKBENCH_TAB_ID, resolveActiveWorkbenchTab } from '../contract/workbench.ts'
import { DetailsPanel } from './DetailsPanel.tsx'
import css from './Workbench.module.css'

/** Full props composed by reference from the contract (automatic shares & injected share). */
export type WorkbenchProps = WorkbenchSlotProps

/**
 * Renders the workbench strip and the active pane.
 * @param props - Details shares plus the tab ledger, workspace memory, and locale.
 * @returns the strip (when more than one tab) and the active pane.
 */
export function Workbench(props: WorkbenchProps) {
  const {
    sessionId, useWorkspaces, useStore, renderSlot, tabs, useWorkbench, selectTab, openDetails, t,
  } = props
  const tabVersion = useSyncExternalStore(tabs.subscribe, tabs.version)
  const entries = tabs.list()
  // Root-scope tab memory: resolve this session's workspace from the global
  // list (the session summary carries no workspace id of its own).
  const workspaceId = useWorkspaces(
    list => list.items.find(item => item.sessionIds.includes(sessionId))?.workspaceId,
  )
  const remembered = useWorkbench(s => (workspaceId === undefined ? undefined : s.activeTab[workspaceId]))
  const active = resolveActiveWorkbenchTab(entries, remembered)
  const selection = useStore(s => s.selection)
  // A tool-call selection claims the Details tab: the details linkage
  // channel's only writer is the inspect flow, so any new selection means
  // the user asked for the Details pane.
  useEffect(() => {
    if (selection !== null) selectTab(workspaceId, DEFAULT_WORKBENCH_TAB_ID)
  }, [selectTab, selection, workspaceId])
  // A session switch closes the details column to avoid carrying a selected
  // tool call into the next session. When optional workbench tabs exist, make
  // the current session's workbench available again after that layout effect.
  // The tab version keeps a user-closed panel closed until a new tab arrives
  // or the user changes sessions.
  useEffect(() => {
    if (entries.length > 0) openDetails()
  }, [openDetails, sessionId, tabVersion])

  const strip = [{ id: DEFAULT_WORKBENCH_TAB_ID, label: t('workbench.details') }, ...entries]
  return (
    <div className={css.root}>
      {strip.length > 1 && (
        <div className={css.tabs} role="tablist">
          {strip.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === active}
              className={clsx(css.tab, tab.id === active && css.tabActive)}
              onClick={() => { selectTab(workspaceId, tab.id) }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {active === DEFAULT_WORKBENCH_TAB_ID
        ? <DetailsPanel {...props} />
        : renderSlot('conversation.workbench.tab', {
          workspaceId,
          activeTabId: active,
          selectTab: (tabId: string) => { selectTab(workspaceId, tabId) },
        }, { only: active })}
    </div>
  )
}
