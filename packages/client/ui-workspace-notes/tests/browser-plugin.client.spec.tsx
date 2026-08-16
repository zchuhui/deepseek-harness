// @vitest-environment jsdom
/**
 * ui-workspace-notes browser half on a real cordis Context with fake
 * slots/remote faces: the plugin registers the workbench tab and the
 * save-message action, lazily creates one manager per workspace (its baseline
 * read starting at creation), routes forwarded `workspace-notes/changed`
 * frames to the addressed workspace only, marks every live manager stale on
 * connection loss and repulls on reset, and withdraws both registrations with
 * the plugin fiber (HMR safety). The node half and the invariant companion
 * are exercised over the same Context.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { WorkspaceNotesChanged } from '@deepseek-ai/dsh-workspace-notes/types'
import { en, zh } from '../src/client/locales.ts'
import type { WorkspaceNotesInjected } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(cleanup)

const ws = (k: string): WorkspaceId => k as WorkspaceId

/**
 * Remote service double: records `$on` subscriptions and hands dispatched
 * frames to the live listener set, standing in for the Gateway's fan-out.
 */
class RemoteService extends Service {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  constructor(serviceCtx: Context) {
    super(serviceCtx, 'remote')
  }

  $on(event: string, listener: (...args: never[]) => void): () => void {
    let set = this.listeners.get(event)
    if (set === undefined) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as (...args: unknown[]) => void)
    return () => { set.delete(listener as (...args: unknown[]) => void) }
  }

  dispatch(event: string, args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args)
  }
}

/** Boot the plugin over fake faces; the Remote namespace records every call. */
async function bench() {
  const ctx = new Context()
  const openDetails = vi.fn()
  const list = vi.fn((_request: unknown) => Promise.resolve({ ok: true as const, value: { ok: true as const, value: { notes: [] } } }))
  const remote = new RemoteService(ctx)
  ctx.provide('remote.workspaceNotes', {
    list,
    create: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: {} } }),
    update: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: {} } }),
    delete: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: { absent: true as const } } }),
  } as never)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.workbench.tab': { kind: 'list', scope: 'root' },
      'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('layout', { openDetails } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  const entry = (key: 'conversation.workbench.tab' | 'conversation.chat.assistant-actions') => {
    const found = ctx.slots.entries(key)[0]
    if (found === undefined) return undefined
    return {
      ...found.options,
      locale: found.locale,
      inject: found.inject as unknown as (() => WorkspaceNotesInjected) | undefined,
    }
  }
  return {
    ctx,
    fiber,
    openDetails,
    list,
    dispatch: (change: WorkspaceNotesChanged) => { remote.dispatch('workspace-notes/changed', [change]) },
    tab: () => entry('conversation.workbench.tab'),
    action: () => entry('conversation.chat.assistant-actions'),
  }
}

describe('ui-workspace-notes browser plugin', () => {
  it('registers the workbench tab with the documented id, order, locale, and live label', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.tab()).toMatchObject({ id: 'notes', order: 10, locale: 'notes' })
    // The label follows the active locale (jsdom defaults to en, not zh).
    const active = b.ctx.locale.getSnapshot().active
    expect((b.tab()?.label as () => string)()).toBe((active === 'zh' ? zh : en)['tab.notes'])
  })

  it('opens the workbench when the optional tab becomes available', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.openDetails).toHaveBeenCalledTimes(1)
  })

  it('registers the save-message action after the feedback entry band', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.action()).toMatchObject({ id: 'note', order: 20, locale: 'notes' })
    expect(b.action()?.inject).toBeTypeOf('function')
  })

  it('creates one manager per workspace lazily, sharing it across both entries', async () => {
    const b = await bench()
    await b.fiber.await()

    const tabFace = b.tab()!.inject!()
    const actionFace = b.action()!.inject!()
    expect(tabFace.managerFor(ws('w1'))).toBe(actionFace.managerFor(ws('w1')))
    expect(tabFace.managerFor(ws('w1'))).not.toBe(tabFace.managerFor(ws('w2')))
    // Creation starts the baseline read; the second address reuses it.
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })
  })

  it('routes a changed frame to the addressed workspace only', async () => {
    const b = await bench()
    await b.fiber.await()
    const face = b.tab()!.inject!()
    face.managerFor(ws('w1'))
    face.managerFor(ws('w2'))
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })

    b.dispatch({ workspaceId: ws('w1'), revision: 1 })
    b.dispatch({ workspaceId: ws('w-none'), revision: 1 })
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(3) })

    expect(b.list.mock.calls.map(call => call[0])).toEqual([
      { workspaceId: ws('w1') },
      { workspaceId: ws('w2') },
      { workspaceId: ws('w1') },
    ])
  })

  it('marks live managers stale on connection loss and repulls them on reset', async () => {
    const b = await bench()
    await b.fiber.await()
    const manager = b.tab()!.inject!().managerFor(ws('w1'))
    await vi.waitFor(() => { expect(manager.getSnapshot().status).toBe('ready') })

    b.ctx.emit('connection/reconnecting')
    expect(manager.getSnapshot().stale).toBe(true)

    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })
    expect(manager.getSnapshot().stale).toBe(false)
  })

  it('withdraws both registrations and stops frame routing with the plugin fiber', async () => {
    const b = await bench()
    await b.fiber.await()
    const manager = b.tab()!.inject!().managerFor(ws('w1'))
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(1) })

    await b.fiber.dispose()

    expect(b.ctx.slots.entries('conversation.workbench.tab')).toHaveLength(0)
    expect(b.ctx.slots.entries('conversation.chat.assistant-actions')).toHaveLength(0)
    b.dispatch({ workspaceId: ws('w1'), revision: 1 })
    await Promise.resolve()
    expect(b.list).toHaveBeenCalledTimes(1)
    // The dropped manager keeps serving its last committed view.
    expect(manager.getSnapshot().status).toBe('ready')
  })

  it('re-registers cleanly when the plugin is reloaded', async () => {
    const b = await bench()
    await b.fiber.await()
    await b.fiber.dispose()

    const reloaded = b.ctx.plugin({ inject: [...inject], apply })
    await reloaded.await()

    expect(b.ctx.slots.entries('conversation.workbench.tab')).toHaveLength(1)
    expect(b.ctx.slots.entries('conversation.chat.assistant-actions')).toHaveLength(1)
  })

  it('the node half applies without host-side behavior', () => {
    // The invariant companion is mounted by the vitest-wide invariant host on
    // every Context this suite creates; its registration is covered there.
    expect(() => { nodeApply() }).not.toThrow()
  })
})
