# @deepseek-ai/dsh-updater

English | [中文](README.zh.md)

The update capability seam for the DeepSeek Harness. The abstract `UpdateService` (`ctx.updater`) is its Service Definition. A provider supplies the actual update source and application mechanism behind three operations: `state()` returns a synchronous snapshot of one channel's last observed facts without any network work; `check(signal?)` explicitly triggers one check and returns the post-check snapshot; `apply(version, signal?)` applies one offered update. A channel is a branded `UpdateChannel` — the `updateChannel(value)` factory rejects empty, multi-line, and whitespace-bearing names at construction, so a misconfigured channel fails loud at load rather than at check time.

An `UpdateState` snapshot carries the channel, the installed `currentVersion` (or `null` when nothing is installed), and three optional facts: `checkedAt` (absent before the first check), `available` (the offered `{ version, publishedAt }`, `null` when a check confirmed the installed version is already the latest, and absent before any check), and `lastFailure` (the last check failure and when it happened, absent while none has failed). The seam defines no Cordis events and no plugin config. A provider registers itself as `ctx.updater` by extending `UpdateService`; one implementation per context, so loading a second throws, cordis' standard duplicate-service behavior. The no-op provider is [`@deepseek-ai/dsh-updater-manual`](../updater-manual/README.md).

## Model Experience

None, as the seam reports update state to host and provider code only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request, so it contributes nothing to any model request's token stream or cache prefix.

## Known Limitations and Deferred Work

- **No bundled provider** — the seam declares the capability but ships no implementation, so a composition must load a provider such as `@deepseek-ai/dsh-updater-manual`; the seam itself cannot select one at runtime.
- **Poll-only availability** — update availability is discovered by calling `state()`/`check()`, never pushed through a Cordis event, so a consumer must poll to notice a change.
