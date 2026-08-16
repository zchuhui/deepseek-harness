import { describe, expect, it, vi } from 'vitest'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { WorkspaceTodosManager } from '../src/manager.ts'
import type { WorkspaceTodosRemoteFace } from '../src/manager.ts'
import type { SharedTodo, SharedTodosListResult } from '../src/types.ts'

const WORKSPACE = WorkspaceId('11111111-1111-1111-1111-111111111111')
const OTHER = WorkspaceId('22222222-2222-2222-2222-222222222222')

const todo = (id: string, createdAt: string): SharedTodo => ({
  todoId: id as SharedTodo['todoId'],
  workspaceId: WORKSPACE,
  revision: 1,
  content: `body ${id}`,
  status: 'pending',
  createdBy: { kind: 'user' },
  assignedSessionId: null,
  createdAt,
  updatedAt: createdAt,
  completedAt: null,
})

/** One scripted `list` outcome: a carried result or a transport rejection. */
type RemoteOutcome =
  | { ok: true; value: SharedTodosListResult }
  | { ok: false; error: { code: string; message: string; details: object } }
  | Error

/** Scripted remote double recording `list` calls; the last response repeats. */
function scriptedRemote(responses: readonly RemoteOutcome[]): WorkspaceTodosRemoteFace & { listCalls: number } {
  let calls = 0
  const remote: WorkspaceTodosRemoteFace & { listCalls: number } = {
    listCalls: 0,
    list: async (request) => {
      const outcome = responses[Math.min(calls, responses.length - 1)]
      if (outcome === undefined) throw new Error('scripted remote has no responses')
      calls += 1
      remote.listCalls = calls
      void request
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)
    },
  }
  return remote
}

const carried = (value: SharedTodosListResult) => ({ ok: true as const, value })
const carrierFailure = { ok: false as const, error: { code: 'unavailable', message: 'gateway is down', details: {} } }

describe('workspace todos manager', () => {
  it('publishes the ready baseline with the host-ordered list', async () => {
    const older = todo('a', '2026-08-15T00:00:00.000Z')
    const newer = todo('b', '2026-08-15T01:00:00.000Z')
    const remote = scriptedRemote([carried({ ok: true, value: { todos: [newer, older] } })])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)

    expect(manager.getSnapshot().status).toBe('cold')
    await manager.refresh()

    const view = manager.getSnapshot()
    expect(view.status).toBe('ready')
    expect(view.stale).toBe(false)
    expect(view.error).toBeNull()
    expect(view.todos).toEqual([newer, older])
  })

  it('collapses concurrent refreshes onto one in-flight read', async () => {
    const remote = scriptedRemote([carried({ ok: true, value: { todos: [] } })])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)

    await Promise.all([manager.refresh(), manager.refresh(), manager.refresh()])
    expect(remote.listCalls).toBe(1)
  })

  it('replays a frame that lands while a baseline is in flight', async () => {
    let reads = 0
    const remote: WorkspaceTodosRemoteFace = {
      list: async () => {
        reads += 1
        return carried({ ok: true, value: { todos: [] } })
      },
    }
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)

    const settling = manager.refresh()
    // Called synchronously after refresh starts, the frame lands while the
    // first read is still awaiting resolution: the manager must run a second
    // baseline over the invalidated one before the refresh settles.
    manager.handleChanged({ workspaceId: WORKSPACE, revision: 1 })
    await settling
    expect(reads).toBe(2)
  })

  it('ignores frames of other workspaces and out-of-order revisions', async () => {
    const remote = scriptedRemote([carried({ ok: true, value: { todos: [] } })])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)
    await manager.refresh()

    // The first frame of the workspace is accepted and drives one re-read.
    manager.handleChanged({ workspaceId: WORKSPACE, revision: 5 })
    expect(remote.listCalls).toBe(2)

    // Foreign workspaces and revisions at or below the last seen one are ignored.
    manager.handleChanged({ workspaceId: OTHER, revision: 9 })
    manager.handleChanged({ workspaceId: WORKSPACE, revision: 5 })
    manager.handleChanged({ workspaceId: WORKSPACE, revision: 4 })
    expect(remote.listCalls).toBe(2)
  })

  it('marks the view stale on disconnect and refetches on reconnect', async () => {
    const remote = scriptedRemote([carried({ ok: true, value: { todos: [] } })])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)
    await manager.refresh()

    manager.handleDisconnected()
    expect(manager.getSnapshot().stale).toBe(true)
    expect(manager.getSnapshot().status).toBe('ready')

    manager.handleConnected()
    await vi.waitFor(() => { expect(manager.getSnapshot().stale).toBe(false) })
  })

  it('surfaces a carrier failure as an error view without losing the list', async () => {
    const kept = todo('a', '2026-08-15T00:00:00.000Z')
    const remote = scriptedRemote([
      carried({ ok: true, value: { todos: [kept] } }),
      carrierFailure,
    ])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)
    await manager.refresh()

    await manager.refresh()
    const view = manager.getSnapshot()
    expect(view.status).toBe('error')
    expect(view.error).toEqual({ code: 'unavailable', message: 'gateway is down' })
    expect(view.todos).toEqual([kept])
  })

  it('describes an unknown-workspace business failure', async () => {
    const remote = scriptedRemote([carried({
      ok: false,
      error: { code: 'unknown-workspace', workspaceId: WORKSPACE },
    })])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)

    await manager.refresh()
    const view = manager.getSnapshot()
    expect(view.status).toBe('error')
    expect(view.error).toEqual({
      code: 'unknown-workspace',
      message: 'this workspace is no longer registered',
    })
  })

  it('contains a transport rejection as a transport error view', async () => {
    const remote = scriptedRemote([new Error('socket hang up')])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)

    await manager.refresh()
    const view = manager.getSnapshot()
    expect(view.status).toBe('error')
    expect(view.error).toEqual({ code: 'transport', message: 'socket hang up' })
  })

  it('notifies subscribers on publish and stops after unsubscribe', async () => {
    const remote = scriptedRemote([carried({ ok: true, value: { todos: [] } })])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)
    const listener = vi.fn()
    const unsubscribe = manager.subscribe(listener)

    // One refresh publishes the loading view and then the ready view.
    await manager.refresh()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()

    manager.handleDisconnected()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('contains a subscriber throw at the publish boundary', async () => {
    const remote = scriptedRemote([carried({ ok: true, value: { todos: [] } })])
    const manager = new WorkspaceTodosManager(remote, WORKSPACE)
    manager.subscribe(() => { throw new Error('listener exploded') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(manager.refresh()).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
    expect(manager.getSnapshot().status).toBe('ready')
  })
})
