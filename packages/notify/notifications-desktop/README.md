# @deepseek-ai/dsh-notifications-desktop

English | [中文](README.zh.md)

Desktop provider for the [notification seam](../notifications/README.md): delivers each notification as a native toast through the desktop shell bridge. It fails loud at load when the bridge environment (`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`) is missing, so a composition row cannot silently degrade to no notifications.

## Config

| Key | Default | Meaning |
|---|---|---|
| `bridgeUrl` | shell-exported env | Bridge URL override |
| `bridgeToken` | shell-exported env | Bridge token override |
| `timeoutMs` | 5000 | Per-request timeout |

## Model Experience

None, as the provider renders operator notifications through the desktop shell; nothing here reaches a model request or the session log.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No click-through** — toasts carry text only; navigation back to a session needs the desktop shell's deep-link milestone.
- **No delivery acknowledgement** — the shell only proves the toast request was accepted, not that the OS showed it.
