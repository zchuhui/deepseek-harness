import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import TerminalNotifications from '../src/index.ts'

let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe('TerminalNotifications', () => {
  it('renders one notification as one labelled logger line', async () => {
    context = new Context()
    await context.plugin(TerminalNotifications)
    const info = vi.spyOn(context.logger, 'info')
    await context.notifications.notify({ kind: 'job-settled', title: '任务完成', body: 'bash: pnpm test' })
    expect(info).toHaveBeenCalledWith('[dsh] %s: %s', '任务完成', 'bash: pnpm test')
  })
})
