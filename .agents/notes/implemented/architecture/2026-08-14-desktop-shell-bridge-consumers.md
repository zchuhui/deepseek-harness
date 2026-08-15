# Agent Note: Desktop shell bridge and its host-side consumers

Status: implemented

English | [中文](2026-08-14-desktop-shell-bridge-consumers.zh.md)

## Problem

The desktop shell (Tauri) and the dsh host (Node) are two processes. Host-side seam providers need the shell's native primitives (toast, directory chooser, keychain, updater), but Tauri IPC reaches only the embedded web UI, not the host. The milestone-1 seams (`ctx.notifications`, `ctx.updater`, `ctx.credentials`) had no desktop providers, and no channel existed for the host to reach the shell.

## Decision

- **A token-guarded loopback HTTP bridge** is the host-to-shell channel. The shell serves `127.0.0.1:3901` with a run-scoped token (hash of boot time and pid), requires the header `x-dsh-bridge-token` on every request, and exports `DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN` to the spawned dsh child. Endpoints: `/api/desktop/toast`, `/pick-directory`, `/keychain/{name}` (GET/POST/DELETE), `/update`, `/update/apply` (501 until the release milestone). The contract lives in `desktop-app/README.md`.
- **One typed client package** (`packages/util/desktop-bridge`): zero-dependency, fetch-based, `DesktopBridgeError` for non-2xx answers (with the shell-provided message), fetch errors for transport failures, 404 keychain reads resolve to `undefined`. Caller signals combine with the per-request timeout via `AbortSignal.any`.
- **Three consumer providers** consume that client: `notifications-desktop` (toast), `updater-desktop` (`state()` is a replace-only cache, `check()` fetches, `apply()` forwards), `credentials-desktop` (keychain layered under the process environment with the seam's shadowing fail-loud rule; `credentials/updated` fires after committed writes).
- **Fail loud at load**: every provider resolves `bridgeUrl`/`bridgeToken` from config over the shell-exported environment and throws at construction when either is missing, so a row composed outside the shell cannot silently degrade.

## Alternatives considered

- **Tauri IPC to the host.** Rejected: the IPC surface terminates in the webview; the host would need its own client, and the web UI would become a mandatory hop.
- **A raw TCP/stdio channel.** Rejected: HTTP gives the shell a uniform, typed, token-guarded surface and reuses the Node fetch boundary already exercised across the repo.
- **One provider package with a bundled client.** Rejected: three providers share the same wire client; duplication detection and future bridge endpoints favor one owned client package.
- **File-based credential fallbacks in the desktop provider.** Deferred: the desktop provider layers environment over keychain only; `.env` fallbacks stay with `dsh-credentials-local` until a desktop consumer needs them.

## Consequences

- The Tauri shell keeps being a primitive provider: seam semantics (categories, channels, shadowing) live host-side and survive a shell rewrite.
- The shell exports its bridge facts only to the child it spawns; a reused service (already running) has no bridge env, so desktop providers composed against a reused service fail loud at load — documented, not silent.
- The update endpoints are real: the shell runs tauri-plugin-updater against the configured endpoint, answers /api/desktop/update with the cached wire state and /api/desktop/update/apply with download-verify-install-restart, and self-hosts update-manifest.json plus the signed installer artifact on the bridge for the local loop. Signing is the minisign chain (private key stays on the build machine, public key embedded in tauri.conf.json); Authenticode publisher signing remains deferred to the release owner.
- Notification deep links ride the same bridge: a toast payload carries an optional `sessionId`, the shell keeps the latest one as its pending deep link, and the tray item "open latest notification" shows, focuses, and navigates the main window to `http://127.0.0.1:<port>/?session=<id>` — the URL protocol the web client resolves at boot. OS-level toast-click activation works on Windows through the `dsh` protocol, and toast identity is the shell's own AUMID (the boot-registered Start Menu shortcut); macOS/Linux still lack an activation callback.
