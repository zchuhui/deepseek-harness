# @deepseek-ai/dsh-credentials-desktop

English | [中文](README.zh.md)

Desktop keychain provider for the [credential seam](../credentials/README.md): resolves references through the desktop shell bridge, layered as process environment (read-only, wins) over the keychain (provider-managed, writable). A non-empty environment value shadows the keychain, and `set`/`unset` reject while it shadows — the seam-wide fail-loud rule. An empty stored or environment value is absent everywhere. Fails loud at load when the bridge environment (`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`) is missing.

## Config

| Key | Default | Meaning |
|---|---|---|
| `bridgeUrl` | shell-exported env | Bridge URL override |
| `bridgeToken` | shell-exported env | Bridge token override |
| `timeoutMs` | 5000 | Per-request timeout |

## Model Experience

None, as the provider resolves credentials at the operation boundary for host consumers; secret values never reach a model request or the session log.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No file fallback layers** — unlike the local provider, the desktop provider layers only environment over keychain; project and user `.env` fallbacks stay with `dsh-credentials-local`.
- **Bridge-dependent writes** — with the shell unreachable, `describe` reports `writable: false` and `set`/`unset` reject.
