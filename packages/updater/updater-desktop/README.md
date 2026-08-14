# @deepseek-ai/dsh-updater-desktop

English | [中文](README.zh.md)

Desktop provider for the [update seam](../updater/README.md): `state()` returns the last known snapshot (a cached object replaced wholesale by each `check()`, never mutated), `check()` fetches the shell's wire state, and `apply()` forwards to the shell — which answers 501 until the release milestone implements real downloads. Fails loud at load when the bridge environment (`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`) is missing, and brands the shell-reported channel through `updateChannel`, so an invalid channel also fails loud.

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

- **No download or install** — the shell skeleton answers `apply` with 501; real Tauri Updater wiring belongs to the release milestone.
- **Poll-only availability** — `state()` reads the cache; freshness depends on callers invoking `check()`.
