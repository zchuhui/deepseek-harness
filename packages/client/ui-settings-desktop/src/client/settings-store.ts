/**
 * Desktop-shell settings store: the loopback desktop RPC document mirrored as
 * the two General rows' shared store seat. The apply-world controller is the
 * only writer (reads and accepted writes); the row components read through
 * props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** A desktop-shell preference key. */
export type DesktopSettingKey = 'closeToTray' | 'launchAtLogin'

/** The desktop-shell settings document (the complete wire value). */
export interface DesktopSettings {
  /** Close the main window to the tray instead of quitting. */
  closeToTray: boolean
  /** Start on login (Windows only). */
  launchAtLogin: boolean
}

/** Store state: availability plus the two settings values. */
export interface DesktopSettingsSnapshot {
  /** Wire availability: loading until the first read settles, then ready or unavailable. */
  status: 'loading' | 'ready' | 'unavailable'
  closeToTray: boolean
  launchAtLogin: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type DesktopSettingsActions = {
  /** Adopt an authoritative settings document (a read or an accepted write). */
  accept: (draft: DesktopSettingsSnapshot, settings: DesktopSettings) => void
  /** Optimistically set one key ahead of the wire write. */
  setField: (draft: DesktopSettingsSnapshot, key: DesktopSettingKey, next: boolean) => void
  /** Mark the desktop settings surface unavailable. */
  markUnavailable: (draft: DesktopSettingsSnapshot) => void
}

/** The registrant business face: the write path plus the host-platform flag. */
export interface DesktopSettingsInjected {
  /** Optimistically toggle one key, then persist it through the desktop RPC. */
  toggle: (key: DesktopSettingKey, next: boolean) => void
  /** Whether the host OS is Windows (gates the launch-at-login row). */
  isWindows: boolean
}

/**
 * Declares the desktop-shell settings state and write surface.
 * @returns the store handle shared by both General rows.
 */
export function createDesktopSettingsStore(): EngineStoreHandle<DesktopSettingsSnapshot, DesktopSettingsActions> {
  return defineStore({
    init: (): DesktopSettingsSnapshot => ({ status: 'loading', closeToTray: false, launchAtLogin: false }),
    actions: {
      accept: (d, settings) => {
        d.status = 'ready'
        d.closeToTray = settings.closeToTray
        d.launchAtLogin = settings.launchAtLogin
      },
      setField: (d, key, next) => { d[key] = next },
      markUnavailable: (d) => { d.status = 'unavailable' },
    },
  })
}
