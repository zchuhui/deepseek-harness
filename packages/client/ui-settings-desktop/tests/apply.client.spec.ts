// @vitest-environment jsdom
/** ui-settings-desktop browser half: two General rows over the loopback
 * desktop RPC — registration, load, toggle write + rollback, platform gating,
 * and HMR-safe disposal. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import {
  apply, inject, SETTINGS_NS,
} from '@deepseek-ai/dsh-client-ui-settings-desktop/client'
import type { DesktopSettingsInjected } from '@deepseek-ai/dsh-client-ui-settings-desktop/client'
import { CloseToTrayRow } from '../src/client/CloseToTrayRow.tsx'
import { LaunchAtLoginRow } from '../src/client/LaunchAtLoginRow.tsx'
import { createDesktopSettingsStore } from '../src/client/settings-store.ts'

const SLOT = 'settings.general.item'

function ok<T>(value: T) {
  return { rpcId: 'test', result: { ok: true as const, value } }
}

function settings(closeToTray: boolean, launchAtLogin: boolean) {
  return { closeToTray, launchAtLogin }
}

function declareItems(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

async function bench(overrides: {
  isLoopback?: boolean
  getSettings?: () => Promise<unknown>
  setSettings?: (payload: { closeToTray?: boolean; launchAtLogin?: boolean }) => Promise<unknown>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const getSettings = overrides.getSettings ?? (() => Promise.resolve(ok(settings(false, false))))
  const setSettings = overrides.setSettings ?? (() => Promise.resolve(ok(settings(false, false))))
  ctx.provide('connection', {
    api: { desktop: { getSettings, setSettings } },
    isLoopback: overrides.isLoopback ?? true,
  } as never)
  declareItems(ctx.slots)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, getSettings, setSettings }
}

/** Mirror the framework: bake an instance from the entry's handle and feed its
 * actions to the entry's inject factory (the sanctioned zero-machinery path). */
function faceOf(ctx: Context, component: unknown) {
  const entry = ctx.slots.entries(SLOT).find(e => e.component === component)!
  const handle = entry.store as ReturnType<typeof createDesktopSettingsStore>
  const instance = handle.create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => DesktopSettingsInjected)(instance.actions)
  return { entry, instance, face }
}

describe('ui-settings-desktop apply', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', languages: ['en-US'], language: 'en-US' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('declares the services it injects', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers both rows sharing one store and the settings.desktop locale', async () => {
    const b = await bench()
    const entries = b.ctx.slots.entries(SLOT)
    expect(entries.map(e => e.component)).toEqual([CloseToTrayRow, LaunchAtLoginRow])
    expect(entries.map(e => e.options)).toMatchObject([
      { id: 'desktop-close-to-tray', order: 2 },
      { id: 'desktop-launch-at-login', order: 3 },
    ])
    expect(entries[0]!.store).toBe(entries[1]!.store)
    expect(entries[0]!.locale).toBe(SETTINGS_NS)
    expect(entries[1]!.locale).toBe(SETTINGS_NS)
  })

  it('loads settings and publishes them to the shared store', async () => {
    const getSettings = vi.fn(() => Promise.resolve(ok(settings(true, false))))
    const b = await bench({ getSettings })
    const { instance } = faceOf(b.ctx, CloseToTrayRow)
    await vi.waitFor(() => { expect(instance.getSnapshot()).toMatchObject({ status: 'ready', closeToTray: true, launchAtLogin: false }) })
    expect(getSettings).toHaveBeenCalledOnce()
  })

  it('marks the surface unavailable when the desktop domain is absent', async () => {
    const b = await bench({
      getSettings: () => Promise.resolve({
        rpcId: 'test',
        result: { ok: false as const, error: { code: 'desktop-unavailable', message: 'no desktop', details: {} } },
      }),
    })
    const { instance } = faceOf(b.ctx, CloseToTrayRow)
    await vi.waitFor(() => { expect(instance.getSnapshot().status).toBe('unavailable') })
  })

  it('marks the surface unavailable when the read throws', async () => {
    const b = await bench({ getSettings: () => Promise.reject(new Error('offline')) })
    const { instance } = faceOf(b.ctx, CloseToTrayRow)
    await vi.waitFor(() => { expect(instance.getSnapshot().status).toBe('unavailable') })
  })

  it('toggle writes optimistically then adopts the accepted document', async () => {
    const setSettings = vi.fn((payload: { closeToTray?: boolean; launchAtLogin?: boolean }) =>
      Promise.resolve(ok(settings(payload.closeToTray ?? false, payload.launchAtLogin ?? false))))
    const b = await bench({ setSettings })
    const { instance, face } = faceOf(b.ctx, CloseToTrayRow)
    await vi.waitFor(() => { expect(instance.getSnapshot().status).toBe('ready') })
    face.toggle('closeToTray', true)
    expect(instance.getSnapshot().closeToTray).toBe(true)
    await vi.waitFor(() => { expect(setSettings).toHaveBeenCalledWith({ closeToTray: true }) })
    expect(instance.getSnapshot().closeToTray).toBe(true)
  })

  it('rolls back through a reload when the write fails', async () => {
    const getSettings = vi.fn(() => Promise.resolve(ok(settings(false, false))))
    const setSettings = vi.fn(() => Promise.resolve({
      rpcId: 'test',
      result: { ok: false as const, error: { code: 'desktop-unavailable', message: 'write failed', details: {} } },
    }))
    const b = await bench({ getSettings, setSettings })
    const { instance, face } = faceOf(b.ctx, CloseToTrayRow)
    await vi.waitFor(() => { expect(instance.getSnapshot().status).toBe('ready') })
    face.toggle('closeToTray', true)
    expect(instance.getSnapshot().closeToTray).toBe(true)
    await vi.waitFor(() => { expect(instance.getSnapshot().closeToTray).toBe(false) })
    expect(getSettings).toHaveBeenCalledTimes(2)
  })

  it('reloads on connection reset', async () => {
    const getSettings = vi.fn(() => Promise.resolve(ok(settings(false, false))))
    const b = await bench({ getSettings })
    await vi.waitFor(() => { expect(getSettings).toHaveBeenCalledTimes(1) })
    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(getSettings).toHaveBeenCalledTimes(2) })
  })

  it('injects isWindows from the navigator platform', async () => {
    const b = await bench()
    const { face } = faceOf(b.ctx, LaunchAtLoginRow)
    expect(face.isWindows).toBe(false)

    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', languages: ['en-US'], language: 'en-US' })
    const b2 = await bench()
    const windows = faceOf(b2.ctx, LaunchAtLoginRow)
    expect(windows.face.isWindows).toBe(true)
  })

  it('stays unavailable without a loopback connection', async () => {
    const getSettings = vi.fn()
    const b = await bench({ isLoopback: false, getSettings })
    const { instance } = faceOf(b.ctx, CloseToTrayRow)
    expect(instance.getSnapshot().status).toBe('unavailable')
    expect(getSettings).not.toHaveBeenCalled()
  })

  it('disposal removes both rows (HMR safety)', async () => {
    const b = await bench()
    expect(b.ctx.slots.entries(SLOT)).toHaveLength(2)
    await b.fiber.dispose()
    expect(b.ctx.slots.entries(SLOT)).toHaveLength(0)
  })
})
