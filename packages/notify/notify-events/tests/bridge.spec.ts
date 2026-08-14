import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { NotificationService } from '@deepseek-ai/dsh-notifications'
import type { Notification } from '@deepseek-ai/dsh-notifications'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import { JobId } from '@deepseek-ai/dsh-jobs'
import { CallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { ApprovalRequestId } from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-approval'
import * as bridge from '../src/index.ts'

class FakeNotifications extends NotificationService {
  delivered: Notification[] = []
  failure: unknown = undefined

  async notify(notification: Notification): Promise<void> {
    if (this.failure !== undefined) {
      const failure = this.failure
      this.failure = undefined
      throw failure
    }
    this.delivered.push(notification)
  }
}

let context: Context | undefined
let notifications: FakeNotifications | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  notifications = undefined
})

async function harness(config: bridge.Config = {}): Promise<{ fiber: Awaited<ReturnType<Context['plugin']>> }> {
  context = new Context()
  await context.plugin(SessionStore)
  notifications = new FakeNotifications(context)
  await context.plugin(LocalJobRegistry)
  context.jobs.attachController('bridge-test')
  const fiber = await context.plugin(bridge, config)
  return { fiber }
}

function startJob(label: string): () => void {
  let settle!: (outcome: { status: 'completed' }) => void
  context!.jobs.start({
    kind: 'bash',
    label,
    run: () => ({
      cancel: () => {},
      done: new Promise((resolve) => { settle = resolve }),
    }),
  })
  return () => { settle({ status: 'completed' }) }
}

describe('notify-events bridge', () => {
  it('raises job-settled for a completed background job', async () => {
    const { fiber } = await harness()
    const settle = startJob('bash: pnpm test')
    settle()
    await vi.waitFor(() => { expect(notifications!.delivered).toHaveLength(1) })
    const notice = notifications!.delivered[0]!
    expect(notice.kind).toBe('job-settled')
    expect(notice.title).toBe('后台任务完成')
    expect(notice.body).toBe('bash: pnpm test')
    expect(notice.sessionId).toBeUndefined()
    await fiber.dispose()
  })

  it('skips job settlements when jobSettled is false', async () => {
    const { fiber } = await harness({ jobSettled: false })
    const settle = startJob('bash: pnpm test')
    settle()
    expect(notifications!.delivered).toHaveLength(0)
    await fiber.dispose()
  })

  it('raises approval-waiting for an approval/asked event', async () => {
    const { fiber } = await harness()
    const session = context!.sessions.create(SessionId('bridge-approval'))
    session.append('turn/start', { turn: 1 })
    session.append('approval/asked', { id: ApprovalRequestId('approval-bridge-1'), toolName: 'bash', reason: '运行高权限命令' })
    const notice = notifications!.delivered[0]!
    expect(notice.kind).toBe('approval-waiting')
    expect(notice.title).toBe('等待审批')
    expect(notice.body).toBe('工具 bash 请求批准：运行高权限命令')
    expect(notice.sessionId).toBe(SessionId('bridge-approval'))
    await fiber.dispose()
  })

  it('raises turn-failed for an errored turn', async () => {
    const { fiber } = await harness()
    const session = context!.sessions.create(SessionId('bridge-turn'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: '请求失败', code: 'NETWORK' } } })
    const notice = notifications!.delivered[0]!
    expect(notice.kind).toBe('turn-failed')
    expect(notice.title).toBe('回合失败')
    expect(notice.body).toBe('请求失败')
    await fiber.dispose()
  })

  it('does not raise for a completed turn', async () => {
    const { fiber } = await harness()
    const session = context!.sessions.create(SessionId('bridge-turn-ok'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(notifications!.delivered).toHaveLength(0)
    await fiber.dispose()
  })

  it('does not raise for tool failures by default', async () => {
    const { fiber } = await harness()
    const session = context!.sessions.create(SessionId('bridge-tool'))
    session.append('turn/start', { turn: 1 })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({ callId: CallId('call-bridge-1'), content: [], isError: true }),
      error: { name: 'BashError', code: 'EXIT_1' },
    }, { surfaceOp: 'append' })
    expect(notifications!.delivered).toHaveLength(0)
    await fiber.dispose()
  })

  it('raises tool-failed when opted in', async () => {
    const { fiber } = await harness({ toolFailed: true })
    const session = context!.sessions.create(SessionId('bridge-tool-on'))
    session.append('turn/start', { turn: 1 })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({ callId: CallId('call-bridge-2'), content: [], isError: true }),
      error: { name: 'BashError', code: 'EXIT_1' },
    }, { surfaceOp: 'append' })
    const notice = notifications!.delivered[0]!
    expect(notice.kind).toBe('tool-failed')
    expect(notice.title).toBe('工具执行失败')
    expect(notice.body).toBe('BashError (EXIT_1)')
    await fiber.dispose()
  })

  it('contains delivery failures in the event dispatch', async () => {
    const { fiber } = await harness()
    const warn = vi.spyOn(context!.logger, 'warn')
    notifications!.failure = new Error('delivery boom')
    const session = context!.sessions.create(SessionId('bridge-contained'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: '请求失败', code: 'NETWORK' } } })
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledWith('notify-events: delivery failed: %s', 'delivery boom') })
    await fiber.dispose()
  })

  it('contains non-Error delivery failures in the event dispatch', async () => {
    const { fiber } = await harness()
    const warn = vi.spyOn(context!.logger, 'warn')
    notifications!.failure = 'boom-plain'
    const session = context!.sessions.create(SessionId('bridge-contained-plain'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: '请求失败', code: 'NETWORK' } } })
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledWith('notify-events: delivery failed: %s', 'boom-plain') })
    await fiber.dispose()
  })

  it('unwinds both subscriptions on dispose', async () => {
    const { fiber } = await harness()
    await fiber.dispose()
    const session = context!.sessions.create(SessionId('bridge-disposed'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: '请求失败', code: 'NETWORK' } } })
    const settle = startJob('bash: pnpm test')
    settle()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(notifications!.delivered).toHaveLength(0)
  })

  it('honors the approvalWaiting and turnFailed switches', async () => {
    const { fiber } = await harness({ approvalWaiting: false, turnFailed: false })
    const session = context!.sessions.create(SessionId('bridge-off'))
    session.append('turn/start', { turn: 1 })
    session.append('approval/asked', { id: ApprovalRequestId('approval-bridge-2'), toolName: 'bash' })
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'x', code: 'N' } } })
    expect(notifications!.delivered).toHaveLength(0)
    await fiber.dispose()
  })

  it('does not raise for a clean tool result even when opted in', async () => {
    const { fiber } = await harness({ toolFailed: true })
    const session = context!.sessions.create(SessionId('bridge-tool-clean'))
    session.append('turn/start', { turn: 1 })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({ callId: CallId('call-bridge-3'), content: [], isError: false }),
    }, { surfaceOp: 'append' })
    expect(notifications!.delivered).toHaveLength(0)
    await fiber.dispose()
  })
})

describe('render helpers', () => {
  it('titles every job status', () => {
    const base = { id: JobId('bash-1'), kind: 'bash' as const, label: 'bash: x', startedAt: 1, finishedAt: 2, reported: false }
    expect(bridge.jobNotice({ ...base, status: 'completed' }).title).toBe('后台任务完成')
    expect(bridge.jobNotice({ ...base, status: 'killed' }).title).toBe('后台任务已停止')
    expect(bridge.jobNotice({ ...base, status: 'failed' }).title).toBe('后台任务失败')
    expect(bridge.jobNotice({ ...base, status: 'running' }).title).toBe('后台任务')
    expect(bridge.jobNotice({ ...base, status: 'stopping' }).title).toBe('后台任务')
  })

  it('appends job detail and owner session', () => {
    const notice = bridge.jobNotice({ id: JobId('bash-1'), kind: 'bash', label: 'bash: x', status: 'failed', detail: 'exit code: 3', ownerSession: SessionId('s9'), startedAt: 1, finishedAt: 2, reported: false })
    expect(notice.body).toBe('bash: x — exit code: 3')
    expect(notice.sessionId).toBe(SessionId('s9'))
  })

  it('renders approval without a reason', () => {
    const data = { id: ApprovalRequestId('a1'), toolName: 'bash' }
    expect(bridge.approvalNotice(SessionId('s1'), data).body).toBe('工具 bash 请求批准')
  })

  it('renders turn and tool failures', () => {
    expect(bridge.turnNotice(SessionId('s1'), { message: 'boom', code: 'NETWORK' }).body).toBe('boom')
    expect(bridge.toolNotice(SessionId('s1'), { name: 'BashError', code: 'EXIT_1' }).body).toBe('BashError (EXIT_1)')
  })

  it('resolves defaults and explicit switches', () => {
    const defaults = { jobSettled: true, approvalWaiting: true, turnFailed: true, toolFailed: false }
    expect(bridge.resolveSpec({})).toEqual(defaults)
    const explicit = { jobSettled: false, approvalWaiting: false, turnFailed: false, toolFailed: true }
    expect(bridge.resolveSpec(explicit)).toEqual(explicit)
  })
})
