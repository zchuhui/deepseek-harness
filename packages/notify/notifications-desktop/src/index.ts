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
    throw new Error('notifications-desktop requires the desktop bridge environment (DSH_DESKTOP_BRIDGE_URL and DSH_DESKTOP_BRIDGE_TOKEN); compose it only under the desktop shell')
  }
  return { url, token, timeoutMs: config.timeoutMs ?? 5000 }
}

/** The ctx.notifications desktop-toast implementation. */
export default class DesktopNotifications extends NotificationService {
  private readonly bridge: DesktopBridge

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const spec = resolveSpec(config)
    this.bridge = new DesktopBridge({ url: spec.url, token: spec.token, timeoutMs: spec.timeoutMs })
  }

  /**
   * Render one notification as a native toast through the shell.
   * @param notification - the notification to render.
   */
  notify(notification: Notification): Promise<void> {
    return this.bridge.toast(notification.title, notification.body, notification.sessionId)
  }
}
