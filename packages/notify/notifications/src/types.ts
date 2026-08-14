/**
 * Notification vocabulary shared by consumers (event bridges) and providers
 * (terminal, native toast). The seam itself lives in ./index.ts.
 * @module @deepseek-ai/dsh-notifications/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session'

/**
 * Merge-extensible map of notification categories. Bridges classify an
 * observed event under one category; providers render or filter by it. A new
 * consumer adds its category here through declaration merging, never by
 * editing this package.
 */
export interface NotificationKindMap {
  'job-settled': 'job-settled'
  'approval-waiting': 'approval-waiting'
  'turn-failed': 'turn-failed'
}

/** The merge-extensible union of notification categories. */
export type NotificationKind = NotificationKindMap[keyof NotificationKindMap]

/**
 * One delivery request from a consumer to a provider. All fields are
 * operator-facing: nothing here enters the session log or a model request.
 */
export interface Notification {
  /** Category the consumer classified the raising event under. */
  kind: NotificationKind
  /** One-line operator-facing title. */
  title: string
  /** Operator-facing body rendered verbatim by the provider. */
  body: string
  /** Session correlation for click-through; providers without navigation ignore it. */
  sessionId?: SessionId
}
