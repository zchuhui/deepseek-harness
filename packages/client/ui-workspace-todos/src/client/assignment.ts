/**
 * Explicit shared-todo assignment intent: prepare one exact prompt in the
 * target session's composer, then send that stored prompt before committing
 * the Host-side assignment. Ordinary composer edits never create an intent.
 * @module @deepseek-ai/dsh-client-ui-workspace-todos/client/assignment
 */

import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SharedTodo, SharedTodoId } from '@deepseek-ai/dsh-workspace-todos/types'

/** One prepared, browser-local assignment intent. */
export interface AssignmentIntent {
  /** Todo whose revision must still be current when the Host assignment commits. */
  readonly todoId: SharedTodoId
  /** Compare-and-set revision observed while preparing the intent. */
  readonly expectedRevision: number
  /** Session that receives the exact task prompt. */
  readonly sessionId: SessionId
  /** Immutable prompt this intent sends; it does not derive from later drafts. */
  readonly text: string
}

/** Render the exact assignment prompt from committed todo data. */
export function assignmentText(todo: SharedTodo): string {
  return [
    'You have been assigned this shared workspace todo.',
    '',
    `Todo: ${todo.content}`,
    '',
    'Work on it in this session and report the completed result.',
  ].join('\n')
}

/** Resolve a target session's public conversation face, failing before any mutation. */
function conversationFor(sessions: ISessions, sessionId: SessionId): { scope: NonNullable<ReturnType<ISessions['scope']>>; conversation: IConversation } {
  const scope = sessions.scope(sessionId)
  if (scope === undefined) throw new Error(`workspace-todos: assignment target "${String(sessionId)}" has no session scope`)
  const conversation = scope.get('conversation') as IConversation | undefined
  if (conversation === undefined) throw new Error('workspace-todos: assignment target has no conversation service')
  return { scope, conversation }
}

/** Browser-local two-step assignment coordinator. */
export class WorkspaceTodosAssignments {
  /** @param sessions - session scopes and navigation supplied by the client runtime. */
  constructor(private readonly sessions: ISessions) {}

  /**
   * Prepare an intent and put its exact prompt into the target's composer.
   * No durable todo mutation occurs here.
   * @param todo - committed pending todo selected by the user.
   * @param sessionId - target workspace session.
   * @returns the browser-local intent for the explicit send action.
   */
  prepare(todo: SharedTodo, sessionId: SessionId): AssignmentIntent {
    const { scope, conversation } = conversationFor(this.sessions, sessionId)
    const text = assignmentText(todo)
    conversation.input.for(scope).setDraft(text)
    this.sessions.open(sessionId)
    return Object.freeze({ todoId: todo.todoId, expectedRevision: todo.revision, sessionId, text })
  }

  /**
   * Send exactly the prepared prompt through the target session. If the
   * prepared draft remains untouched, clear it after Host acceptance; edits
   * to that draft never alter the stored intent or create a todo mutation.
   * @param intent - exact browser-local intent selected by the user.
   * @returns completion after the Host accepts the prompt.
   */
  async send(intent: AssignmentIntent): Promise<void> {
    const { scope, conversation } = conversationFor(this.sessions, intent.sessionId)
    const input = conversation.input.for(scope)
    await conversation.send(intent.text)
    if (input.state.getSnapshot().draft === intent.text) input.setDraft('')
  }
}
