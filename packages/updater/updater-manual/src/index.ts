/**
 * No-op manual provider for the update seam: it reports the configured channel
 * and installed version, treats every check as "already latest", and refuses
 * to apply any update. It exists so a composition can depend on
 * `ctx.updater` semantics without shipping a real download/install mechanism;
 * a real provider swaps in behind the same seam.
 * @module @deepseek-ai/dsh-updater-manual
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { UpdateService, updateChannel } from '@deepseek-ai/dsh-updater'
import type { UpdateChannel, UpdateState } from '@deepseek-ai/dsh-updater'

/** Plugin config: the channel and installed version the provider reports. */
export interface Config {
  /** Update channel name; defaults to `manual`. */
  channel?: string
  /** Currently installed version to report; defaults to null (not installed). */
  currentVersion?: string
}

/** Fully resolved provider parameters; defaulting happens here, never inline. */
interface ResolvedSpec {
  channel: UpdateChannel
  currentVersion: string | null
}

/**
 * Resolve the runtime spec from plugin config: an explicit `channel` wins,
 * otherwise `manual`; an explicit `currentVersion` is reported, otherwise the
 * provider reports not installed.
 * @param config - raw plugin config.
 * @returns the branded channel and the reported installed version.
 */
export function resolveSpec(config: Config): ResolvedSpec {
  return {
    channel: updateChannel(config.channel ?? 'manual'),
    currentVersion: config.currentVersion ?? null,
  }
}

/**
 * No-op manual update provider. It reports the configured channel and
 * installed version, records a check timestamp without consulting any update
 * source, and refuses to apply updates.
 */
export class ManualUpdater extends UpdateService {
  static Config: z<Config> = z.object({
    channel: z.string().default('manual'),
    currentVersion: z.string(),
  })

  private readonly spec: ResolvedSpec
  /** Epoch ms of the last completed check; undefined before the first check. */
  private checkedAt: number | undefined

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx)
    // Programmatic construction may bypass Schemastery normalization; resolve
    // the same defaults in one explicit step either way.
    this.spec = resolveSpec(config)
  }

  override state(): UpdateState {
    const snapshot: UpdateState = {
      channel: this.spec.channel,
      currentVersion: this.spec.currentVersion,
    }
    if (this.checkedAt !== undefined) {
      snapshot.checkedAt = this.checkedAt
      // A manual provider has no update source, so a completed check always
      // confirms the reported version is already the latest.
      snapshot.available = null
    }
    return snapshot
  }

  override check(_signal?: AbortSignal): Promise<UpdateState> {
    this.checkedAt = Date.now()
    return Promise.resolve(this.state())
  }

  override apply(_version: string, _signal?: AbortSignal): Promise<void> {
    return Promise.reject(new Error('manual updater cannot apply updates; compose a real updater provider'))
  }
}

export default ManualUpdater
