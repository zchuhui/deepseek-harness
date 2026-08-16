/**
 * Mutation verbs over the generated workspaceTodos Remote namespace. The
 * generated face wraps every business result in the carrier envelope
 * (`RemoteResult`); this controller unwraps it so the pane switches on the
 * business union alone, with a transport pseudo-failure as the one added
 * branch. Read-model freshness stays on `WorkspaceTodosManager`.
 * @module @deepseek-ai/dsh-client-ui-workspace-todos/client/controller
 */

import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the generated namespace merge so `remote.workspaceTodos`
// is typed on Context.
import type {} from '@deepseek-ai/dsh-workspace-todos/remote'
import type {
  SharedTodosAssignRequest,
  SharedTodosAssignResult,
  SharedTodosCreateRequest,
  SharedTodosCreateResult,
  SharedTodosDeleteRequest,
  SharedTodosDeleteResult,
  SharedTodosSetStatusRequest,
  SharedTodosSetStatusResult,
  SharedTodosUpdateContentRequest,
  SharedTodosUpdateContentResult,
} from '@deepseek-ai/dsh-workspace-todos/types'

/** The generated workspaceTodos Remote namespace face. */
export type WorkspaceTodosRemoteMutations = Context['remote']['workspaceTodos']

/** Carrier or transport failure surfaced as one uniform rejected branch. */
export interface TodosTransportFailure {
  readonly ok: false
  readonly error: { readonly code: 'transport'; readonly message: string }
}

/** Outcome of one create verb: the business union plus transport failure. */
export type TodosCreateOutcome = SharedTodosCreateResult | TodosTransportFailure
/** Outcome of one content edit: the business union plus transport failure. */
export type TodosUpdateContentOutcome = SharedTodosUpdateContentResult | TodosTransportFailure
/** Outcome of one status move: the business union plus transport failure. */
export type TodosSetStatusOutcome = SharedTodosSetStatusResult | TodosTransportFailure
/** Outcome of one assignment: the business union plus transport failure. */
export type TodosAssignOutcome = SharedTodosAssignResult | TodosTransportFailure
/** Outcome of one delete verb: the business union plus transport failure. */
export type TodosDeleteOutcome = SharedTodosDeleteResult | TodosTransportFailure

/**
 * Await one carrier-wrapped call and flatten it onto the business plane.
 * @param call - the generated Remote call in flight.
 * @returns the carried business result, or the transport pseudo-failure.
 */
async function unwrap<T>(call: Promise<RemoteResult<T>>): Promise<T | TodosTransportFailure> {
  try {
    const carried = await call
    if (!carried.ok) {
      return { ok: false, error: { code: 'transport', message: carried.error.message } }
    }
    return carried.value
  } catch (error) {
    const message = error instanceof Error ? error.message : 'workspace todos call failed'
    return { ok: false, error: { code: 'transport', message } }
  }
}

/**
 * The todos tab's mutation face. One instance serves the whole plugin; every
 * method is stateless pass-through plus carrier unwrapping.
 */
export class WorkspaceTodosActions {
  /**
   * @param remote - the generated workspaceTodos Remote namespace.
   */
  constructor(private readonly remote: WorkspaceTodosRemoteMutations) {}

  /**
   * Create one todo.
   * @param request - owning workspace, validated single-line content, provenance.
   * @returns the committed todo or an explicit failure.
   */
  create(request: SharedTodosCreateRequest): Promise<TodosCreateOutcome> {
    return unwrap(this.remote.create(request))
  }

  /**
   * Edit one todo's content against an observed revision.
   * @param request - target, observed revision, and the replacement content.
   * @returns the committed todo or an explicit failure.
   */
  updateContent(request: SharedTodosUpdateContentRequest): Promise<TodosUpdateContentOutcome> {
    return unwrap(this.remote.updateContent(request))
  }

  /**
   * Move one todo to a new status against an observed revision.
   * @param request - target, observed revision, and the requested status.
   * @returns the committed todo or an explicit failure.
   */
  setStatus(request: SharedTodosSetStatusRequest): Promise<TodosSetStatusOutcome> {
    return unwrap(this.remote.setStatus(request))
  }

  /**
   * Commit one assignment: `pending → in_progress` plus the addressed session
   * in one atomic compare-and-set.
   * @param request - target, observed revision, and the addressed session.
   * @returns the committed todo or an explicit failure.
   */
  assign(request: SharedTodosAssignRequest): Promise<TodosAssignOutcome> {
    return unwrap(this.remote.assign(request))
  }

  /**
   * Delete one todo against an observed revision.
   * @param request - target todo and observed revision.
   * @returns the stable absent postcondition or an explicit failure.
   */
  delete(request: SharedTodosDeleteRequest): Promise<TodosDeleteOutcome> {
    return unwrap(this.remote.delete(request))
  }
}
