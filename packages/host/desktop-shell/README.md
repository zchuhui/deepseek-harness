# @deepseek-ai/dsh-host-desktop-shell

English | [中文](README.zh.md)

Desktop-shell bridge provider for the [desktop-host seam](../desktop/README.md): implements `ctx.desktopHost` by forwarding window reporting and settings read/write to the desktop shell bridge. It fails loud at load when the bridge environment (`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`) is missing, so a composition row cannot silently degrade to no host control.

## Config

| Key | Default | Meaning |
|---|---|---|
| `bridgeUrl` | shell-exported env | Bridge URL override |
| `bridgeToken` | shell-exported env | Bridge token override |
| `timeoutMs` | 5000 | Per-request timeout |

## Model Experience

None, as the provider forwards window reporting and settings to the desktop shell; nothing here reaches a model request or the session log.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No file fallback** — the provider reads and writes only through the shell bridge; there is no file or environment fallback for `closeToTray`/`launchAtLogin`.
- **Bridge-dependent writes** — `setSettings` and `reportWindow` reject while the shell is unreachable.
