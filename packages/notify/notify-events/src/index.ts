/**
 * Event bridge for the notification seam: raises one notification per
 * observed job settlement, approval request, failed turn, completed turn, or
 * (opted-in) failed tool call. Every trigger source already exists in the
 * harness — the job registry's completion callback and durable session
 * events — this plugin only classifies and forwards them.
 * @module @deepseek-ai/dsh-notify-events
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { JobSnapshot, JobStatus } from '@deepseek-ai/dsh-jobs'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'
import type { Notification } from '@deepseek-ai/dsh-notifications'
import type {} from '@deepseek-ai/dsh-user-approval'

declare module '@deepseek-ai/dsh-notifications' {
  interface NotificationKindMap {
    'tool-failed': 'tool-failed'
    'turn-completed': 'turn-completed'
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'notify-events'

/** The notification service and the job registry the bridge reads from. */
export const inject = ['notifications', 'jobs']

/** Bridge policy: which event classes raise, decided at composition. */
export interface Config {
  /** Raise on every terminal background job; defaults to true. */
  jobSettled?: boolean
  /** Raise when an approval is waiting; defaults to true. */
  approvalWaiting?: boolean
  /** Raise when a turn dies with an error; defaults to true. */
  turnFailed?: boolean
  /** Raise when a turn completes; defaults to false — completion is frequent and often in view. */
  turnCompleted?: boolean
  /** Raise on a failed tool call; defaults to false — tool failures are recoverable and frequent. */
  toolFailed?: boolean
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  jobSettled: z.boolean(),
  approvalWaiting: z.boolean(),
  turnFailed: z.boolean(),
  turnCompleted: z.boolean(),
  toolFailed: z.boolean(),
})

/** Fully resolved bridge policy; defaulting happens here, never inline. */
export interface ResolvedSpec {
  jobSettled: boolean
  approvalWaiting: boolean
  turnFailed: boolean
  turnCompleted: boolean
  toolFailed: boolean
}

/**
 * Resolve the bridge policy from plugin config.
 * @param config - raw plugin config.
 * @returns the resolved per-class switches.
 */
export function resolveSpec(config: Config): ResolvedSpec {
  return {
    jobSettled: config.jobSettled ?? true,
    approvalWaiting: config.approvalWaiting ?? true,
    turnFailed: config.turnFailed ?? true,
    turnCompleted: config.turnCompleted ?? false,
    toolFailed: config.toolFailed ?? false,
  }
}

/** Operator-facing title per terminal job status; running/stopping never reach the completion callback. */
const JOB_TITLES: Record<JobStatus, string> = {
  running: '后台任务',
  stopping: '后台任务',
  completed: '后台任务完成',
  killed: '后台任务已停止',
  failed: '后台任务失败',
}

/**
 * Build the settlement notification for one terminal job record.
 * @param snapshot - terminal job snapshot.
 * @returns the notification; sessionId absent for unowned jobs.
 */
export function jobNotice(snapshot: JobSnapshot): Notification {
  const body = snapshot.detail === undefined ? snapshot.label : snapshot.label + ' — ' + snapshot.detail
  const notice: Notification = { kind: 'job-settled', title: JOB_TITLES[snapshot.status], body }
  if (snapshot.ownerSession !== undefined) notice.sessionId = snapshot.ownerSession
  return notice
}

/**
 * Build the waiting notification for one approval/asked payload.
 * @param sessionId - the session whose approval is waiting.
 * @param data - the durable approval/asked payload declared by dsh-user-approval.
 * @returns the notification.
 */
export function approvalNotice(sessionId: SessionId, data: SessionEvent<'approval/asked'>['data']): Notification {
  const body = data.reason === undefined
    ? '工具 ' + data.toolName + ' 请求批准'
    : '工具 ' + data.toolName + ' 请求批准：' + data.reason
  return { kind: 'approval-waiting', title: '等待审批', body, sessionId }
}

/**
 * Build the failure notification for one failed turn.
 * @param sessionId - the session whose turn died.
 * @param error - the structured failure that ended the turn.
 * @returns the notification.
 */
export function turnNotice(sessionId: SessionId, error: LlmFailure): Notification {
  return { kind: 'turn-failed', title: '回合失败', body: error.message, sessionId }
}

/**
 * Build the completion notification for one finished turn.
 * @param sessionId - the session whose turn completed.
 * @returns the notification.
 */
export function turnCompletedNotice(sessionId: SessionId): Notification {
  return { kind: 'turn-completed', title: '任务完成', body: '回复已生成', sessionId }
}

/**
 * Build the failure notification for one failed tool call.
 * @param sessionId - the session whose tool call failed.
 * @param error - the durable tool/result failure identity.
 * @returns the notification.
 */
export function toolNotice(sessionId: SessionId, error: { name: string; code: string }): Notification {
  return { kind: 'tool-failed', title: '工具执行失败', body: error.name + ' (' + error.code + ')', sessionId }
}

/**
 * Register the bridge's trigger subscriptions. Job settlements come through
 * the registry callback, session facts through session/event; both
 * subscriptions unwind when the plugin disposes.
 * @param ctx - Cordis context carrying notifications, jobs, and sessions.
 * @param config - raw plugin config.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const spec = resolveSpec(config)
  const raise = (notification: Notification): void => {
    ctx.notifications.notify(notification).then(undefined, (error: unknown) => {
      ctx.logger.warn('notify-events: delivery failed: %s', error instanceof Error ? error.message : String(error))
    })
  }
  if (spec.jobSettled) {
    ctx.effect(() => ctx.jobs.onJobDone((snapshot) => { raise(jobNotice(snapshot)) }))
  }
  ctx.on('session/event', (session, event) => {
    if (event.type === 'approval/asked') {
      if (spec.approvalWaiting) raise(approvalNotice(session.id, event.data))
      return
    }
    if (event.type === 'turn/end') {
      if (event.data.reason.kind === 'completed') {
        if (spec.turnCompleted) raise(turnCompletedNotice(session.id))
      } else if (event.data.reason.kind === 'error') {
        if (spec.turnFailed) raise(turnNotice(session.id, event.data.reason.error))
      }
      return
    }
    if (event.type === 'tool/result') {
      if (spec.toolFailed && event.data.error !== undefined) raise(toolNotice(session.id, event.data.error))
      return
    }
  })
}
