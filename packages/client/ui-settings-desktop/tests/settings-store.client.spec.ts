/** Desktop settings store: init shape, the accept/setField/markUnavailable
 * actions, and getSnapshot/subscribe. */
import { describe, expect, it, vi } from 'vitest'
import { createDesktopSettingsStore } from '../src/client/settings-store.ts'

const SETTINGS = { closeToTray: true, launchAtLogin: false }

describe('createDesktopSettingsStore', () => {
  it('init shape: loading with both flags false', () => {
    const store = createDesktopSettingsStore().create()
    expect(store.getSnapshot()).toEqual({ status: 'loading', closeToTray: false, launchAtLogin: false })
  })

  it('accept adopts an authoritative document as ready', () => {
    const store = createDesktopSettingsStore().create()
    store.actions.accept(SETTINGS)
    expect(store.getSnapshot()).toEqual({ status: 'ready', closeToTray: true, launchAtLogin: false })
  })

  it('setField optimistically updates one key', () => {
    const store = createDesktopSettingsStore().create()
    store.actions.accept(SETTINGS)
    store.actions.setField('launchAtLogin', true)
    expect(store.getSnapshot()).toMatchObject({ closeToTray: true, launchAtLogin: true })
    store.actions.setField('closeToTray', false)
    expect(store.getSnapshot()).toMatchObject({ closeToTray: false, launchAtLogin: true })
  })

  it('markUnavailable flips the status', () => {
    const store = createDesktopSettingsStore().create()
    store.actions.accept(SETTINGS)
    store.actions.markUnavailable()
    expect(store.getSnapshot().status).toBe('unavailable')
  })

  it('getSnapshot and subscribe follow state changes', () => {
    const store = createDesktopSettingsStore().create()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    store.actions.accept(SETTINGS)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().status).toBe('ready')
    off()
    store.actions.markUnavailable()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
