/**
 * Service Definition for the `ctx.desktopHost` capability seam: the typed
 * surface through which host plugins drive the desktop shell's native window
 * registry and persisted settings. The shell owns the native window set and
 * the close-to-tray / launch-at-login flags; this package declares the
 * contract providers implement over the shell bridge, so callers never depend
 * on one transport.
 * @module @deepseek-ai/dsh-host-desktop
 */

import { Context, Service } from '@deepseek-ai/cordis'

/** The shell settings document: the two flags the shell persists across runs. */
export interface DesktopSettingsDoc {
  /** Whether closing the main window hides it instead of quitting. */
  closeToTray: boolean
  /** Whether the shell starts at login. */
  launchAtLogin: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopHost: DesktopHost
  }
}

/**
 * Abstract desktop-shell host-control service. Subclass, implement the three
 * methods, and load the subclass as a plugin — it registers as
 * `ctx.desktopHost` (one implementation per context; loading a second throws,
 * cordis' standard duplicate-service behavior).
 */
export abstract class DesktopHost extends Service {
  constructor(ctx: Context) {
    super(ctx, 'desktopHost')
  }

  /**
   * Record the session one window now shows (the client-reported half of the
   * shell's window registry), so a deep link focuses the owning window.
   * @param label - shell window label ("main" or "win-<n>").
   * @param sessionId - session the window shows, or null for none.
   */
  abstract reportWindow(label: string, sessionId: string | null): Promise<void>

  /**
   * Read the shell settings document.
   * @returns the close-to-tray and launch-at-login flags.
   */
  abstract getSettings(): Promise<DesktopSettingsDoc>

  /**
   * Apply a partial settings document; omitted fields keep their values.
   * @param partial - close-to-tray and/or launch-at-login.
   * @returns the complete updated document.
   */
  abstract setSettings(partial: Partial<DesktopSettingsDoc>): Promise<DesktopSettingsDoc>
}

export default DesktopHost
