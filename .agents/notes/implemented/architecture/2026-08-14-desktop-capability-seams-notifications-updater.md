# Agent Note: Desktop-milestone capability seams: notifications and updater

Status: implemented

English | [中文](2026-08-14-desktop-capability-seams-notifications-updater.zh.md)

## Problem

The desktop product plan (a Tauri shell over the dsh web runtime) needs keychain, notification, updater, and directory-picker capabilities, and its first draft placed them inside a Rust “Desktop Bridge” box. The harness rule is the opposite: a capability with more than one consumer belongs on a capability seam (Service Definition / Service Provider / Consumer), so the shell stays one provider instead of the sole entry point, and headless, CLI, and test doubles keep the same semantics. Notification specifically had no home at all — the harness has no external notification channel (`schedule` is session-local, and `ui-sidebar` records that no done/error notification sources exist) — and updates had no channel/state vocabulary.

## Decision

Three seams land in the main repository ahead of any shell work; the Tauri providers slot in later behind the same Service Definitions.

- `ctx.notifications` (`packages/notify/notifications`): abstract `NotificationService`; `notify(notification)` rejects on delivery failure and the seam defines no fallback — consumers own containment so a broken notification cannot break the event dispatch that raised it. `Notification { kind, title, body, sessionId? }` is operator-facing only; nothing reaches the session log or a model request.
- Providers: `notifications-terminal` renders one labelled logger line (the headless default); `notifications-windows` renders a native toast through PowerShell 5.1 WinRT interop spawned via `dsh-native-command`, embedding title/body/appId as escaped literals into an `-EncodedCommand` payload (operator text never reaches a shell quoting boundary) and rejecting on non-win32.
- `notify-events` bridge: job settlements through `ctx.jobs.onJobDone` (the registry delivers completion through service callbacks — jobs emit no Cordis events), waiting approvals and failed turns through durable `approval/asked`/`turn/end` observed via `session/event`, plus `tool-failed` — a category the bridge declaration-merges into `NotificationKindMap`, default off because per-call tool failures are recoverable and frequent. Per-class switches are validated Config; all subscriptions unwind on dispose; delivery failures are contained and logged.
- `ctx.updater` (`packages/updater/updater`): abstract `UpdateService` with `state()`/`check(signal?)`/`apply(version, signal?)`; branded `UpdateChannel` validated at construction (empty, multi-line, or whitespace-bearing names fail loud at load); `UpdateState` carries channel, currentVersion, checkedAt, available, lastFailure. `updater-manual` is the no-op provider whose `apply` always rejects.
- Directory picking adds **no new seam**: `host/directory-picker` already owns the interaction-shape problem (native — including Windows IFileOpenDialog — browse, and adaptive composition). The desktop shell adds its own interaction later through `DirectoryPickerCapabilities` declaration merging. The plan's `ctx.dialogs` is retired, not built.
- A Windows launcher (`scripts/desktop-launch`: `launch.ps1`, `launch.cmd`, README) starts `dsh web` (source, global `dsh`, or a clear error), probes the port, polls readiness, and opens the browser — the stopgap until the shell ships.

## Alternatives considered

- **Rust-only Desktop Bridge (the plan's original shape).** Rejected: one consumer, no headless or test-double path, and it violates the capability-seam rule the repo applies to every swappable capability.
- **Raising on every failed tool call by default.** Rejected: agents routinely fail and recover per call; the opt-in `toolFailed` switch keeps the default quiet.
- **Watching jobs through Cordis events.** Impossible today — settlement reaches observers only through `onJobDone` callbacks; the bridge registers through `ctx.effect` instead.
- **A `ctx.dialogs` seam beside the picker.** Rejected: it duplicates the existing seam's interaction-shape contract; the desktop shell needs a variant, not a second registry.
- **pwsh 7 for toasts.** Rejected: only the inbox `powershell.exe` is guaranteed on Windows.

## Consequences

- The Tauri shell later ships providers behind `ctx.notifications` (native toast, click-through) and `ctx.updater` (Tauri Updater, signature checks, rollback), plus a picker interaction variant — host-side semantics and tests survive the swap.
- All six new packages are model-agnostic and registered in the Model Experience verifier's audited sentence list.
- No shipped bundle defaults changed: headless/CI adopt the terminal provider through composition rows, and the bridge stays opt-in.
- The plan document's 5.5.2 dialog entry is superseded by the existing directory-picker seam (the plan lives outside version control under `.local-plugins`).
