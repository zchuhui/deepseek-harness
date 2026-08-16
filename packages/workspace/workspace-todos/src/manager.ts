/**
 * Browser-local object layer over one workspace's shared todos: a list
 * baseline refetched after every `workspace-todos/changed` push, with
 * disconnect-time staleness marking. Mutations stay on the generated Remote
 * namespace; this manager owns only the read model and its freshness.
 * @module @deepseek-ai/dsh-workspace-todos/client
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  SharedTodo,
  SharedTodosChanged,
  SharedTodosListResult,
} from './types.ts'

/**
 * The one Remote call this manager needs. The generated face wraps the
 * business result in {@link RemoteResult}: a carrier failure arrives as the
 * `ok: false` branch rather than a rejection.
 */
export interface WorkspaceTodosRemoteFace {
  list: (request: { workspaceId: WorkspaceId }) => Promise<RemoteResult<SharedTodosListResult>>
}

/** Load state of the one list read that seeds the view. */
export type WorkspaceTodosStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published to the todos workbench tab. */
export interface WorkspaceTodosView {
  status: WorkspaceTodosStatus
  /** Whether the local list predates the last connection generation. */
  stale: boolean
  /** Current committed todos in Host order (status rank, then createdAt asc, then id asc). */
  todos: readonly SharedTodo[]
  /** Reason the last load failed, cleared by the next successful load. */
  error: { code: string; message: string } | null
}

const EMPTY_TODOS: readonly SharedTodo[] = Object.freeze([])

const INITIAL_VIEW: WorkspaceTodosView = Object.freeze({
  status: 'cold',
  stale: true,
  todos: EMPTY_TODOS,
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
 * Per-workspace todos read model. One instance backs the todos workbench
 * tab; the tab mounts only after its first successful baseline.
 */
export class WorkspaceTodosManager {
  private view = INITIAL_VIEW
  private readonly listeners = new Set<() => void>()
  private inflight: Promise<void> | null = null
  /** Frames observed during an in-flight baseline; replayed once it installs. */
  private pendingInvalidations = 0
  /** Highest artifact-family revision seen on a frame; `null` before the first. */
  private lastFrameRevision: number | null = null

  /**
   * @param remote - the workspaceTodos Remote namespace.
   * @param workspaceId - workspace whose todos this manager reads.
   */
  constructor(
    private readonly remote: WorkspaceTodosRemoteFace,
    private readonly workspaceId: WorkspaceId,
  ) {}

  /** Return the cached immutable view. */
  getSnapshot = (): WorkspaceTodosView => this.view

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
   * @param change - the forwarded `workspace-todos/changed` payload.
   */
  handleChanged(change: SharedTodosChanged): void {
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
          todos: Object.freeze([...result.value.todos]),
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
      const message = error instanceof Error ? error.message : 'workspace todos list failed'
      this.publish({ ...this.view, status: 'error', error: { code: 'transport', message } })
    }
  }

  /** Replace the view and contain subscriber failures at the observable boundary. */
  private publish(view: WorkspaceTodosView): void {
    this.view = Object.freeze(view)
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[workspace-todos] subscriber threw:', error)
      }
    }
  }
}
