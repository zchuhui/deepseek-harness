/**
 * Desktop-shell settings plugin, browser half: registers two General-section
 * rows — close-to-tray and launch-at-login — over the loopback-only desktop
 * RPC domain. A remote browser cannot reach the privileged desktop methods,
 * so both rows stay hidden; the launch-at-login row additionally gates on the
 * host OS being Windows.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the settings slot types (this package registers General rows).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CloseToTrayRow } from './CloseToTrayRow.tsx'
import { LaunchAtLoginRow } from './LaunchAtLoginRow.tsx'
import { en, zh, type DesktopLocaleKey } from './locales.ts'
import {
  createDesktopSettingsStore, type DesktopSettingKey, type DesktopSettings,
  type DesktopSettingsInjected,
} from './settings-store.ts'

export type { DesktopSettingsInjected } from './settings-store.ts'
export type {
  DesktopSettingKey, DesktopSettings, DesktopSettingsSnapshot,
} from './settings-store.ts'
export type { DesktopLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The desktop-shell settings rows' copy. */
    'settings.desktop': DesktopLocaleKey
  }
}

/** Namespace owning this feature's settings-row copy. */
export const SETTINGS_NS = 'settings.desktop'

/** Required services: slot registration plus the desktop settings transport. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Whether the host OS is Windows, read from the webview's navigator (it runs
 * on the host OS). Non-browser runs report false; tests stub navigator.
 */
function isWindowsHost(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
}

/**
 * Client plugin body: register the two desktop-shell settings rows once the
 * General section's item slot exists. Both rows share one store instance; the
 * controller loads the settings on activation and reconnect, and writes each
 * toggle through the loopback-only desktop RPC, rolling back through a reload
 * when a write fails.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-settings-desktop: dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const store = createDesktopSettingsStore()

  // Controller state: the last authoritative document and availability, so a
  // late-bound store (rows render after the first read settles) still syncs.
  let disposed = false
  let bound: BoundActions<typeof store> | undefined
  let available = false
  let resolved: DesktopSettings | undefined

  const publish = (): void => {
    if (bound === undefined) return
    if (!available) bound.markUnavailable()
    else if (resolved !== undefined) bound.accept(resolved)
  }

  const reload = async (): Promise<void> => {
    if (disposed || !connection.isLoopback) return
    try {
      const response = await connection.api.desktop.getSettings({})
      if (disposed) return
      if (response.result.ok) {
        available = true
        resolved = response.result.value
      } else {
        available = false
        resolved = undefined
      }
    } catch (_desktopReadFailure) {
      if (disposed) return
      available = false
      resolved = undefined
    }
    publish()
  }

  const toggle = (key: DesktopSettingKey, next: boolean): void => {
    if (!connection.isLoopback) return
    bound?.setField(key, next)
    const partial: { closeToTray?: boolean; launchAtLogin?: boolean } = {}
    partial[key] = next
    void connection.api.desktop.setSettings(partial).then((response) => {
      if (disposed) return
      if (response.result.ok) {
        available = true
        resolved = response.result.value
        publish()
      } else {
        void reload()
      }
    }).catch((_desktopWriteFailure: unknown) => {
      if (!disposed) void reload()
    })
  }

  if (connection.isLoopback) void reload()

  ctx.effect(() => {
    const off = ctx.on('connection/reset', () => { void reload() })
    return () => {
      off()
      disposed = true
    }
  }, 'ui-settings-desktop: settings invalidations')

  const injected = (actions: BoundActions<typeof store>): DesktopSettingsInjected => {
    bound = actions
    // Re-sync so a read that settled before first render is not lost.
    publish()
    return { toggle, isWindows: isWindowsHost() }
  }

  ctx.slots.inject('settings.general.item', function* () {
    yield ctx.slots.register({
      name: 'settings.general.item',
      id: 'desktop-close-to-tray',
      order: 2,
      store,
      locale: SETTINGS_NS,
      inject: injected,
    }, CloseToTrayRow)
    yield ctx.slots.register({
      name: 'settings.general.item',
      id: 'desktop-launch-at-login',
      order: 3,
      store,
      locale: SETTINGS_NS,
      inject: injected,
    }, LaunchAtLoginRow)
  })
}
