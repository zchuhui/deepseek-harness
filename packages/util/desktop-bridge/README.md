# @deepseek-ai/dsh-desktop-bridge

English | [中文](README.zh.md)

Zero-dependency typed client for the desktop shell's native bridge: a token-guarded loopback HTTP API through which dsh host providers reach toast, directory-picker, keychain, and updater primitives. The wire contract is owned by `desktop-app/README.md`; this package only types the client.

A library, not a plugin: no ctx, no state beyond the connection options. Every request carries the header `x-dsh-bridge-token` with the run-scoped token; non-2xx answers reject with `DesktopBridgeError` (status + shell-provided message), transport failures reject with the fetch error, and a 404 keychain read resolves to `undefined`.

## Model Experience

None, as the client is host-side bridge plumbing; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No retry or backoff** — one request per call; retrying bridge traffic waits for a consumer that needs it.
- **Fetch-dependent** — the client requires the Node fetch global; alternate transports are out of scope.
