/**
 * Service Definition for the operator-notification capability seam
 * (ctx.notifications). A consumer — the event bridge — raises one
 * {@link Notification} per observed event, and a provider renders it on the
 * operator's channel (terminal line, native toast). The seam carries no
 * trigger policy: bridges decide what raises, providers decide how it is
 * delivered, and both are replaceable from configuration.
 * @module @deepseek-ai/dsh-notifications
 */

import { Context, Service } from '@deepseek-ai/cordis'

import type { Notification } from './types.ts'

export type { Notification, NotificationKind, NotificationKindMap } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    notifications: NotificationService
  }
}

/**
 * Abstract notification service. Subclass, implement {@link notify}, and load
 * the subclass as a plugin — it registers as ctx.notifications (one
 * implementation per context; loading a second throws, which is cordis'
 * standard duplicate-service behavior).
 *
 * {@link notify} rejects on delivery failure (unsupported platform, spawn
 * error); the seam defines no fallback, and consumers own failure containment
 * so a broken notification can never break the event dispatch that raised it.
 */
export abstract class NotificationService extends Service {
  constructor(ctx: Context) {
    // `abstract` erases at runtime, so a composition row naming this package
    // would register a ctx.notifications with no method implementations and
    // fail far from the misconfiguration. Fail loud at load instead.
    if (new.target === NotificationService) {
      throw new Error('@deepseek-ai/dsh-notifications is the abstract notification seam; load an implementation such as @deepseek-ai/dsh-notifications-terminal instead')
    }
    super(ctx, 'notifications')
  }

  /**
   * Deliver one notification on the provider's channel.
   * @param notification - the consumer-built notification to render.
   */
  abstract notify(notification: Notification): Promise<void>
}

export default NotificationService
