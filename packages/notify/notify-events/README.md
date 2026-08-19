# @deepseek-ai/dsh-notify-events

English | [中文](README.zh.md)

Event bridge for the [notification seam](../notifications/README.md): raises one notification per observed job settlement (`ctx.jobs.onJobDone`), approval request (durable `approval/asked`), failed turn (`turn/end` with an error reason), completed turn (`turn/end` with a completed reason), and — opted-in — failed tool call (`tool/result` carrying an error). Every trigger source already exists in the harness; this plugin only classifies and forwards. Delivery failures are contained and logged, never thrown back into the event dispatch.

## Config

| Key | Default | Meaning |
|---|---|---|
| `jobSettled` | true | Raise on every terminal background job |
| `approvalWaiting` | true | Raise when an approval is waiting |
| `turnFailed` | true | Raise when a turn dies with an error |
| `turnCompleted` | false | Raise when a turn completes; off by default because completion is frequent and usually in view |
| `toolFailed` | false | Raise on a failed tool call; off by default because tool failures are recoverable and frequent |

The bridge declaration-merges the `tool-failed` and `turn-completed` categories into `NotificationKindMap`. All subscriptions unwind when the plugin disposes.

## Model Experience

None, as the bridge derives every notification from facts the emitting packages already log; it registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No per-job kind filter** — settlement raises for every terminal job; filtering by producer kind waits for a consumer that needs it.
- **Unowned jobs carry no sessionId** — correlation for unowned background work needs the owning product to supply identity.
