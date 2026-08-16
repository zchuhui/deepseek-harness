/** Workbench tab contracts: the details column's tabbed surface. */

/**
 * One workbench tab, projected from a 'conversation.workbench.tab' slot
 * entry's registration options (label falls back to the entry id) — the
 * ViewTab twin for the right column.
 */
export interface WorkbenchTab { id: string; label: string }

/**
 * Last-selected-tab memory for the workbench, keyed by workspace id as a
 * plain string key (the store persists to JSON).
 */
export interface WorkbenchState {
  /** Workspace id → tab id ('details' or a 'conversation.workbench.tab' entry id). */
  activeTab: Record<string, string>
}

/** The built-in Details tab id; also the fallback when nothing is remembered. */
export const DEFAULT_WORKBENCH_TAB_ID = 'details'

/**
 * Resolve the active workbench tab, keeping the Details fallback when nothing
 * is remembered for the workspace or the remembered entry is gone.
 * @param entries - projected external tab entries.
 * @param remembered - the workspace's remembered tab id, when any.
 * @returns the active tab id.
 */
export function resolveActiveWorkbenchTab(
  entries: readonly WorkbenchTab[],
  remembered: string | undefined,
): string {
  if (remembered === undefined) return DEFAULT_WORKBENCH_TAB_ID
  if (remembered === DEFAULT_WORKBENCH_TAB_ID) return remembered
  return entries.some(entry => entry.id === remembered) ? remembered : DEFAULT_WORKBENCH_TAB_ID
}
