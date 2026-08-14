/**
 * Type surface of the update capability seam: the channel brand and the
 * update-state snapshot. Types only — no runtime code, so a Client compilation
 * face reads exactly the signature the Host emits.
 * @module @deepseek-ai/dsh-updater/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Nominal update-channel name, branded so it cannot be confused with other channel-shaped ids. */
export type UpdateChannel = Branded<'UpdateChannel'>

/**
 * Synchronous snapshot of one channel's update state, computed from the
 * provider's last observed facts without triggering any network work.
 */
export interface UpdateState {
  /** The channel this snapshot describes. */
  channel: UpdateChannel
  /** Currently installed version, or `null` when nothing is installed. */
  currentVersion: string | null
  /** Epoch ms of the last completed check; absent before the first check. */
  checkedAt?: number
  /**
   * The offered update: `null` when a check confirmed the installed version is
   * already the latest, and absent before any check has run.
   */
  available?: { version: string; publishedAt: number } | null
  /** The last check failure and when it happened; absent while no check has failed. */
  lastFailure?: { message: string; at: number }
}
