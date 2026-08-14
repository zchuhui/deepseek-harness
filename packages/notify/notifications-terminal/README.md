# @deepseek-ai/dsh-notifications-terminal

English | [中文](README.zh.md)

Terminal provider for the [notification seam](../notifications/README.md): renders each notification as one labelled host console logger line, the headless default. The rendered line is `[dsh] <title>: <body>`.

The provider has no config: composition selects it as the `ctx.notifications` row wherever a console exists.

## Model Experience

None, as the provider renders operator notifications to the host console; nothing here reaches a model request or the session log.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Console-only visibility** — the line appears only while a logger with console output is composed; background or GUI-only runs need a toast provider such as `dsh-notifications-windows`.
