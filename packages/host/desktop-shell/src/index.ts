/**
 * Desktop-shell bridge provider for the desktop-host seam: implements
 * `ctx.desktopHost` by forwarding window reporting and settings read/write to
 * the desktop shell bridge. It fails loud at load when the bridge environment
 * is missing, so a composition row cannot silently degrade to no host control.
 * @module @deepseek-ai/dsh-host-desktop-shell
 */

import type { Context } from '@deepseek-ai/cordis'
import { DesktopBridge, ENV_BRIDGE_TOKEN, ENV_BRIDGE_URL } from '@deepseek-ai/dsh-desktop-bridge'
import { DesktopHost } from '@deepseek-ai/dsh-host-desktop'
import type { DesktopSettingsDoc } from '@deepseek-ai/dsh-host-desktop'

/** Plugin config: bridge connection overrides and timeout. */
export interface Config {
  /** Bridge URL override; defaults to the shell-exported environment. */
  bridgeUrl?: string
  /** Bridge token override; defaults to the shell-exported environment. */
  bridgeToken?: string
  /** Per-request timeout in milliseconds; defaults to 5000. */
  timeoutMs?: number
}

/** Fully resolved connection parameters; defaulting happens here, never inline. */
export interface ResolvedSpec {
  url: string
  token: string
  timeoutMs: number
}

/**
 * Resolve the connection spec from plugin config and the process
 * environment. Missing bridge facts throw at load: the provider cannot
 * deliver anything without the shell.
 * @param config - raw plugin config.
 * @param env - process environment; tests inject a stub.
 * @returns the resolved bridge connection.
 */
export function resolveSpec(config: Config, env: NodeJS.ProcessEnv = process.env): ResolvedSpec {
  const url = config.bridgeUrl ?? env[ENV_BRIDGE_URL]
  const token = config.bridgeToken ?? env[ENV_BRIDGE_TOKEN]
  if (url === undefined || url === '' || token === undefined || token === '') {
    throw new Error('desktop-shell requires the desktop bridge environment (DSH_DESKTOP_BRIDGE_URL and DSH_DESKTOP_BRIDGE_TOKEN); compose it only under the desktop shell')
  }
  return { url, token, timeoutMs: config.timeoutMs ?? 5000 }
}

/** The `ctx.desktopHost` shell-bridge implementation. */
export default class DesktopShellHost extends DesktopHost {
  private readonly bridge: DesktopBridge

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const spec = resolveSpec(config)
    this.bridge = new DesktopBridge({ url: spec.url, token: spec.token, timeoutMs: spec.timeoutMs })
  }

  reportWindow(label: string, sessionId: string | null): Promise<void> {
    return this.bridge.assignWindow(label, sessionId)
  }

  getSettings(): Promise<DesktopSettingsDoc> {
    return this.bridge.getSettings()
  }

  setSettings(partial: Partial<DesktopSettingsDoc>): Promise<DesktopSettingsDoc> {
    return this.bridge.setSettings(partial)
  }
}
