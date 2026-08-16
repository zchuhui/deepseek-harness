// @vitest-environment jsdom
/**
 * TodosPane behavior over the real per-workspace manager and mutation verbs
 * wired to one scripted Remote double: load states, the create/edit editors,
 * validated status transitions, the assignment entry, compare-and-set
 * conflict recovery, delete-with-confirm, the stale banner, and the
 * error/retry path.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { WorkspaceTodosManager } from '@deepseek-ai/dsh-workspace-todos/client'
import type { SharedTodo, SharedTodoId } from '@deepseek-ai/dsh-workspace-todos/types'
import { TodosPane, type TodosPaneViewProps } from '../src/client/TodosPane.tsx'
import { WorkspaceTodosActions, type TodosCreateOutcome } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const WS = 'ws-1' as WorkspaceId
const S1 = 's-1' as SessionId
const S2 = 's-2' as SessionId
const t = makeTranslate(zh, commonZh)

/** Programmed answer book: per-method result queues, plus a call tape. */
interface RemoteScript {
  list: () => Promise<unknown>
  create: () => Promise<unknown>
  updateContent: () => Promise<unknown>
  setStatus: () => Promise<unknown>
  assign: () => Promise<unknown>
  delete: () => Promise<unknown>
}

/** Script with idle mutation verbs: only the baseline list is exercised. */
function seeded(list: () => Promise<unknown>): RemoteScript {
  return {
    list,
    create: () => Promise.resolve({}),
    updateContent: () => Promise.resolve({}),
    setStatus: () => Promise.resolve({}),
    assign: () => Promise.resolve({}),
    delete: () => Promise.resolve({}),
  }
}

function todo(overrides: Partial<SharedTodo> = {}): SharedTodo {
  return {
    todoId: 'td-1' as SharedTodoId,
    workspaceId: WS,
    revision: 1,
    content: 'first todo',
    status: 'pending',
    createdBy: { kind: 'user' },
    assignedSessionId: null,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

/** The generated namespace double: records every request, answers from the script. */
function scriptedRemote(script: RemoteScript) {
  const calls: { method: string; request: unknown }[] = []
  return {
    calls,
    remote: {
      list: (request: unknown) => { calls.push({ method: 'list', request }); return script.list() },
      create: (request: unknown) => { calls.push({ method: 'create', request }); return script.create() },
      updateContent: (request: unknown) => { calls.push({ method: 'updateContent', request }); return script.updateContent() },
      setStatus: (request: unknown) => { calls.push({ method: 'setStatus', request }); return script.setStatus() },
      assign: (request: unknown) => { calls.push({ method: 'assign', request }); return script.assign() },
      delete: (request: unknown) => { calls.push({ method: 'delete', request }); return script.delete() },
    } as never,
  }
}

/** The two live feeds as selector hooks over fixed snapshots. */
function feeds(sessionIds: readonly SessionId[] = [S1, S2]) {
  const byId: Record<string, { id: SessionId; displayTitle: string }> = {}
  for (const id of sessionIds) byId[id] = { id, displayTitle: `session ${id}` }
  return {
    useWorkspaces: (select: (state: unknown) => unknown) => select({ items: [{ workspaceId: WS, sessionIds }] }),
    useSessions: (select: (state: unknown) => unknown) => select({ byId }),
  }
}

/** Mount the pane over one manager + verbs bound to the scripted Remote. */
function mount(script: RemoteScript, sessionIds: readonly SessionId[] = [S1, S2]) {
  const { calls, remote } = scriptedRemote(script)
  const manager = new WorkspaceTodosManager(remote, WS)
  const actions = new WorkspaceTodosActions(remote)
  const assignments = {
    prepare: vi.fn((item: SharedTodo, sessionId: SessionId) => ({
      todoId: item.todoId,
      expectedRevision: item.revision,
      sessionId,
      text: `assigned: ${item.content}`,
    })),
    send: vi.fn(() => Promise.resolve()),
  }
  const props = {
    workspaceId: WS,
    managerFor: () => manager,
    actions,
    assignments,
    ...feeds(sessionIds),
    t,
  } as unknown as TodosPaneViewProps
  return { ...render(<TodosPane {...props} />), calls, manager, assignments, refresh: () => manager.refresh() }
}

describe('TodosPane', () => {
  it('renders the unavailable state without a selected workspace', () => {
    const props = {
      workspaceId: undefined,
      managerFor: () => { throw new Error('unreachable') },
      actions: null,
      t,
    } as unknown as TodosPaneViewProps
    render(<TodosPane {...props} />)
    expect(screen.getByText(zh['state.unavailable'])).toBeTruthy()
  })

  it('loads the baseline and renders each todo with status, provenance, and stamp', async () => {
    const SEEDED = [
      todo(),
      todo({
        todoId: 'td-2' as SharedTodoId,
        revision: 4,
        content: 'from the agent',
        status: 'in_progress',
        createdBy: { kind: 'agent', sessionId: S1 },
        assignedSessionId: S1,
        updatedAt: '2026-08-15T09:00:00.000Z',
      }),
    ]
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { todos: SEEDED } } })))
    await act(async () => { await ui.refresh() })

    expect(screen.getByText('first todo')).toBeTruthy()
    expect(screen.getByText('from the agent')).toBeTruthy()
    expect(screen.getByText(zh['status.pending'])).toBeTruthy()
    expect(screen.getByText(zh['status.in_progress'])).toBeTruthy()
    expect(screen.getByText(zh['source.user'])).toBeTruthy()
    expect(screen.getByText(zh['source.agent'])).toBeTruthy()
    expect(screen.getByText('2026-08-15 10:00')).toBeTruthy()
    expect(screen.getByText(`@session ${S1}`)).toBeTruthy()
  })

  it('offers only the allowed transitions per status', async () => {
    const statuses: readonly SharedTodo['status'][] = ['pending', 'in_progress', 'completed', 'cancelled']
    const expected: Record<SharedTodo['status'], string[]> = {
      pending: [zh['action.start'], zh['action.cancelTodo']],
      in_progress: [zh['action.reopen'], zh['action.complete'], zh['action.cancelTodo']],
      completed: [zh['action.reopen']],
      cancelled: [zh['action.reopen']],
    }
    for (const status of statuses) {
      cleanup()
      const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo({ status })] } } })))
      await act(async () => { await ui.refresh() })
      const offered = screen.getAllByRole('button').map(button => button.textContent)
      for (const label of expected[status]) expect(offered).toContain(label)
    }
    // The pending row also carries the disallowed moves' absence.
    cleanup()
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } })))
    await act(async () => { await ui.refresh() })
    expect(screen.queryByRole('button', { name: zh['action.complete'] })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['action.reopen'] })).toBeNull()
  })

  it('shows the empty state with its hint when the workspace has no todos', async () => {
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [] } } })))
    await act(async () => { await ui.refresh() })

    expect(screen.getByText(zh['state.empty'])).toBeTruthy()
    expect(screen.getByText(zh['state.emptyHint'])).toBeTruthy()
  })

  it('creates a todo through the editor with user provenance', async () => {
    let created: SharedTodo | undefined
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [] } } }),
      create: () => {
        created = todo({ todoId: 'td-new' as SharedTodoId, content: 'brand new' })
        return Promise.resolve({ ok: true, value: { ok: true, value: created } })
      },
      updateContent: () => Promise.resolve({}),
      setStatus: () => Promise.resolve({}),
      assign: () => Promise.resolve({}),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.create'] }))
    const editor = screen.getByLabelText(zh['editor.createTitle']) as HTMLInputElement
    fireEvent.change(editor, { target: { value: '  brand new  ' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.save'] }))
    await act(async () => {})

    expect(ui.calls.find(call => call.method === 'create')?.request).toEqual({
      workspaceId: WS,
      content: 'brand new',
      createdBy: { kind: 'user' },
    })
    await waitFor(() => { expect(screen.queryByLabelText(zh['editor.createTitle'])).toBeNull() })
  })

  it('keeps the save control disabled for a blank draft', async () => {
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [] } } })))
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.create'] }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh['action.save'] }).disabled).toBe(true)
    expect(ui.calls.filter(call => call.method === 'create')).toHaveLength(0)
  })

  it('saves a content edit against the observed revision', async () => {
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } }),
      create: () => Promise.resolve({}),
      updateContent: () => Promise.resolve({ ok: true, value: { ok: true, value: todo({ revision: 2, content: 'edited copy' }) } }),
      setStatus: () => Promise.resolve({}),
      assign: () => Promise.resolve({}),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.edit'] }))
    fireEvent.change(screen.getByLabelText(zh['editor.editTitle']), { target: { value: 'edited copy' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.save'] }))
    await act(async () => {})

    expect(ui.calls.find(call => call.method === 'updateContent')?.request).toEqual({
      todoId: 'td-1',
      expectedRevision: 1,
      content: 'edited copy',
    })
    await waitFor(() => { expect(screen.queryByLabelText(zh['editor.editTitle'])).toBeNull() })
  })

  it('rebases the editor onto the authoritative todo after a revision conflict', async () => {
    const current = todo({ revision: 5, content: 'rewritten elsewhere' })
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } }),
      create: () => Promise.resolve({}),
      updateContent: () => Promise.resolve({ ok: true, value: { ok: false, error: { code: 'revision-conflict', current } } }),
      setStatus: () => Promise.resolve({}),
      assign: () => Promise.resolve({}),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.edit'] }))
    fireEvent.change(screen.getByLabelText(zh['editor.editTitle']), { target: { value: 'my stale edit' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.save'] }))
    await act(async () => {})

    expect(screen.getByRole('alert').textContent).toBe(zh['error.conflict'])
    expect(screen.getByLabelText<HTMLInputElement>(zh['editor.editTitle']).value).toBe('rewritten elsewhere')
  })

  it('commits a status transition against the observed revision', async () => {
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } }),
      create: () => Promise.resolve({}),
      updateContent: () => Promise.resolve({}),
      setStatus: () => Promise.resolve({ ok: true, value: { ok: true, value: todo({ revision: 2, status: 'in_progress' }) } }),
      assign: () => Promise.resolve({}),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.start'] }))
    await act(async () => {})

    expect(ui.calls.find(call => call.method === 'setStatus')?.request).toEqual({
      todoId: 'td-1',
      expectedRevision: 1,
      status: 'in_progress',
    })
  })

  it('surfaces the rejected-transition copy without moving the local view', async () => {
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } }),
      create: () => Promise.resolve({}),
      updateContent: () => Promise.resolve({}),
      setStatus: () => Promise.resolve({
        ok: true,
        value: { ok: false, error: { code: 'invalid-transition', current: 'pending', requested: 'completed' } },
      }),
      assign: () => Promise.resolve({}),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.start'] }))
    await act(async () => {})

    expect(screen.getByRole('alert').textContent).toBe(zh['error.invalidTransition'])
  })

  it('prepares an exact assignment, then sends it before committing the pending-todo claim', async () => {
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } }),
      create: () => Promise.resolve({}),
      updateContent: () => Promise.resolve({}),
      setStatus: () => Promise.resolve({}),
      assign: () => Promise.resolve({ ok: true, value: { ok: true, value: todo({ revision: 2, status: 'in_progress', assignedSessionId: S1 }) } }),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.change(screen.getByLabelText(zh['assign.to']), { target: { value: S2 } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.assign'] }))
    await act(async () => {})

    expect(ui.assignments.prepare).toHaveBeenCalledWith(expect.objectContaining({ todoId: 'td-1', revision: 1 }), S2)
    expect(ui.calls.find(call => call.method === 'assign')).toBeUndefined()
    expect(screen.getByText(zh['assign.prepared'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['action.sendAssignment'] }))
    await act(async () => {})

    expect(ui.assignments.send).toHaveBeenCalledWith({
      todoId: 'td-1', expectedRevision: 1, sessionId: S2, text: 'assigned: first todo',
    })
    expect(ui.calls.find(call => call.method === 'assign')?.request).toEqual({
      todoId: 'td-1',
      expectedRevision: 1,
      sessionId: S2,
    })
  })

  it('offers no assignment entry once assigned or not pending', async () => {
    const ui = mount(seeded(() => Promise.resolve({
      ok: true,
      value: { ok: true, value: { todos: [todo({ status: 'in_progress', assignedSessionId: S1 })] } },
    })))
    await act(async () => { await ui.refresh() })

    expect(screen.queryByLabelText(zh['assign.to'])).toBeNull()
    expect(screen.queryByRole('button', { name: zh['action.assign'] })).toBeNull()
  })

  it('hints when the workspace has no assignable sessions', async () => {
    const ui = mount(
      seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } })),
      [],
    )
    await act(async () => { await ui.refresh() })

    expect(screen.getByText(zh['assign.noSessions'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['action.assign'] })).toBeNull()
  })

  it('deletes only after the inline confirmation', async () => {
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } }),
      create: () => Promise.resolve({}),
      updateContent: () => Promise.resolve({}),
      setStatus: () => Promise.resolve({}),
      assign: () => Promise.resolve({}),
      delete: () => Promise.resolve({ ok: true, value: { ok: true, value: { absent: true as const } } }),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.delete'] }))
    expect(ui.calls.filter(call => call.method === 'delete')).toHaveLength(0)
    const confirm = screen.getByRole('alertdialog', { name: zh['action.deleteConfirm'] })
    fireEvent.click(within(confirm).getByRole('button', { name: zh['action.delete'] }))
    await act(async () => {})

    expect(ui.calls.find(call => call.method === 'delete')?.request).toEqual({
      todoId: 'td-1',
      expectedRevision: 1,
    })
    await waitFor(() => { expect(screen.queryByRole('alertdialog')).toBeNull() })
  })

  it('marks the banner while the local list predates the connection', async () => {
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { todos: [todo()] } } })))
    await act(async () => { await ui.refresh() })
    expect(screen.queryByText(zh['state.stale'])).toBeNull()

    act(() => { ui.manager.handleDisconnected() })

    expect(screen.getByText(zh['state.stale'])).toBeTruthy()
  })

  it('surfaces a failed load with a retry that re-reads the list', async () => {
    const list = vi.fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ ok: true, value: { ok: false, error: { code: 'unknown-workspace', workspaceId: WS } } })
      .mockResolvedValueOnce({ ok: true, value: { ok: true, value: { todos: [todo()] } } })
    const ui = mount(seeded(list))
    await act(async () => { await ui.refresh() })

    expect(screen.getByText(zh['state.error'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['state.retry'] }))
    await act(async () => {})

    expect(list).toHaveBeenCalledTimes(2)
    await waitFor(() => { expect(screen.getByText('first todo')).toBeTruthy() })
  })

  it('flattens a carrier failure into the transport copy', async () => {
    const action = new WorkspaceTodosActions(({
      create: () => Promise.resolve({ ok: false, error: { code: 'ECONNRESET', message: 'stream died' } }),
    }) as never)
    const outcome: TodosCreateOutcome = await action.create({
      workspaceId: WS,
      content: 'x',
      createdBy: { kind: 'user' },
    })
    expect(outcome).toEqual({ ok: false, error: { code: 'transport', message: 'stream died' } })
  })
})
