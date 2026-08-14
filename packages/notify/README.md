# notify/ — operator notifications

English | [中文](README.zh.md)

The capability family that raises and delivers operator notifications: the bridge classifies signals the harness already emits, and providers render them on the operator's channel. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`notifications/`](notifications/README.md) | Notification capability seam | `ctx.notifications` |
| [`notifications-terminal/`](notifications-terminal/README.md) | Terminal provider: one labelled logger line per notification | registers `ctx.notifications` |
| [`notifications-windows/`](notifications-windows/README.md) | Windows toast provider through PowerShell WinRT interop | registers `ctx.notifications` |
| [`notify-events/`](notify-events/README.md) | Event bridge: job settlements, approvals, failed turns, opted-in tool failures | consumes `ctx.notifications` and `ctx.jobs` |
| [`notifications-desktop/`](notifications-desktop/README.md) | Desktop toast provider through the shell bridge | registers `ctx.notifications` |

Nothing in this family is model-visible: every notification derives from facts the emitting packages already own.
