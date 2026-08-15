/** `settings.desktop` namespace dictionaries (the desktop-shell rows' copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'desktop.closeToTray.title': '关闭到托盘',
  'desktop.closeToTray.description': '关闭主窗口时隐藏到托盘而不是退出',
  'desktop.launchAtLogin.title': '开机自启',
  'desktop.launchAtLogin.description': '登录 Windows 后自动启动 DeepSeek Harness',
} satisfies Record<string, string>

/** The settings.desktop namespace key union. */
export type DesktopLocaleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'desktop.closeToTray.title': 'Close to tray',
  'desktop.closeToTray.description': 'Hide to the system tray instead of quitting when the main window closes',
  'desktop.launchAtLogin.title': 'Launch at login',
  'desktop.launchAtLogin.description': 'Start DeepSeek Harness automatically after signing in to Windows',
} satisfies Record<DesktopLocaleKey, string>
