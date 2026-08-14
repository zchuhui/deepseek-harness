import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { NotificationService } from '../src/index.ts'
import type { Notification } from '../src/index.ts'

/** Minimal concrete provider: records deliveries. The seam owns the contract only. */
class StubNotifications extends NotificationService {
  delivered: Notification[] = []

  async notify(notification: Notification): Promise<void> {
    this.delivered.push(notification)
  }
}

describe('NotificationService seam', () => {
  it('a concrete subclass registers as ctx.notifications and serves notify', async () => {
    const ctx = new Context()
    await ctx.plugin(StubNotifications)
    expect(ctx.notifications).toBeInstanceOf(StubNotifications)
    await ctx.notifications.notify({ kind: 'job-settled', title: 't', body: 'b' })
    expect((ctx.notifications as StubNotifications).delivered).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('loading a second implementation throws (one notification service per context)', async () => {
    const ctx = new Context()
    await ctx.plugin(StubNotifications)
    class SecondNotifications extends StubNotifications {}
    await expect(ctx.plugin(SecondNotifications)).rejects.toThrow(/service "notifications" has been registered/)
    await ctx.fiber.dispose()
  })

  it('mounting the abstract seam directly fails loudly at load', async () => {
    const ctx = new Context()
    await expect(ctx.plugin(NotificationService as unknown as typeof StubNotifications))
      .rejects.toThrow(/abstract notification seam; load an implementation such as @deepseek-ai\/dsh-notifications-terminal/)
    await ctx.fiber.dispose()
  })
})
