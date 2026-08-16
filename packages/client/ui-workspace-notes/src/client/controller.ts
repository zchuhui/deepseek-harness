/**
 * Mutation verbs over the generated workspaceNotes Remote namespace. The
 * generated face wraps every business result in the carrier envelope
 * (`RemoteResult`); this controller unwraps it so the pane switches on the
 * business union alone, with a transport pseudo-failure as the one added
 * branch. Read-model freshness stays on `WorkspaceNotesManager`.
 * @module @deepseek-ai/dsh-client-ui-workspace-notes/client/controller
 */

import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the generated namespace merge so `remote.workspaceNotes`
// is typed on Context.
import type {} from '@deepseek-ai/dsh-workspace-notes/remote'
import type {
  WorkspaceNotesCreateRequest,
  WorkspaceNotesCreateResult,
  WorkspaceNotesDeleteRequest,
  WorkspaceNotesDeleteResult,
  WorkspaceNotesUpdateRequest,
  WorkspaceNotesUpdateResult,
} from '@deepseek-ai/dsh-workspace-notes/types'

/** The generated workspaceNotes Remote namespace face. */
export type WorkspaceNotesRemoteMutations = Context['remote']['workspaceNotes']

/** Carrier or transport failure surfaced as one uniform rejected branch. */
export interface NotesTransportFailure {
  readonly ok: false
  readonly error: { readonly code: 'transport'; readonly message: string }
}

/** Outcome of one create verb: the business union plus transport failure. */
export type NotesCreateOutcome = WorkspaceNotesCreateResult | NotesTransportFailure
/** Outcome of one update verb: the business union plus transport failure. */
export type NotesUpdateOutcome = WorkspaceNotesUpdateResult | NotesTransportFailure
/** Outcome of one delete verb: the business union plus transport failure. */
export type NotesDeleteOutcome = WorkspaceNotesDeleteResult | NotesTransportFailure

/**
 * Await one carrier-wrapped call and flatten it onto the business plane.
 * @param call - the generated Remote call in flight.
 * @returns the carried business result, or the transport pseudo-failure.
 */
async function unwrap<T>(call: Promise<RemoteResult<T>>): Promise<T | NotesTransportFailure> {
  try {
    const carried = await call
    if (!carried.ok) {
      return { ok: false, error: { code: 'transport', message: carried.error.message } }
    }
    return carried.value
  } catch (error) {
    const message = error instanceof Error ? error.message : 'workspace notes call failed'
    return { ok: false, error: { code: 'transport', message } }
  }
}

/**
 * The notes tab's mutation face. One instance serves the whole plugin; every
 * method is stateless pass-through plus carrier unwrapping.
 */
export class WorkspaceNotesActions {
  /**
   * @param remote - the generated workspaceNotes Remote namespace.
   */
  constructor(private readonly remote: WorkspaceNotesRemoteMutations) {}

  /**
   * Create one note.
   * @param request - owning workspace, validated content, visibility, provenance.
   * @returns the committed note or an explicit failure.
   */
  create(request: WorkspaceNotesCreateRequest): Promise<NotesCreateOutcome> {
    return unwrap(this.remote.create(request))
  }

  /**
   * Edit one note against an observed revision.
   * @param request - target, observed revision, and desired fields.
   * @returns the committed note or an explicit failure.
   */
  update(request: WorkspaceNotesUpdateRequest): Promise<NotesUpdateOutcome> {
    return unwrap(this.remote.update(request))
  }

  /**
   * Delete one note against an observed revision.
   * @param request - target note and observed revision.
   * @returns the stable absent postcondition or an explicit failure.
   */
  delete(request: WorkspaceNotesDeleteRequest): Promise<NotesDeleteOutcome> {
    return unwrap(this.remote.delete(request))
  }
}
