# dsh-desktop — DeepSeek Harness desktop shell (Tauri 2)

English | [中文](README.zh.md)

The Tauri 2 skeleton for the DeepSeek Harness desktop product: it runs the local `dsh web` runtime as a child process and renders the existing web GUI in a native window, with a system tray and a token-guarded bridge through which dsh host providers reach native primitives. This is the desktop milestone 2 shell; it stays outside the root pnpm workspace by design (the plan document owns the rationale).

## Boot order

1. Start the bridge HTTP server on `127.0.0.1:3901` with a run-scoped token.
2. Resolve an executable dsh (env override, checkout source launch, or `dsh` on PATH — the same discovery rules as `scripts/desktop-launch/launch.ps1`), reuse a live service on the port, or spawn one and poll readiness (any HTTP response counts).
3. Create the main window loading `http://127.0.0.1:<port>`; on failure, show the bundled error page and log the detail to stderr.
4. Build the tray: show window / open latest notification / quit. Closing the window hides it; the spawned dsh child dies with the shell.

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

## Updater, signing, and the update manifest

The shell ships the real Tauri updater: `/api/desktop/update` runs a live check through `tauri-plugin-updater` against the configured endpoint and answers with the cached wire state, and `/api/desktop/update/apply` downloads, verifies the minisign signature, installs, and restarts the shell. For the local loop the shell self-hosts both update files: `GET /update-manifest.json` and `GET /update-artifact` serve the generated files from the working directory; production deployments point `plugins.updater.endpoints` at an HTTPS host instead.

Build and sign with `node scripts/build-and-sign.mjs`: it runs `tauri build --bundles nsis` with `createUpdaterArtifacts` enabled, signs the installer with the local minisign key (`updater.key`, gitignored — the private key never leaves the build machine; the public key is embedded in `tauri.conf.json`), and assembles `update-manifest.json` (version, notes, pub_date, per-platform signature and download URL). `UPDATE_VERSION_OVERRIDE` writes a bumped manifest version for exercising the update flow locally, and `UPDATE_MANIFEST_BASE_URL` overrides the artifact URL.

Authenticode code signing of the installer itself is out of scope for this milestone (it needs the publisher's own certificate); the updater's artifact signature is the minisign chain above.

## Bridge contract (host -> shell primitives)

Every request carries the header `x-dsh-bridge-token` with the run-scoped token; anything else is 401. All bodies are JSON.

| Endpoint | Method | Contract |
|---|---|---|
| `/api/desktop/toast` | POST | `{ title, body, sessionId? }` shows one native notification; a safe `sessionId` becomes the pending deep link |
| `/api/desktop/pick-directory` | POST | opens the native folder chooser; `{ path }` or `{ canceled: true }` |
| `/api/desktop/keychain/{name}` | GET/POST/DELETE | read (`{ value }` or 404), store (`{ value }`, non-empty), delete — Windows Credential Manager via the `keyring` crate |
| `/api/desktop/update` | GET | live check through the Tauri updater; `{ channel: "tauri", currentVersion, checkedAt, available, lastFailure }` |
| `/api/desktop/update/apply` | POST | downloads, verifies the minisign signature, installs, and restarts the shell; 500 with the failure message otherwise |

The Tauri IPC commands `get_state`, `toast`, `pick_directory` mirror these primitives for the embedded web UI.

## Known Limitations and Deferred Work

- **Authenticode not signed** — the NSIS installer itself carries no publisher certificate; only the updater artifacts are minisign-signed. Publisher signing needs the release owner's certificate.
- **Dev self-hosted updates only** — the updater endpoint and artifact URL point at the shell's own loopback bridge; a production deployment must host the manifest and installer on HTTPS and rotate the signing key.
- **GNU toolchain untested** — developed for the MSVC host; the GNU linker may need extra setup.
- **Single window, fixed tray menu** — multi-window orchestration and desktop settings UI wait for their milestones.
- **No OS toast-click activation** — the tray item "open latest notification" performs the deep link (`?session=<id>`); clicking the toast itself cannot activate the shell until the installer milestone registers the AppUserModelID shortcut Windows activation requires.