/**
 * Desktop provider for the notification seam: delivers each notification as
 * a native toast through the desktop shell bridge. It fails loud at load
 * when the bridge environment is missing, so a composition row cannot
 * silently degrade to no notifications.
 * @module @deepseek-ai/dsh-notifications-desktop
 */

import type { Context } from '@deepseek-ai/cordis'
import { DesktopBridge, ENV_BRIDGE_TOKEN, ENV_BRIDGE_URL } from '@deepseek-ai/dsh-desktop-bridge'
import { NotificationService } from '@deepseek-ai/dsh-notifications'
import type { Notification } from '@deepseek-ai/dsh-notifications'

/** Plugin config: bridge connection overrides, timeout, and background suppression policy. */
export interface Config {
  /** Bridge URL override; defaults to the shell-exported environment. */
  bridgeUrl?: string
  /** Bridge token override; defaults to the shell-exported environment. */
  bridgeToken?: string
  /** Per-request timeout in milliseconds; defaults to 5000. */
  timeoutMs?: number
  /** Notification kinds the shell suppresses while any window is foreground; defaults to ['turn-completed']. */
  backgroundOnlyKinds?: string[]
}

/** Fully resolved connection parameters; defaulting happens here, never inline. */
export interface ResolvedSpec {
  url: string
  token: string
  timeoutMs: number
  backgroundOnlyKinds: string[]
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
    throw new Error('notifications-desktop requires the desktop bridge environment (DSH_DESKTOP_BRIDGE_URL and DSH_DESKTOP_BRIDGE_TOKEN); compose it only under the desktop shell')
  }
  return { url, token, timeoutMs: config.timeoutMs ?? 5000, backgroundOnlyKinds: config.backgroundOnlyKinds ?? ['turn-completed'] }
}

/** The ctx.notifications desktop-toast implementation. */
export default class DesktopNotifications extends NotificationService {
  private readonly bridge: DesktopBridge
  private readonly backgroundOnlyKinds: string[]

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const spec = resolveSpec(config)
    this.bridge = new DesktopBridge({ url: spec.url, token: spec.token, timeoutMs: spec.timeoutMs })
    this.backgroundOnlyKinds = spec.backgroundOnlyKinds
  }

  /**
   * Render one notification as a native toast through the shell.
   * @param notification - the notification to render.
   */
  notify(notification: Notification): Promise<void> {
    const backgroundOnly = this.backgroundOnlyKinds.includes(notification.kind)
    return this.bridge.toast(notification.title, notification.body, notification.sessionId, backgroundOnly)
  }
}
