// @vitest-environment jsdom
/**
 * NotesPane behavior over the real per-workspace manager and mutation verbs
 * wired to one scripted Remote double: load states, the create/edit editors,
 * compare-and-set conflict recovery, delete-with-confirm, visibility toggle,
 * the stale banner, and the error/retry path.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { WorkspaceNotesManager } from '@deepseek-ai/dsh-workspace-notes/client'
import type { NoteId, WorkspaceNote } from '@deepseek-ai/dsh-workspace-notes/types'
import { NotesPane, type NotesPaneViewProps } from '../src/client/NotesPane.tsx'
import { WorkspaceNotesActions, type NotesCreateOutcome } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const WS = 'ws-1' as WorkspaceId
const t = makeTranslate(zh, commonZh)

/** Programmed answer book: per-method result queues, plus a call tape. */
interface RemoteScript {
  list: () => Promise<unknown>
  create: () => Promise<unknown>
  update: () => Promise<unknown>
  delete: () => Promise<unknown>
}

/** Script with idle mutation verbs: only the baseline list is exercised. */
function seeded(list: () => Promise<unknown>): RemoteScript {
  return {
    list,
    create: () => Promise.resolve({}),
    update: () => Promise.resolve({}),
    delete: () => Promise.resolve({}),
  }
}

function note(overrides: Partial<WorkspaceNote> = {}): WorkspaceNote {
  return {
    noteId: 'n-1' as NoteId,
    workspaceId: WS,
    revision: 1,
    content: 'first note',
    agentVisible: false,
    source: { kind: 'manual' },
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
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
      update: (request: unknown) => { calls.push({ method: 'update', request }); return script.update() },
      delete: (request: unknown) => { calls.push({ method: 'delete', request }); return script.delete() },
    } as never,
  }
}

/** Mount the pane over one manager + verbs bound to the scripted Remote. */
function mount(script: RemoteScript) {
  const { calls, remote } = scriptedRemote(script)
  const manager = new WorkspaceNotesManager(remote, WS)
  const actions = new WorkspaceNotesActions(remote)
  const props = {
    workspaceId: WS,
    managerFor: () => manager,
    actions,
    t,
  } as unknown as NotesPaneViewProps
  return { ...render(<NotesPane {...props} />), calls, manager, refresh: () => manager.refresh() }
}

/** The seeded baseline: one visible manual note and one message-sourced note. */
const SEEDED = [note(), note({
  noteId: 'n-2' as NoteId,
  revision: 3,
  content: 'from the chat',
  agentVisible: true,
  source: { kind: 'message', sessionId: 's-1' as never, sourceEventSeq: 7 },
  updatedAt: '2026-08-15T09:00:00.000Z',
})]

describe('NotesPane', () => {
  it('renders the unavailable state without a selected workspace', () => {
    const props = {
      workspaceId: undefined,
      managerFor: () => { throw new Error('unreachable') },
      actions: null,
      t,
    } as unknown as NotesPaneViewProps
    render(<NotesPane {...props} />)
    expect(screen.getByText(zh['state.unavailable'])).toBeTruthy()
  })

  it('loads the baseline and renders each note with provenance, stamp, and visibility', async () => {
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { notes: SEEDED } } })))
    await act(async () => { await ui.refresh() })

    expect(screen.getByText('first note')).toBeTruthy()
    expect(screen.getByText('from the chat')).toBeTruthy()
    expect(screen.getByText(zh['source.manual'])).toBeTruthy()
    expect(screen.getByText(zh['source.message'])).toBeTruthy()
    expect(screen.getByText('2026-08-15 10:00')).toBeTruthy()
    expect(screen.getByLabelText(zh['action.visibilityOn']).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText(zh['action.visibilityOff']).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the empty state with its hint when the workspace has no notes', async () => {
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [] } } })))
    await act(async () => { await ui.refresh() })

    expect(screen.getByText(zh['state.empty'])).toBeTruthy()
    expect(screen.getByText(zh['state.emptyHint'])).toBeTruthy()
  })

  it('creates a note through the editor with manual provenance', async () => {
    let created: WorkspaceNote | undefined
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [] } } }),
      create: () => {
        created = note({ noteId: 'n-new' as NoteId, content: 'brand new' })
        return Promise.resolve({ ok: true, value: { ok: true, value: created } })
      },
      update: () => Promise.resolve({}),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.create'] }))
    const editor = screen.getByLabelText(zh['editor.createTitle']) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: '  brand new  ' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.save'] }))
    await act(async () => {})

    const create = ui.calls.find(call => call.method === 'create')?.request
    expect(create).toEqual({
      workspaceId: WS,
      content: 'brand new',
      agentVisible: false,
      source: { kind: 'manual' },
    })
    await waitFor(() => { expect(screen.queryByLabelText(zh['editor.createTitle'])).toBeNull() })
  })

  it('keeps the save control disabled for a blank draft', async () => {
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [] } } })))
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.create'] }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh['action.save'] }).disabled).toBe(true)
    expect(ui.calls.filter(call => call.method === 'create')).toHaveLength(0)
  })

  it('saves an edit against the observed revision', async () => {
    const updated = note({ revision: 2, content: 'rewritten elsewhere' })
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [note()] } } }),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({ ok: true, value: { ok: true, value: updated } }),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.edit'] }))
    fireEvent.change(screen.getByLabelText(zh['editor.editTitle']), { target: { value: 'edited copy' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.save'] }))
    await act(async () => {})

    expect(ui.calls.find(call => call.method === 'update')?.request).toEqual({
      noteId: 'n-1',
      expectedRevision: 1,
      content: 'edited copy',
      agentVisible: false,
    })
    await waitFor(() => { expect(screen.queryByLabelText(zh['editor.editTitle'])).toBeNull() })
  })

  it('rebases the editor onto the authoritative note after a revision conflict', async () => {
    const current = note({ revision: 5, content: 'rewritten elsewhere' })
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [note()] } } }),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({ ok: true, value: { ok: false, error: { code: 'revision-conflict', current } } }),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.edit'] }))
    fireEvent.change(screen.getByLabelText(zh['editor.editTitle']), { target: { value: 'my stale edit' } })
    fireEvent.click(screen.getByRole('button', { name: zh['action.save'] }))
    await act(async () => {})

    expect(screen.getByRole('alert').textContent).toBe(zh['error.conflict'])
    expect(screen.getByLabelText<HTMLTextAreaElement>(zh['editor.editTitle']).value).toBe('rewritten elsewhere')
  })

  it('toggles visibility without touching content', async () => {
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [note()] } } }),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({ ok: true, value: { ok: true, value: note({ agentVisible: true }) } }),
      delete: () => Promise.resolve({}),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByLabelText(zh['action.visibilityOff']))
    await act(async () => {})

    expect(ui.calls.find(call => call.method === 'update')?.request).toEqual({
      noteId: 'n-1',
      expectedRevision: 1,
      agentVisible: true,
    })
  })

  it('deletes only after the inline confirmation', async () => {
    const ui = mount({
      list: () => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [note()] } } }),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({}),
      delete: () => Promise.resolve({ ok: true, value: { ok: true, value: { absent: true as const } } }),
    })
    await act(async () => { await ui.refresh() })

    fireEvent.click(screen.getByRole('button', { name: zh['action.delete'] }))
    expect(ui.calls.filter(call => call.method === 'delete')).toHaveLength(0)
    const confirm = screen.getByRole('alertdialog', { name: zh['action.deleteConfirm'] })
    fireEvent.click(within(confirm).getByRole('button', { name: zh['action.delete'] }))
    await act(async () => {})

    expect(ui.calls.find(call => call.method === 'delete')?.request).toEqual({
      noteId: 'n-1',
      expectedRevision: 1,
    })
    await waitFor(() => { expect(screen.queryByRole('alertdialog')).toBeNull() })
  })

  it('marks the banner while the local list predates the connection', async () => {
    const ui = mount(seeded(() => Promise.resolve({ ok: true, value: { ok: true, value: { notes: [note()] } } })))
    await act(async () => { await ui.refresh() })
    expect(screen.queryByText(zh['state.stale'])).toBeNull()

    act(() => { ui.manager.handleDisconnected() })

    expect(screen.getByText(zh['state.stale'])).toBeTruthy()
  })

  it('surfaces a failed load with a retry that re-reads the list', async () => {
    const list = vi.fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ ok: true, value: { ok: false, error: { code: 'unknown-workspace', workspaceId: WS } } })
      .mockResolvedValueOnce({ ok: true, value: { ok: true, value: { notes: [note()] } } })
    const ui = mount({ list, create: () => Promise.resolve({}), update: () => Promise.resolve({}), delete: () => Promise.resolve({}) })
    await act(async () => { await ui.refresh() })

    expect(screen.getByText(zh['state.error'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['state.retry'] }))
    await act(async () => {})

    expect(list).toHaveBeenCalledTimes(2)
    await waitFor(() => { expect(screen.getByText('first note')).toBeTruthy() })
  })

  it('flattens a carrier failure into the transport copy', async () => {
    const action = new WorkspaceNotesActions(({
      create: () => Promise.resolve({ ok: false, error: { code: 'ECONNRESET', message: 'stream died' } }),
    }) as never)
    const outcome: NotesCreateOutcome = await action.create({
      workspaceId: WS,
      content: 'x',
      agentVisible: false,
      source: { kind: 'manual' },
    })
    expect(outcome).toEqual({ ok: false, error: { code: 'transport', message: 'stream died' } })
  })
})
