/**
 * Terminal provider for the notification seam: renders each notification as
 * one host console logger line, the headless default. Nothing here reaches a
 * model request or the session log.
 * @module @deepseek-ai/dsh-notifications-terminal
 */

import { NotificationService } from '@deepseek-ai/dsh-notifications'
import type { Notification } from '@deepseek-ai/dsh-notifications'

/**
 * The ctx.notifications logger-line implementation. The rendered line is
 * '[dsh] <title>: <body>'; the fixed label keeps notification lines
 * identifiable among ordinary host logs.
 */
export default class TerminalNotifications extends NotificationService {
  /**
   * Render one notification as a logger info line.
   * @param notification - the notification to render.
   */
  notify(notification: Notification): Promise<void> {
    this.ctx.logger.info('[dsh] %s: %s', notification.title, notification.body)
    return Promise.resolve()
  }
}
