/**
 * Browser-local object layer over one workspace's notes: a list baseline
 * refetched after every `workspace-notes/changed` push, with disconnect-time
 * staleness marking. Mutations stay on the generated Remote namespace; this
 * manager owns only the read model and its freshness.
 * @module @deepseek-ai/dsh-workspace-notes/client
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  WorkspaceNote,
  WorkspaceNotesChanged,
  WorkspaceNotesListResult,
} from './types.ts'

/**
 * The one Remote call this manager needs. The generated face wraps the
 * business result in {@link RemoteResult}: a carrier failure arrives as the
 * `ok: false` branch rather than a rejection.
 */
export interface WorkspaceNotesRemoteFace {
  list: (request: { workspaceId: WorkspaceId }) => Promise<RemoteResult<WorkspaceNotesListResult>>
}

/** Load state of the one list read that seeds the view. */
export type WorkspaceNotesStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published to the notes workbench tab. */
export interface WorkspaceNotesView {
  status: WorkspaceNotesStatus
  /** Whether the local list predates the last connection generation. */
  stale: boolean
  /** Current committed notes in Host order (`updatedAt` desc, id asc). */
  notes: readonly WorkspaceNote[]
  /** Reason the last load failed, cleared by the next successful load. */
  error: { code: string; message: string } | null
}

const EMPTY_NOTES: readonly WorkspaceNote[] = Object.freeze([])

const INITIAL_VIEW: WorkspaceNotesView = Object.freeze({
  status: 'cold',
  stale: true,
  notes: EMPTY_NOTES,
  error: null,
})

/** Human-readable text for one business failure code. */
function describe(code: string): string {
  switch (code) {
    case 'unknown-workspace': return 'this workspace is no longer registered'
    default: return code
  }
}

/**
 * Per-workspace notes read model. One instance backs the notes workbench tab;
 * the tab mounts only after its first successful baseline.
 */
export class WorkspaceNotesManager {
  private view = INITIAL_VIEW
  private readonly listeners = new Set<() => void>()
  private inflight: Promise<void> | null = null
  /** Frames observed during an in-flight baseline; replayed once it installs. */
  private pendingInvalidations = 0
  /** Highest artifact-family revision seen on a frame; `null` before the first. */
  private lastFrameRevision: number | null = null

  /**
   * @param remote - the workspaceNotes Remote namespace.
   * @param workspaceId - workspace whose notes this manager reads.
   */
  constructor(
    private readonly remote: WorkspaceNotesRemoteFace,
    private readonly workspaceId: WorkspaceId,
  ) {}

  /** Return the cached immutable view. */
  getSnapshot = (): WorkspaceNotesView => this.view

  /** Subscribe to view replacement. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Fetch the baseline list, collapsing concurrent callers onto one in-flight
   * read and replaying frames that landed while it was pending.
   * @returns resolution after the installed read settles.
   */
  refresh(): Promise<void> {
    if (this.inflight !== null) return this.inflight
    const run = async (): Promise<void> => {
      do {
        this.pendingInvalidations = 0
        this.publish({ ...this.view, status: 'loading', error: null })
        await this.loadOnce()
      } while (this.pendingInvalidations > 0)
    }
    const pending = run()
    this.inflight = pending
    return pending.finally(() => { this.inflight = null })
  }

  /** Re-pull the baseline after each connection generation. */
  handleConnected(): void {
    void this.refresh()
  }

  /** Mark the local list stale until the next baseline arrives. */
  handleDisconnected(): void {
    if (!this.view.stale) this.publish({ ...this.view, stale: true })
  }

  /**
   * Push-frame entry. Frames of other workspaces and out-of-order revisions
   * are ignored; a fresh frame during an in-flight baseline is replayed over
   * that baseline instead of being lost.
   * @param change - the forwarded `workspace-notes/changed` payload.
   */
  handleChanged(change: WorkspaceNotesChanged): void {
    if (change.workspaceId !== this.workspaceId) return
    if (this.lastFrameRevision !== null && change.revision <= this.lastFrameRevision) return
    this.lastFrameRevision = change.revision
    if (this.inflight !== null) {
      this.pendingInvalidations++
      return
    }
    void this.refresh()
  }

  /** Fetch the whole view once and publish the settled outcome. */
  private async loadOnce(): Promise<void> {
    try {
      const carried = await this.remote.list({ workspaceId: this.workspaceId })
      if (!carried.ok) {
        this.publish({
          ...this.view,
          status: 'error',
          error: { code: carried.error.code, message: carried.error.message },
        })
        return
      }
      const result = carried.value
      if (result.ok) {
        this.publish({
          status: 'ready',
          stale: false,
          notes: Object.freeze([...result.value.notes]),
          error: null,
        })
      } else {
        this.publish({
          ...this.view,
          status: 'error',
          error: { code: result.error.code, message: describe(result.error.code) },
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'workspace notes list failed'
      this.publish({ ...this.view, status: 'error', error: { code: 'transport', message } })
    }
  }

  /** Replace the view and contain subscriber failures at the observable boundary. */
  private publish(view: WorkspaceNotesView): void {
    this.view = Object.freeze(view)
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[workspace-notes] subscriber threw:', error)
      }
    }
  }
}
