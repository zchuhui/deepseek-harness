# dsh-desktop — DeepSeek Harness desktop shell (Tauri 2)

English | [中文](README.zh.md)

The Tauri 2 skeleton for the DeepSeek Harness desktop product: it runs the local `dsh web` runtime as a child process and renders the existing web GUI in a native window, with a system tray and a token-guarded bridge through which dsh host providers reach native primitives. It owns the `dsh://` protocol — a single instance runs, and protocol launches and toast clicks route back into it. This is the desktop milestone 2 shell; it stays outside the root pnpm workspace by design (the plan document owns the rationale).

## Boot order

1. Start the bridge HTTP server on `127.0.0.1:3901` with a run-scoped token.
2. Resolve an executable dsh (env override, checkout source launch, or `dsh` on PATH — the same discovery rules as `scripts/desktop-launch/launch.ps1`), reuse a live service on the port, or spawn one and poll readiness (any HTTP response counts).
3. Create the main window loading `http://127.0.0.1:<port>`; on failure, show the bundled error page and log the detail to stderr.
4. Build the tray: show window / new window / open latest notification / settings / quit. Closing the main window hides it (or quits when close-to-tray is off); other windows close for real; the spawned dsh child dies with the shell.
5. Register the `dsh` protocol (Windows/Linux) and route any deep link this launch or a later one carried; a boot link chooses the main window's URL directly.

## Prerequisites

- Rust (stable, MSVC host on Windows) and Cargo.
- The Microsoft Edge WebView2 runtime (preinstalled on Windows 11).
- Node.js `^22.19.0` or `>=24.0.0`, and a built checkout (`pnpm install && pnpm build` in the repository root) for the source launch path.

## Build and run

```sh
cd desktop-app
pnpm install
pnpm tauri dev
cargo build
cargo test
```

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `DSH_DESKTOP_PORT` | `3080` | Local dsh web port |
| `DSH_DESKTOP_COMMAND` | none | Full launch command override (whitespace-split) |
| `DSH_DESKTOP_BRIDGE_PORT` | `3901` | Bridge HTTP port |

The shell exports `DSH_DESKTOP_BRIDGE_URL` and `DSH_DESKTOP_BRIDGE_TOKEN` to the spawned dsh child, so host-side providers can call the bridge.

## Deep links

The shell registers the `dsh://` protocol with the OS at every boot (HKCU on Windows, `x-scheme-handler` on Linux). Canonical forms:

- `dsh://` — show the main window.
- `dsh://session/<id>` — navigate the main window to `http://127.0.0.1:<port>/?session=<id>` (the id must match `[A-Za-z0-9_-]{1,256}`).

On Windows and Linux a protocol launch spawns a second process; `tauri-plugin-single-instance` forwards its argv into the running shell. The first link of a cold launch chooses the main window's URL; later links route through the window registry — a session focuses the window that owns it, or opens a new one. On macOS links arrive as `deep-link://new-url` events (cold-start delivery and scheme registration follow the installer milestone). Toast clicks use the same mechanism: on Windows a toast for a session carries `launch="dsh://session/<id>"` with `activationType="protocol"`, so clicking it routes through the protocol handler into the shell.

## Updater, signing, and the update manifest

The shell ships the real Tauri updater: `/api/desktop/update` runs a live check through `tauri-plugin-updater` against the configured endpoint and answers with the cached wire state, and `/api/desktop/update/apply` downloads, verifies the minisign signature, installs, and restarts the shell. For the local loop the shell self-hosts both update files: `GET /update-manifest.json` and `GET /update-artifact` serve the generated files from the working directory; production deployments point `plugins.updater.endpoints` at an HTTPS host instead.

Build and sign with `node scripts/build-and-sign.mjs`: it runs `tauri build --bundles nsis` with `createUpdaterArtifacts` enabled, signs the installer with the local minisign key (`updater.key`, gitignored — the private key never leaves the build machine; the public key is embedded in `tauri.conf.json`), and assembles `update-manifest.json` (version, notes, pub_date, per-platform signature and download URL). `UPDATE_VERSION_OVERRIDE` writes a bumped manifest version for exercising the update flow locally, and `UPDATE_MANIFEST_BASE_URL` overrides the artifact URL.

The installer's own Authenticode signature rides the same script: with `AUTHENTICODE_CERT` (a .pfx path) and `AUTHENTICODE_PASSWORD` set, the build points `bundle.windows.signCommand` at `scripts/sign-windows.mjs` (the signtool invocation; `AUTHENTICODE_SIGNTOOL` overrides the lookup with the full SDK bin path, `AUTHENTICODE_TIMESTAMP_URL` the timestamping server). tauri Authenticode-signs the installer before computing the minisign updater artifacts, so the `.sig` covers the signed installer. Without a certificate the build still succeeds, ships an unsigned installer, and says so; the publisher certificate stays with the release owner.

## Bridge contract (host -> shell primitives)

Every request carries the header `x-dsh-bridge-token` with the run-scoped token; anything else is 401. All bodies are JSON.

| Endpoint | Method | Contract |
|---|---|---|
| `/api/desktop/toast` | POST | `{ title, body, sessionId? }` shows one native notification; a safe `sessionId` becomes the pending deep link and, on Windows, the toast's protocol-activation launch target (`dsh://session/<id>`) |
| `/api/desktop/pick-directory` | POST | opens the native folder chooser; `{ path }` or `{ canceled: true }` |
| `/api/desktop/keychain/{name}` | GET/POST/DELETE | read (`{ value }` or 404), store (`{ value }`, non-empty), delete — Windows Credential Manager via the `keyring` crate |
| `/api/desktop/windows/open` | POST | `{ sessionId? }` opens one new window (the id must be safe) and registers it; `{ label, sessionId }` |
| `/api/desktop/windows/close` | POST | `{ label }` closes the window — the main window hides instead; `{ closed: true }` or 404 |
| `/api/desktop/windows/focus` | POST | `{ label }` shows, unminimizes, and focuses; `{ focused: true }` or 404 |
| `/api/desktop/windows/assign` | POST | `{ label, sessionId }` records the session one window currently shows (the client-reported half; the shell's own routed boot targets are the other); `{ assigned: true }`, 404 for an unknown label, or 400 for an unsafe id |
| `/api/desktop/windows` | GET | `{ windows: [{ label, sessionId }] }` — the registry snapshot; `sessionId` is null without a target |
| `/api/desktop/settings` | GET | `{ closeToTray, launchAtLogin }` — the shell settings document |
| `/api/desktop/settings` | POST | partial document `{ closeToTray?, launchAtLogin? }`; OS side effects run before persistence; the complete updated document answers |
| `/api/desktop/update` | GET | live check through the Tauri updater; `{ channel: "tauri", currentVersion, checkedAt, available, lastFailure }` |
| `/api/desktop/update/apply` | POST | downloads, verifies the minisign signature, installs, and restarts the shell; 500 with the failure message otherwise |

The Tauri IPC commands `get_state`, `toast`, `pick_directory`, `get_settings`, `set_settings` mirror these primitives for the embedded web UI; the tray's settings item opens the bundled `settings.html` window, which drives the settings commands.

## Shell settings

The shell persists `closeToTray` (default true — closing the main window hides it) and `launchAtLogin` (default false — a Windows `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value named `dsh-desktop`) in the app config directory's `settings.json`. Writes are atomic (temp file + rename), and an OS change lands before the file and memory do, so a failed registry write changes nothing. An absent file means the defaults; a corrupt file fails the boot with the error window instead of guessing.

## Known Limitations and Deferred Work

- **Authenticode certificate unset** — the signing toolchain is in place (the `AUTHENTICODE_*` variables above), but the publisher certificate stays with the release owner; without one the build ships an unsigned installer.
- **Dev self-hosted updates only** — the updater endpoint and artifact URL point at the shell's own loopback bridge; a production deployment must host the manifest and installer on HTTPS and rotate the signing key.
- **GNU toolchain untested** — developed for the MSVC host; the GNU linker may need extra setup.
- **Toast identity falls back to PowerShell when AUMID registration fails** — the shell rewrites the Start Menu's `DeepSeek Harness.lnk` with its own AppUserModelID at every boot; registration failure logs at boot and toasts fall back to the old PowerShell identity.
- **launchAtLogin is Windows-only** — the web GUI settings page and the shell-native settings window both read and write `closeToTray`/`launchAtLogin`, but the launch-at-login Run key exists only on Windows; macOS/Linux start-at-login waits for those platforms' milestones.
- **macOS/Linux toast click-through** — only Windows toasts carry protocol activation today; the notification plugin offers no activation callback on the other platforms.