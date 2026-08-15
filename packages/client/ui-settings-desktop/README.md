# @deepseek-ai/dsh-client-ui-settings-desktop

English | [中文](README.zh.md)

Desktop-shell settings browser rows for the General settings section. Two switch rows — close-to-tray and launch-at-login — read and write the desktop shell's settings document through the loopback-only `desktop` RPC domain (`desktop.getSettings` / `desktop.setSettings`). A plain `dsh web` deployment composes no desktop host service, and remote browsers cannot reach the privileged desktop methods, so both rows stay hidden whenever the domain answers `desktop-unavailable`, a read fails, or the page authority is not loopback; the launch-at-login row additionally renders only on Windows (read from `navigator.userAgent`). Both rows share one store instance; the controller loads the settings on activation and reconnect, writes each toggle optimistically, and rolls back through a reload when the write fails. The `/client` exports are the plugin body (`apply`/`inject`) plus the store factory and injected-face types.

## Model Experience

None, as the rows manage a browser preference; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Desktop-shell settings are loopback-only** — a remote browser, or a deployment without the desktop host service, sees neither row; the settings themselves live in the shell and this package only renders and writes them.
