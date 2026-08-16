// @vitest-environment jsdom
/**
 * MessageNoteAction behavior: blank messages render nothing, a session outside
 * every workspace fails before any wire call, and a successful save carries the
 * durable message provenance (session id + persisted source event seq) into a
 * private note, settling into the saved state; a carrier failure returns the
 * control to idle with the transport copy.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { MessageNoteAction } from '../src/client/MessageNoteAction.tsx'
import type { MessageNoteActionProps } from '../src/client/slots.ts'
import { WorkspaceNotesActions } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SESSION = 's-1' as SessionId
const WS = 'ws-1' as WorkspaceId
const t = makeTranslate(zh, commonZh)

/** One programmed create answer plus the recorded request. */
function actions(create: () => Promise<unknown>) {
  const calls: unknown[] = []
  const remote = {
    create: (request: unknown) => { calls.push(request); return create() },
  }
  return { verbs: new WorkspaceNotesActions(remote as never), calls }
}

/** The workspaces selector double: fixed mapping read per render. */
function useWorkspacesOf(workspaceId: WorkspaceId | undefined) {
  return (<T,>(_select: (list: unknown) => T): T => workspaceId as T) as never
}

function mount(options: {
  text?: string
  workspaceId?: WorkspaceId | undefined
  create: () => Promise<unknown>
}) {
  const { verbs, calls } = actions(options.create)
  const props = {
    seq: 7,
    text: options.text ?? '  useful answer  ',
    sessionId: SESSION,
    useWorkspaces: useWorkspacesOf(options.workspaceId),
    actions: verbs,
    t,
  } as unknown as MessageNoteActionProps
  return { ...render(<MessageNoteAction {...props} />), calls }
}

describe('MessageNoteAction', () => {
  it('renders nothing for a message without text', () => {
    const ui = mount({ text: '   ', create: () => Promise.resolve({}) })
    expect(ui.container.firstChild).toBeNull()
  })

  it('fails before any wire call when the session belongs to no workspace', async () => {
    const ui = mount({ workspaceId: undefined, create: () => Promise.resolve({}) })

    fireEvent.click(ui.getByRole('button', { name: zh['msg.save'] }))
    await act(async () => {})

    expect(ui.calls).toHaveLength(0)
    expect(ui.getByRole('status').textContent).toBe(zh['msg.noWorkspace'])
  })

  it('saves the trimmed text as a private note with the message provenance', async () => {
    const carrier = { ok: true as const, value: { ok: true as const, value: { noteId: 'n-1' } } }
    const ui = mount({ workspaceId: WS, create: () => Promise.resolve(carrier) })
    const save = ui.getByRole('button', { name: zh['msg.save'] }) as HTMLButtonElement

    fireEvent.click(save)
    expect(save.disabled).toBe(true)
    await act(async () => {})

    expect(ui.calls).toEqual([{
      workspaceId: WS,
      content: '  useful answer  ',
      agentVisible: false,
      source: { kind: 'message', sessionId: SESSION, sourceEventSeq: 7 },
    }])
    expect(save.dataset.active).toBe('true')
    expect(ui.getByRole('status').textContent).toBe(zh['msg.saved'])
  })

  it('returns to idle with the transport copy after a carrier failure', async () => {
    const ui = mount({
      workspaceId: WS,
      create: () => Promise.resolve({ ok: false, error: { code: 'ECONNRESET', message: 'stream died' } }),
    })
    const save = ui.getByRole('button', { name: zh['msg.save'] }) as HTMLButtonElement

    fireEvent.click(save)
    await act(async () => {})

    expect(save.disabled).toBe(false)
    expect(save.dataset.active).toBeUndefined()
    expect(ui.getByRole('status').textContent).toBe(zh['error.transport'])
  })

  it('localizes a business failure onto the generic save copy', async () => {
    const ui = mount({
      workspaceId: WS,
      create: () => Promise.resolve({ ok: true, value: { ok: false, error: { code: 'content-too-large', maxBytes: 10, actualBytes: 99 } } }),
    })

    fireEvent.click(ui.getByRole('button', { name: zh['msg.save'] }))
    await act(async () => {})

    expect(ui.getByRole('status').textContent).toBe(zh['msg.failed'])
  })
})
