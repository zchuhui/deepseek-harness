# @deepseek-ai/dsh-notifications

English | [中文](README.zh.md)

Operator notification capability seam (`ctx.notifications`). A consumer raises one notification per observed event, and a provider renders it on the operator's channel. The seam carries no trigger policy: bridges decide what raises (`dsh-notify-events`), providers decide how it is delivered (`dsh-notifications-terminal`, `dsh-notifications-windows`).

The abstract `NotificationService` registers as `ctx.notifications` (one implementation per context; a second load throws). `notify(notification)` rejects on delivery failure (unsupported platform, spawn error); the seam defines no fallback, and consumers own failure containment so a broken notification cannot break the event dispatch that raised it.

## Types

- `Notification { kind, title, body, sessionId? }` — operator-facing only; nothing here enters the session log or a model request.
- `NotificationKindMap` — merge-extensible category map; consumers add categories through declaration merging.

## Model Experience

None, as the seam carries operator notifications that never reach a model request or the session log.

#### KV Cache effect

None; this package neither assembles nor sends a provider request, so it contributes nothing to any model request's token stream or cache prefix.

## Known Limitations and Deferred Work

- **No click-through target** — `sessionId` is correlation data only; a provider that can navigate owns the jump mapping, which arrives with the desktop shell milestone.
