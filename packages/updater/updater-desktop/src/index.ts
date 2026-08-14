/**
 * Desktop provider for the update seam: state() returns the last known
 * snapshot (a cached object replaced, never mutated, by each check),
 * check() fetches the shell's state, and apply() forwards to the shell,
 * which answers 501 until the release milestone implements it. Fails loud
 * at load when the bridge environment is missing.
 * @module @deepseek-ai/dsh-updater-desktop
 */

import type { Context } from '@deepseek-ai/cordis'
import { DesktopBridge, ENV_BRIDGE_TOKEN, ENV_BRIDGE_URL } from '@deepseek-ai/dsh-desktop-bridge'
import { UpdateService, updateChannel } from '@deepseek-ai/dsh-updater'
import type { UpdateChannel, UpdateState } from '@deepseek-ai/dsh-updater'

/** Plugin config: bridge connection overrides, timeout, and the initial reported channel. */
export interface Config {
  /** Bridge URL override; defaults to the shell-exported environment. */
  bridgeUrl?: string
  /** Bridge token override; defaults to the shell-exported environment. */
  bridgeToken?: string
  /** Per-request timeout in milliseconds; defaults to 5000. */
  timeoutMs?: number
  /** Channel reported before the first check; defaults to 'manual'. */
  channel?: string
}

/** Fully resolved provider parameters; defaulting happens here, never inline. */
export interface ResolvedSpec {
  url: string
  token: string
  timeoutMs: number
  channel: UpdateChannel
}

/**
 * Resolve the provider spec from plugin config and the process environment.
 * Missing bridge facts and invalid channels throw at load.
 * @param config - raw plugin config.
 * @param env - process environment; tests inject a stub.
 * @returns the resolved bridge connection and initial channel.
 */
export function resolveSpec(config: Config, env: NodeJS.ProcessEnv = process.env): ResolvedSpec {
  const url = config.bridgeUrl ?? env[ENV_BRIDGE_URL]
  const token = config.bridgeToken ?? env[ENV_BRIDGE_TOKEN]
  if (url === undefined || url === '' || token === undefined || token === '') {
    throw new Error('updater-desktop requires the desktop bridge environment (DSH_DESKTOP_BRIDGE_URL and DSH_DESKTOP_BRIDGE_TOKEN); compose it only under the desktop shell')
  }
  return { url, token, timeoutMs: config.timeoutMs ?? 5000, channel: updateChannel(config.channel ?? 'manual') }
}

/** The ctx.updater desktop-bridge implementation. */
export default class DesktopUpdater extends UpdateService {
  private readonly bridge: DesktopBridge
  /** Last known snapshot; replaced wholesale by each check, never mutated. */
  private cached: UpdateState

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const spec = resolveSpec(config)
    this.bridge = new DesktopBridge({ url: spec.url, token: spec.token, timeoutMs: spec.timeoutMs })
    this.cached = { channel: spec.channel, currentVersion: null }
  }

  override state(): UpdateState {
    return this.cached
  }

  /**
   * Fetch the shell's update state and replace the cached snapshot.
   * @param signal - optional cancellation of the fetch.
   * @returns the post-check snapshot.
   */
  override async check(signal?: AbortSignal): Promise<UpdateState> {
    const wire = await this.bridge.updateState(signal)
    const state: UpdateState = { channel: updateChannel(wire.channel), currentVersion: wire.currentVersion }
    if (wire.checkedAt !== null) state.checkedAt = wire.checkedAt
    state.available = wire.available
    if (wire.lastFailure !== null) state.lastFailure = { message: wire.lastFailure.message, at: wire.lastFailure.at }
    this.cached = state
    return state
  }

  /**
   * Forward an apply request to the shell; the skeleton answers 501.
   * @param version - the version to apply.
   * @param signal - optional cancellation of the request.
   */
  override async apply(version: string, signal?: AbortSignal): Promise<void> {
    await this.bridge.updateApply(version, signal)
  }
}
