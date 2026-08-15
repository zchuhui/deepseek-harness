# Agent Note: Windows desktop completion: shell identity, navigation reporting, Authenticode tooling, and settings rows

Status: implemented

English | [中文](2026-08-16-desktop-windows-completion.zh.md)

## Problem

Four gaps remained after the shell skeleton: toasts displayed under Windows PowerShell's identity (the shell never registered its own AUMID); the shell's window registry tracked only shell-initiated navigation, so sessions the operator opened through the web GUI sidebar were invisible to deep-link routing; the release path had no Authenticode tooling; and the web GUI had no way to read or write the shell settings (closeToTray/launchAtLogin).

## Decision

- **The shell registers its own AUMID shortcut at every boot.** `aumid.rs` uses COM (IShellLinkW + IPropertyStore) to rewrite the Start Menu's `DeepSeek Harness.lnk` as a shortcut to the current executable marked `System.AppUserModel.ID` = the tauri identifier — the shortcut IS the AUMID registration on Windows, so dev, unpackaged, and installed deployments converge on one identity. Toasts display under the shell identity; registration failure logs at boot and falls back to the old PowerShell identity.
- **Client-to-shell navigation reporting.** The shell gives every window's URL a `?win=<label>` (always `main` for the primary window); once the workspace baseline is ready, the web client reports the session its window currently shows through the new `host.reportWindow` RPC, the host forwards it through the new `ctx.desktopHost` seam (`dsh-host-desktop` service definition + `dsh-host-desktop-shell` bridge provider) to the bridge's `POST /api/desktop/windows/assign`, and the shell updates its window registry. Deep links to sidebar sessions now focus the owning window instead of opening a new one. Browser tabs without the `win` parameter never report; a host without the desktop shell answers `desktop-unavailable` and the client drops the report as best-effort.
- **Authenticode tooling in the build script.** `build-and-sign.mjs` overlays `createUpdaterArtifacts: true` through `--config` (the committed tauri.conf.json keeps it off, so plain `tauri build` produces no update artifacts); with `AUTHENTICODE_CERT`/`AUTHENTICODE_PASSWORD` set it points `bundle.windows.signCommand` at `scripts/sign-windows.mjs`. tauri Authenticode-signs the installer before computing the minisign updater artifacts, so the `.sig` covers the signed installer; without a certificate the build still succeeds and says so. The publisher certificate stays with the release owner.
- **Shell settings rows in the web GUI.** The new `desktop.getSettings`/`desktop.setSettings` RPC domain (loopback-privileged, beside the configuration plane) drives two General-section rows: closeToTray (all platforms) and launchAtLogin (Windows only, detected through the webview platform). When the RPC is unavailable (no desktop shell) the rows hide entirely; failed writes roll back with a re-read, and the shell stays the authoritative store for both values. The shell-native settings.html window remains.

## Alternatives considered

- **Register the AUMID shortcut only in the installer.** Rejected: dev and unpackaged deployments never run the installer, so the toast identity would stay broken; boot-time registration makes all three deployments converge.
- **Have the shell observe webview navigation to track sessions.** Rejected: Tauri has no reliable hook for SPA-internal navigation; client push through the host RPC covers every session the sidebar opens.
- **Run signtool after the build, then re-sign with minisign.** Rejected: re-signing needs a minisign CLI on the build machine and the ordering is error-prone; tauri's `bundle.windows.signCommand` signs the installer before computing the updater artifacts, so the builder owns the order.
- **Register the shell settings as a settings namespace.** Rejected: the settings seam has one provider per app and the shell is the authoritative store for both values, so a mirror would create a second truth; the dedicated `desktop.*` RPC domain reads and writes the shell directly.

## Consequences

- Three RPC methods (`host.reportWindow`, `desktop.getSettings`, `desktop.setSettings`) join the privileged method set: `desktop.*` reads and writes native shell state, and `host.reportWindow` drives native window routing — the same class as `host.pickDirectory`.
- The desktop deployment's host profile must compose `@deepseek-ai/dsh-host-desktop-shell` (beside the existing notifications-desktop/updater-desktop/credentials-desktop; missing bridge facts fail loud at load). The shell also gains the `/api/desktop/windows/assign` endpoint and the `?win=` URL convention.
- What remains on Windows is release-side: the publisher certificate and production HTTPS update hosting with key rotation; the product gaps left are macOS/Linux toast click-through and start-at-login.

Related: [desktop capability seams](../architecture/2026-08-14-desktop-capability-seams-notifications-updater.md), [shell bridge consumers](../architecture/2026-08-14-desktop-shell-bridge-consumers.md), [protocol deep links, single instance, and toast activation](2026-08-15-desktop-protocol-single-instance-toast-activation.md).
