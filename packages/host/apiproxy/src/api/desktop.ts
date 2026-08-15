/**
 * desktop domain contract. The desktop shell settings and window-reporting
 * surface; served only when the host composes the desktop host service.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Desktop-shell settings and window-reporting methods. */
export interface DesktopApi {
  /**
   * Read the shell's settings document (close-to-tray and launch-at-login
   * flags). A plain `dsh web` deployment (no desktop host service composed)
   * answers `desktop-unavailable`.
   */
  getSettings(
    request: RpcRequest<{}>,
  ): Promise<RpcResponse<{ closeToTray: boolean; launchAtLogin: boolean }>>

  /**
   * Apply a partial settings document; omitted fields keep their current
   * values. Answers the complete updated document.
   */
  setSettings(
    request: RpcRequest<{ closeToTray?: boolean; launchAtLogin?: boolean }>,
  ): Promise<RpcResponse<{ closeToTray: boolean; launchAtLogin: boolean }>>
}
