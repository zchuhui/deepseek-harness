/** Contract behavior the seam itself owns: registration identity and typed methods. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DesktopHost } from '../src/index.ts'
import type { DesktopSettingsDoc } from '../src/index.ts'

/** Minimal concrete host: all a subclass owes the abstract class is the three methods. */
class StubHost extends DesktopHost {
  lastWindow: { label: string; sessionId: string | null } | null = null
  settings: DesktopSettingsDoc = { closeToTray: false, launchAtLogin: false }

  reportWindow(label: string, sessionId: string | null): Promise<void> {
    this.lastWindow = { label, sessionId }
    return Promise.resolve()
  }

  getSettings(): Promise<DesktopSettingsDoc> {
    return Promise.resolve(this.settings)
  }

  setSettings(partial: Partial<DesktopSettingsDoc>): Promise<DesktopSettingsDoc> {
    this.settings = { ...this.settings, ...partial }
    return Promise.resolve(this.settings)
  }
}

describe('DesktopHost seam', () => {
  it('registers a subclass as ctx.desktopHost and leaves with its fiber', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(StubHost)
    await fiber.await()
    expect(ctx.get('desktopHost')).toBeInstanceOf(StubHost)
    await fiber.dispose()
    expect(ctx.get('desktopHost')).toBeUndefined()
  })

  it('round-trips window reporting and settings through the abstract contract', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(StubHost)
    await fiber.await()
    const host = ctx.get('desktopHost') as StubHost

    await host.reportWindow('main', 'sess-1')
    expect(host.lastWindow).toEqual({ label: 'main', sessionId: 'sess-1' })
    await host.reportWindow('main', null)
    expect(host.lastWindow).toEqual({ label: 'main', sessionId: null })

    await expect(host.getSettings()).resolves.toEqual({ closeToTray: false, launchAtLogin: false })
    await expect(host.setSettings({ launchAtLogin: true })).resolves.toEqual({ closeToTray: false, launchAtLogin: true })

    await fiber.dispose()
  })
})
