// @vitest-environment jsdom
/**
 * ui-workspace-todos browser half on a real cordis Context with fake
 * slots/remote faces: the plugin registers the workbench tab, lazily creates
 * one manager per workspace (its baseline read starting at creation), routes
 * forwarded `workspace-todos/changed` frames to the addressed workspace only,
 * marks every live manager stale on connection loss and repulls on reset, and
 * withdraws the registration with the plugin fiber (HMR safety). The node
 * half and the invariant companion are exercised over the same Context.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SharedTodosChanged } from '@deepseek-ai/dsh-workspace-todos/types'
import { en, zh } from '../src/client/locales.ts'
import type { WorkspaceTodosInjected } from '../src/client/slots.ts'
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
  const list = vi.fn((_request: unknown) => Promise.resolve({ ok: true as const, value: { ok: true as const, value: { todos: [] } } }))
  const remote = new RemoteService(ctx)
  ctx.provide('remote.workspaceTodos', {
    list,
    create: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: {} } }),
    updateContent: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: {} } }),
    setStatus: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: {} } }),
    assign: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: {} } }),
    delete: () => Promise.resolve({ ok: true as const, value: { ok: true as const, value: { absent: true as const } } }),
  } as never)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.workbench.tab': { kind: 'list', scope: 'root' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('sessions', {
    scope: () => undefined,
    open: () => {},
  } as never)
  ctx.provide('layout', { openDetails } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  const entry = () => {
    const found = ctx.slots.entries('conversation.workbench.tab')[0]
    if (found === undefined) return undefined
    return {
      ...found.options,
      locale: found.locale,
      inject: found.inject as unknown as (() => WorkspaceTodosInjected) | undefined,
    }
  }
  return {
    ctx,
    fiber,
    openDetails,
    list,
    dispatch: (change: SharedTodosChanged) => { remote.dispatch('workspace-todos/changed', [change]) },
    tab: entry,
  }
}

describe('ui-workspace-todos browser plugin', () => {
  it('registers the workbench tab with the documented id, order, locale, and live label', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.tab()).toMatchObject({ id: 'todos', order: 20, locale: 'todos' })
    // The label follows the active locale (jsdom defaults to en, not zh).
    const active = b.ctx.locale.getSnapshot().active
    expect((b.tab()?.label as () => string)()).toBe((active === 'zh' ? zh : en)['tab.todos'])
  })

  it('opens the workbench when the optional tab becomes available', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.openDetails).toHaveBeenCalledTimes(1)
  })

  it('creates one manager per workspace lazily and starts the baseline at creation', async () => {
    const b = await bench()
    await b.fiber.await()

    const face = b.tab()!.inject!()
    const w1 = face.managerFor(ws('w1'))
    expect(face.managerFor(ws('w1'))).toBe(w1)
    expect(face.managerFor(ws('w2'))).not.toBe(w1)
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })
    expect(face.actions).toBeTypeOf('object')
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

  it('withdraws the registration and stops frame routing with the plugin fiber', async () => {
    const b = await bench()
    await b.fiber.await()
    const manager = b.tab()!.inject!().managerFor(ws('w1'))
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(1) })

    await b.fiber.dispose()

    expect(b.ctx.slots.entries('conversation.workbench.tab')).toHaveLength(0)
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
  })

  it('the node half applies without host-side behavior', () => {
    // The invariant companion is mounted by the vitest-wide invariant host on
    // every Context this suite creates; its registration is covered there.
    expect(() => { nodeApply() }).not.toThrow()
  })
})
