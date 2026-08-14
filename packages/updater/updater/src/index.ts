/**
 * Service Definition for the update capability seam (`ctx.updater`). It owns
 * the contract for named update channels, the synchronous update-state
 * snapshot, and the check/apply operations; a provider supplies the actual
 * update source and application mechanism. The no-op provider lives in
 * `@deepseek-ai/dsh-updater-manual`.
 * @module @deepseek-ai/dsh-updater
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { UpdateChannel, UpdateState } from './types.ts'

export type { UpdateChannel, UpdateState } from './types.ts'

const CHANNEL_WHITESPACE = /\s/

/**
 * Brand a raw string as an {@link UpdateChannel}.
 * @param value - candidate channel name; must be non-empty, a single line, and free of whitespace.
 * @returns the branded channel.
 */
export function updateChannel(value: string): UpdateChannel {
  if (value.length === 0) throw new TypeError('update channel must be non-empty')
  if (value.includes('\n') || value.includes('\r')) {
    throw new TypeError(`update channel ${JSON.stringify(value)} must be a single line`)
  }
  if (CHANNEL_WHITESPACE.test(value)) {
    throw new TypeError(`update channel ${JSON.stringify(value)} must not contain whitespace`)
  }
  return value as UpdateChannel
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    updater: UpdateService
  }
}

/**
 * Abstract update service. Subclass, implement the three operations, and load
 * the subclass as a plugin — it registers as `ctx.updater` (one implementation
 * per context; loading a second throws, which is cordis' standard
 * duplicate-service behavior).
 */
export abstract class UpdateService extends Service {
  constructor(ctx: Context) {
    // `abstract` erases at runtime, so a composition row naming this package
    // would register a ctx.updater with no method implementations and fail far
    // from the misconfiguration. Fail loud at load instead.
    if (new.target === UpdateService) {
      throw new Error('@deepseek-ai/dsh-updater is the abstract update seam; load an implementation such as @deepseek-ai/dsh-updater-manual instead')
    }
    super(ctx, 'updater')
  }

  /**
   * Synchronous snapshot of the channel's last observed update state. It never
   * triggers a check or any network work.
   * @returns the current snapshot.
   */
  abstract state(): UpdateState

  /**
   * Explicitly trigger one update check. A provider may perform network work
   * here; the no-op provider only advances the check timestamp.
   * @param signal - optional cancellation of the check.
   * @returns the post-check snapshot.
   */
  abstract check(signal?: AbortSignal): Promise<UpdateState>

  /**
   * Apply one offered update to the named version.
   * @param version - the version to apply.
   * @param signal - optional cancellation of the apply.
   */
  abstract apply(version: string, signal?: AbortSignal): Promise<void>
}

export default UpdateService
