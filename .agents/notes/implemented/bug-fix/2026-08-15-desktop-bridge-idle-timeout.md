# Agent Note: Desktop bridge died after its first idle half-second

Status: implemented

English | [中文](2026-08-15-desktop-bridge-idle-timeout.zh.md)

## Problem

The desktop shell's bridge listener vanished shortly after boot: smoke probes showed the process alive with its main window, yet `127.0.0.1:3901` refused connections. Host-side desktop providers (notifications, updater, credentials) could never reach the shell in practice unless their request arrived within the first ~500 ms of startup.

## Decision

- **Root cause**: `tiny_http`'s `Server::recv_timeout` maps the internal `MessagesQueue::pop_timeout` idle timeout to `Ok(None)` — an idle wait, not a closed channel. The bridge loop treated `Ok(None)` as channel closure and `break`ed, dropping the `Server` and closing the listener after its first idle half-second.
- **Fix**: `Ok(None)` is now an idle wait (`continue`); the loop ends only on the stop flag. The `Err` arm keeps ignoring accept-thread error reports, since a dead accept thread is already unreachable in practice and the stop flag owns the lifecycle.
- **Regression anchor**: `desktop-app/src-tauri/tests/tiny_http_listener.rs` pins the semantics on this host — a listener survives completed and aborted connections.

## Alternatives considered

- **A hand-rolled `std::net` server replacing tiny_http.** Rejected: the dependency works once the loop semantics are correct; the isolation tests reproduced the healthy behavior outside the shell.
- **Polling `num_connections()` or other liveness signals.** Rejected: no such signal exists; the stop flag already owns the lifecycle.

## Consequences

- Verified on this host: after the fix the bridge listener survives 8 s of idle, answers 401 to untokenized requests, and keeps listening after requests.
- The milestone-2 bridge never served a request older than its first idle timeout; every desktop provider consumer that worked before did so only within that window.

Related: [protocol deep links, single instance, and toast activation](2026-08-15-desktop-protocol-single-instance-toast-activation.md).
