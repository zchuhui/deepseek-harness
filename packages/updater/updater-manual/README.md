# @deepseek-ai/dsh-updater-manual

English | [中文](README.zh.md)

The no-op provider for the update seam. It extends `UpdateService` and registers as `ctx.updater`, reporting the configured channel and installed version without obtaining or installing anything. `state()` returns a synchronous snapshot: before any check it reports only the channel and `currentVersion` (`null` when nothing is installed); `check()` records the current timestamp and reports the channel as already latest (`available: null`), since a manual provider has no update source; `apply()` always rejects with `manual updater cannot apply updates; compose a real updater provider`. The provider never populates `lastFailure`.

Config is validated through Schemastery. `channel` (default `manual`) names the update channel, and `currentVersion` (default null, meaning not installed) is the version the snapshot reports. Defaulting is an explicit `resolveSpec(config)` step — an explicit `channel` wins over `manual`, and an explicit `currentVersion` wins over not installed — never a hidden `?? default` inside the service. An invalid channel fails loud at load: `resolveSpec` brands the channel through `updateChannel`, which rejects empty, multi-line, and whitespace-bearing names.

## Model Experience

None, as the manual provider reports update state to host code only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request, so it contributes nothing to any model request's token stream or cache prefix.

## Known Limitations and Deferred Work

- **No download or install** — `apply` always rejects and `check` never consults an update source, so this provider can report state but never actually obtains or installs an update.
- **No signature-verification semantics** — the provider defines no update-authenticity contract (no signature or pinning), so a real provider must add its own before applying anything.
- **No rollback** — `apply` offers no way to revert an applied update, and the manual provider never applies one, so rollback remains a future provider concern.
