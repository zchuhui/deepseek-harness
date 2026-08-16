# Agent Note: Windows desktop production release

Status: proposed

English | [中文](2026-08-15-windows-desktop-production-release.zh.md)

## Problem

The Tauri shell can build an NSIS installer, but the installed executable still depends on a checkout or a `dsh` command on PATH, accepts an unrelated loopback HTTP service as ready, exposes a broad WebView bridge, and has no release-owned signed update path.

## Proposal

- The Windows x64 installer embeds a pinned Node 22.19.0 executable and the deployed production `@deepseek-ai/dsh` dependency closure. A release build supplies the executable and its SHA-256; staging rejects a missing or mismatched file. Release builds start only this resource runtime, while debug builds retain the existing checkout/PATH discovery.
- Each shell boot allocates loopback ports for the dsh server and bridge and passes independent 256-bit tokens only to the child process. The web bundle registers `/internal/desktop/ready`, which returns 204 only when the native shell supplies its token. The shell refuses an occupied port and does not reuse arbitrary local HTTP services.
- The main webview cannot use Tauri IPC. The shell disables `withGlobalTauri`, keeps app-local settings IPC in the settings window, and ships a fixed app CSP. The dsh bridge remains token-authenticated and no longer serves update artifacts.
- NSIS installs per-user, refuses downgrades, embeds the WebView2 bootstrapper, and uses passive updates. GitHub Releases hosts the HTTPS update manifest and installer. A tag workflow stages the runtime, builds the installer, Authenticode-signs it through Azure Trusted Signing, recreates the Tauri updater signature over that final executable, and publishes checksums, SBOM, manifest, installer, and signature.

## Alternatives considered

- **Continue resolving dsh from PATH.** Rejected because an installed desktop application would depend on an undeclared machine-wide Node and CLI installation.
- **Reuse any server on a fixed local port.** Rejected because an unrelated process can occupy the port and supply browser content to the native window.
- **Store a PFX in GitHub Actions secrets.** Rejected because Azure Trusted Signing keeps the Authenticode private key outside CI and uses OIDC authentication.

## Acceptance criteria

- A clean Windows 10 22H2 or Windows 11 x64 VM installs and starts the application after Node and dsh are absent from PATH.
- A readiness response without the per-run token, an occupied web port, and an incomplete bundled runtime each fail before a main webview opens.
- The release workflow verifies the Authenticode signature, produces a Tauri updater signature after it, and publishes the manifest, installer, checksums, and SBOM to the matching `desktop-v<version>` GitHub Release.
- The mandatory Windows desktop workflow runs Rust tests, stages the runtime, and builds the NSIS installer on every affected pull request.

## Risks

- Azure account, certificate profile, timestamp URL, GitHub Environment, updater private key, and pinned Node archive checksum are release-owner configuration. Missing values block release publication rather than creating an unsigned or unverifiable release.
- The first release supports Windows x64 only. ARM64, enterprise offline deployment, and beta channels require separate runtime artifacts and update feeds.
