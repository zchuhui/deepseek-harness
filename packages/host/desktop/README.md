# @deepseek-ai/dsh-host-desktop

English | [中文](README.zh.md)

The desktop shell host control is a capability seam. The abstract `DesktopHost` service (`ctx.desktopHost`) is its Service Definition. Its three methods drive the shell's native window registry and persisted settings: `reportWindow(label, sessionId)` records the session one window now shows, so a deep link focuses the owning window; `getSettings()` and `setSettings(partial)` read and write the shell-persisted `closeToTray` / `launchAtLogin` flags (`DesktopSettingsDoc`). The shell owns the native window set and the persisted settings; this package declares the contract providers implement over the shell bridge ([`-shell`](../desktop-shell/README.md)), so callers never depend on one transport.

## Model Experience

None, as the seam serves the host's window and settings control; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Provider fails loud without the shell bridge** — the only provider, [`-shell`](../desktop-shell/README.md), throws at load when `DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN` are missing.
- **Desktop deployment only** — the seam drives the desktop shell's window registry and persisted settings; non-desktop hosts have no equivalent capability to control.
