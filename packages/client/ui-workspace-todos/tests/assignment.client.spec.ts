/** Explicit two-step assignment intent behavior. */

import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SharedTodo, SharedTodoId } from '@deepseek-ai/dsh-workspace-todos/types'
import { assignmentText, WorkspaceTodosAssignments } from '../src/client/assignment.ts'

const SESSION = 'target' as SessionId

const todo: SharedTodo = {
  todoId: 'todo-1' as SharedTodoId,
  workspaceId: 'workspace-1' as WorkspaceId,
  revision: 7,
  content: 'ship the release notes',
  status: 'pending',
  createdBy: { kind: 'user' },
  assignedSessionId: null,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
  completedAt: null,
}

describe('WorkspaceTodosAssignments', () => {
  it('stores an exact prompt independently of the composer draft, sends it, then clears only the untouched prepared draft', async () => {
    let draft = ''
    const setDraft = vi.fn((next: string) => { draft = next })
    const send = vi.fn(() => Promise.resolve())
    const conversation = {
      input: {
        for: () => ({ state: { getSnapshot: () => ({ draft }) }, setDraft }),
      },
      send,
    }
    const scope = { get: () => conversation }
    const open = vi.fn()
    const assignments = new WorkspaceTodosAssignments({ scope: () => scope, open } as never)

    const intent = assignments.prepare(todo, SESSION)
    expect(intent).toEqual({
      todoId: todo.todoId,
      expectedRevision: 7,
      sessionId: SESSION,
      text: assignmentText(todo),
    })
    expect(setDraft).toHaveBeenCalledWith(assignmentText(todo))
    expect(open).toHaveBeenCalledWith(SESSION)

    draft = 'user changed the composer'
    await assignments.send(intent)
    expect(send).toHaveBeenCalledWith(assignmentText(todo))
    expect(setDraft).toHaveBeenCalledTimes(1)

    draft = intent.text
    await assignments.send(intent)
    expect(setDraft).toHaveBeenLastCalledWith('')
  })
})
