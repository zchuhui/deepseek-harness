# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

The desktop shell's host-surface bundle: [`cordis.patch.yml`](cordis.patch.yml) mounts the notification bridge [`dsh-notify-events`](../../notify/notify-events/README.md) with `turnCompleted: true` and the desktop toast provider [`dsh-notifications-desktop`](../../notify/notifications-desktop/README.md), layered over `dsh-web-app` as the final bundle of the `desktop` profile. Task-completion toasts are background-only by default: the provider marks `turn-completed` notifications so the shell suppresses them while any window holds focus. The package has no runtime API; the profile composer resolves the patch through the `dsh.bundle.patch` manifest field, never through code.

## Model Experience

Indirectly, through the inserted rows; the notification packages register nothing model-facing.

#### KV Cache effect

None directly; each inserted row's package owns its effect.

## Known Limitations and Deferred Work

- **Host-shell peers not yet mounted** — `host-desktop-shell`, `updater-desktop`, and `credentials-desktop` remain unwired in this bundle; they join here as their milestones land.
