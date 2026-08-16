/** Package-owned invariants over the `workspace-notes/snapshot` session event. @module @deepseek-ai/dsh-workspace-notes-agent/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { snapshotTextEncodingError } from './render.ts'
import type { WorkspaceNotesSnapshotNoteRef } from './types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-workspace-notes-agent'

/** Cordis companion plugin name. */
export const name = 'workspace-notes-agent-invariant'
/** Services required before the companion can reserve and check package ownership. */
export const inject = ['invariants']

/**
 * Validate one snapshot event against the package-owned encoding rules:
 * present `ignorable` envelope, well-formed workspace id, plausible family
 * revision and fingerprint, unique note references with revisions the family
 * revision covers, text that encodes exactly that reference sequence, and a
 * non-negative omission count.
 * @param event - the candidate session event.
 * @param fail - package-attributed invariant reporter.
 */
function validateSnapshotEvent(event: SessionEvent, fail: InvariantFailure): void {
  if (event.type !== 'workspace-notes/snapshot') return
  if (event.ignorable !== true) {
    fail('workspace-notes/snapshot must carry the envelope ignorable: true so builds without this plugin family can replay it')
  }
  const data = event.data as {
    workspaceId: unknown
    familyRevision: unknown
    configFingerprint: unknown
    notes: unknown
    text: unknown
    omitted: unknown
  }
  if (typeof data.workspaceId !== 'string' || data.workspaceId.length === 0) {
    fail('workspace-notes/snapshot carries no workspace id')
  }
  if (!Number.isSafeInteger(data.familyRevision) || (data.familyRevision as number) < 0) {
    fail('workspace-notes/snapshot carries a family revision that is not a non-negative safe integer')
  }
  if (typeof data.configFingerprint !== 'string' || !data.configFingerprint.startsWith('v1:')) {
    fail('workspace-notes/snapshot carries a config fingerprint outside the versioned v1: format')
  }
  if (!Array.isArray(data.notes)) {
    fail('workspace-notes/snapshot carries a note-reference list that is not an array')
  }
  const familyRevision = data.familyRevision as number
  const seen = new Set<string>()
  for (const ref of data.notes as { noteId?: unknown; revision?: unknown }[]) {
    if (typeof ref.noteId !== 'string' || ref.noteId.length === 0) {
      fail('workspace-notes/snapshot encodes a note reference without an id')
    }
    const noteId = ref.noteId
    if (seen.has(noteId)) {
      fail(`workspace-notes/snapshot encodes note '${noteId}' more than once`)
    }
    seen.add(noteId)
    if (!Number.isSafeInteger(ref.revision) || (ref.revision as number) < 1) {
      fail(`workspace-notes/snapshot encodes note '${noteId}' with a revision that is not a positive safe integer`)
    }
    if ((ref.revision as number) > familyRevision) {
      fail(`workspace-notes/snapshot encodes note '${noteId}' at a revision its family revision cannot cover`)
    }
  }
  const encoding = snapshotTextEncodingError(
    data.text as string,
    data.notes as WorkspaceNotesSnapshotNoteRef[],
  )
  if (encoding !== undefined) {
    fail(`workspace-notes/snapshot text violates the encoding contract: ${encoding}`)
  }
  if (!Number.isSafeInteger(data.omitted) || (data.omitted as number) < 0) {
    fail('workspace-notes/snapshot carries an omission count that is not a non-negative safe integer')
  }
}

/** Check existing sessions and every candidate event before Session publishes it. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) {
    for (const event of session.events) validateSnapshotEvent(event, fail)
  }
  /* jscpd:ignore-start -- package companions share dispatch and registration plumbing */
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [, event] = args as [Session, SessionEvent]
    validateSnapshotEvent(event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
