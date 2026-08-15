# @deepseek-ai/dsh-updater-desktop

English | [中文](README.zh.md)

Desktop provider for the [update seam](../updater/README.md): `state()` returns the last known snapshot (a cached object replaced wholesale by each `check()`, never mutated), `check()` fetches the shell's wire state, and `apply()` forwards to the shell — which runs the real Tauri Updater: download, minisign verification, install, restart. Fails loud at load when the bridge environment (`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`) is missing, and brands the shell-reported channel through `updateChannel`, so an invalid channel also fails loud.

## Config

| Key | Default | Meaning |
|---|---|---|
| `bridgeUrl` | shell-exported env | Bridge URL override |
| `bridgeToken` | shell-exported env | Bridge token override |
| `timeoutMs` | 5000 | Per-request timeout |
| `channel` | `manual` | Channel reported before the first check |

## Model Experience

None, as the provider reports update state to host and shell code only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Production hosting required** — the shell checks and downloads against its configured endpoint; the local loop self-hosts on the shell's bridge, while a production deployment must host the manifest and signed installer on HTTPS and rotate the signing key (a release action, not a code gap).
- **Poll-only availability** — `state()` reads the cache; freshness depends on callers invoking `check()`.
