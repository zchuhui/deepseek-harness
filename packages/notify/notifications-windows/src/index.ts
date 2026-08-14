/**
 * Windows toast provider for the notification seam: renders each notification
 * as a native toast through Windows PowerShell 5.1 WinRT interop, spawned
 * without a shell through dsh-native-command.
 * @module @deepseek-ai/dsh-notifications-windows
 */

import type { Context } from '@deepseek-ai/cordis'
import { NotificationService } from '@deepseek-ai/dsh-notifications'
import type { Notification } from '@deepseek-ai/dsh-notifications'
import { runNativeCommand } from '@deepseek-ai/dsh-native-command'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { buildToastScript, DEFAULT_APP_ID, encodePowerShellCommand } from './toast.ts'

export { buildToastScript, DEFAULT_APP_ID, encodePowerShellCommand, escapePowerShellLiteral } from './toast.ts'

/** Plugin config: toast identity and launcher executable. */
export interface Config {
  /** AppUserModelID toasts show under; defaults to Windows PowerShell's own. */
  appId?: string
  /** PowerShell executable name; defaults to 'powershell.exe'. */
  powershell?: string
}

/** Fully resolved delivery parameters; defaulting happens here, never inline. */
export interface ResolvedSpec {
  appId: string
  powershell: string
}

/**
 * Resolve the delivery spec from plugin config.
 * @param config - raw plugin config.
 * @returns the resolved AppUserModelID and executable name.
 */
export function resolveSpec(config: Config): ResolvedSpec {
  return {
    appId: config.appId ?? DEFAULT_APP_ID,
    powershell: config.powershell ?? 'powershell.exe',
  }
}

/**
 * Deliver one notification as a toast through an injected command runner.
 * @param runner - the no-shell command boundary.
 * @param spec - resolved delivery parameters.
 * @param notification - the notification to render.
 * @param platform - the host platform; tests inject a non-win32 value.
 * @param signal - delivery lifetime; the seam has no cancellation surface, so the default is never aborted.
 * @throws on non-win32 platforms and on runner failure.
 */
export async function notifyWindows(
  runner: NativeCommandRunner,
  spec: ResolvedSpec,
  notification: Notification,
  platform: string = process.platform,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  if (platform !== 'win32') {
    throw new Error('notifications-windows renders only on win32; compose @deepseek-ai/dsh-notifications-terminal on this platform')
  }
  const script = buildToastScript(notification.title, notification.body, spec.appId)
  await runner(spec.powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(script)], signal)
}

/** The ctx.notifications Windows toast implementation. */
export default class WindowsNotifications extends NotificationService {
  private readonly spec: ResolvedSpec

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.spec = resolveSpec(config)
  }

  /**
   * Render one notification as a native toast.
   * @param notification - the notification to render.
   */
  /* v8 ignore next -- pure forward to notifyWindows (its spec owns behavior); invoking here shows a real toast. */
  notify(notification: Notification): Promise<void> {
    return notifyWindows(runNativeCommand, this.spec, notification)
  }
}
