# @deepseek-ai/dsh-notifications-windows

English | [中文](README.zh.md)

Windows toast provider for the [notification seam](../notifications/README.md): renders each notification as a native toast through Windows PowerShell 5.1 WinRT interop, spawned without a shell through `dsh-native-command`. Title, body, and AppUserModelID are embedded as escaped literals into an `-EncodedCommand` payload, so operator text never reaches a shell quoting boundary.

## Config

| Key | Default | Meaning |
|---|---|---|
| `appId` | PowerShell's own AppUserModelID | Identity toasts show under; a custom value must be a registered app identity |
| `powershell` | `powershell.exe` | Launcher executable name |

Delivery rejects on non-win32 platforms and on runner failure (nonzero exit or spawn error); compose `dsh-notifications-terminal` on other platforms.

## Model Experience

None, as the provider renders operator notifications through the OS; nothing here reaches a model request or the session log.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **PowerShell 5.1 only** — the WinRT script targets the inbox `powershell.exe`; pwsh 7 is not used.
- **No toast click-through** — the toast carries text only; navigation back to a session needs the desktop shell milestone.
- **No delivery acknowledgement** — a shown toast is not confirmed by the OS; the runner only proves PowerShell exited cleanly.
