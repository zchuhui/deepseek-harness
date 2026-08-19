# Agent Note: Task-completion notifications — turn-completed trigger, background-only desktop toasts, and the desktop profile

Status: implemented

English | [中文](2026-08-17-desktop-task-completion-notification.zh.md)

## Problem

The desktop shell raised no operator notification when a turn completed. The notification capability already existed as packages — the `ctx.notifications` seam, the `dsh-notify-events` bridge, and the terminal/windows/desktop providers — but the bridge had no successful-completion trigger, and no shipped profile mounted any of it.

## Decision

- **`turn-completed` trigger in `dsh-notify-events`.** The bridge raises `{ kind: 'turn-completed', title: '任务完成', body: '回复已生成', sessionId }` on `turn/end` with `reason.kind === 'completed'`, behind a `turnCompleted` switch that defaults to false (completion is frequent and usually in view). The category joins `NotificationKindMap` by declaration merging, beside `tool-failed`.
- **Background-only desktop toasts.** `dsh-notifications-desktop` gains `backgroundOnlyKinds` (default `['turn-completed']`); matching notifications carry `backgroundOnly: true` through `dsh-desktop-bridge.toast(..., backgroundOnly)` to `POST /api/desktop/toast`. The shell's new `windows::is_any_window_focused` suppresses a `backgroundOnly` toast while any registered window holds focus, so the reminder fires only when the operator is away.
- **A dedicated `desktop` profile.** The shell now launches `dsh --profile desktop` (new `desktop` profile template: `dsh-base` + `dsh-web-app` + `dsh-desktop`). The new `dsh-desktop` bundle mounts `dsh-notify-events` (`turnCompleted: true`) + `dsh-notifications-desktop`. The shell previously launched the plain `web` profile, which mounted no notification rows.
- **Terminal notifications.** The `dsh-headless` bundle mounts `dsh-notify-events` (`turnCompleted: true`) + `dsh-notifications-terminal`, so one-shot CLI runs print completion lines to the host console.

## Alternatives considered

- **Conditional rows in the web-app bundle instead of a desktop profile.** Rejected: the desktop shell is a distinct deployment whose host plugins must load only under the bridge environment; a dedicated profile names that boundary and matches the desktop-deployment host-profile requirement.
- **Always notify on completion.** Rejected: noisy while the operator is watching; the shell's focus check scopes the reminder to "away".
- **Thread a harness category into the shell.** Rejected: the shell stays generic with a `backgroundOnly` boolean; the provider owns the kind-to-policy mapping.

## Consequences

- The shell gains the `backgroundOnly` toast flag and `windows::is_any_window_focused`; its bridge contract documents the flag.
- The desktop shell's launch spec changes from `web` to `--profile desktop`; the `desktop` profile auto-initializes from the shipped template.
- `turnCompleted` is off by default in the bridge; the `desktop` and `headless` bundles opt in.

Related: [desktop capability seams](../architecture/2026-08-14-desktop-capability-seams-notifications-updater.md), [shell bridge consumers](../architecture/2026-08-14-desktop-shell-bridge-consumers.md), [Windows desktop completion](2026-08-16-desktop-windows-completion.md).
