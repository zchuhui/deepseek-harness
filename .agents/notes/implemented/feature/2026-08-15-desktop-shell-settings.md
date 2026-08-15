# Agent Note: Desktop shell settings

Status: implemented

English | [中文](2026-08-15-desktop-shell-settings.zh.md)

## Problem

Desktop-specific behaviors were hardcoded: closing the main window always hid it, there was no launch-at-login, and the milestone plan's "desktop settings UI" had no surface at all — the tray menu was static and the bridge had no settings plane.

## Decision

- **One settings document** (`desktop-app/src-tauri/src/settings.rs`): `closeToTray` (default true) and `launchAtLogin` (default false) in `settings.json` under the app config directory. Loads fail loud — an absent file means the defaults, a corrupt file fails the boot with the error window. Writes are atomic (temp file + rename).
- **Apply order is OS side effect → persistence → memory** (`settings::apply`): a failed registry write changes nothing, and the in-memory document updates only at the commit point. `launchAtLogin` maps to the Windows `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `dsh-desktop` (quoted exe path) through `reg.exe`; it is Windows-only and errors off-Windows.
- **The bridge gains a settings plane**: `GET /api/desktop/settings` and `POST /api/desktop/settings` (partial `{ closeToTray?, launchAtLogin? }`, booleans validated, complete updated document answers). The typed client (`packages/util/desktop-bridge`) mirrors both calls.
- **A shell-native settings window**: the tray gains 设置, which opens a bundled `settings.html` window (label "settings", its own capability with `core:default`) driving the new `get_settings`/`set_settings` IPC commands; `withGlobalTauri` is on so the page uses `window.__TAURI__.core.invoke`.
- **The close handler reads the setting**: close-to-tray on hides the main window; off sets the quit flag and exits.

## Alternatives considered

- **A settings page inside the web GUI** (host seam + client plugin). Deferred: it needs a new host API plane and client slot work with the GUI's test gates; the shell-native window delivers the setting surface today, and the bridge plane stays for the later host-side integration.
- **Failing the whole app on a corrupt settings file.** Rejected in favor of the error-window path the runtime-failure boot already uses — same visibility, but the shell still shows the reason.
- **A keyring or registry-backed store per field.** Rejected: one JSON document with atomic writes is the smallest mechanism that holds both fields and stays diffable.

## Consequences

- The tray menu now reads 显示窗口 / 新建窗口 / 打开最新通知 / 设置 / 退出; the settings window edits close-to-tray and launch-at-login live and persists atomically.
- `launchAtLogin` is Windows-only; macOS/Linux start-at-login stays with those platforms' milestones (README Known Limitations updated).
- The bridge settings plane is host-consumable, so a future web-GUI settings page can reuse the typed client without shell changes.

Related: [desktop multi-window orchestration](2026-08-15-desktop-multi-window-orchestration.md).
