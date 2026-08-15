# Desktop

English | [中文](desktop.zh.md)

The desktop shell integration: the Tauri shell owns the native window set and the persisted close-to-tray / launch-at-login settings ([desktop-app README](../../desktop-app/README.md)), and the packages on this page connect the dsh host and the web GUI to those primitives. The shell runs the local `dsh web` process, renders the web GUI in native windows, and serves a token-guarded loopback HTTP bridge; the bridge endpoint contract lives in the same desktop-app README.

## Desktop host seam

[`@deepseek-ai/dsh-host-desktop`](../../packages/host/desktop) is the capability seam that host plugins use to drive the shell's native window registry and persisted settings. The abstract `DesktopHost` service registers as `ctx.desktopHost` (one implementation per context; loading a second throws). Its three methods:

- `reportWindow(label, sessionId)` records the session one shell window now shows — the client-reported half of the shell's window registry — so a `dsh://` deep link focuses the owning window instead of opening another.
- `getSettings()` reads the shell settings document.
- `setSettings(partial)` applies a partial document; omitted fields keep their values, and the complete updated document resolves.

The provider [`@deepseek-ai/dsh-host-desktop-shell`](../../packages/host/desktop-shell) implements the seam by forwarding each call over the shell bridge. It fails loud at load when the bridge environment (`DSH_DESKTOP_BRIDGE_URL` / `DSH_DESKTOP_BRIDGE_TOKEN`) is missing, so a composition row cannot silently degrade to no host control.

## Public types

Source: [`packages/host/desktop/src/index.ts`](../../packages/host/desktop/src/index.ts)

```ts type-equiv
/** The shell settings document: the two flags the shell persists across runs. */
interface DesktopSettingsDoc {
  /** Whether closing the main window hides it instead of quitting. */
  closeToTray: boolean
  /** Whether the shell starts at login. */
  launchAtLogin: boolean
}
```

## Shell bridge

[`@deepseek-ai/dsh-desktop-bridge`](../../packages/util/desktop-bridge) is the zero-dependency typed client for the shell's loopback HTTP API (`127.0.0.1:3901`). Every request carries the run-scoped token in `x-dsh-bridge-token`; non-2xx answers reject with `DesktopBridgeError`, transport failures reject with the fetch error, and a 404 keychain read resolves to `undefined`. The endpoint contract (toast, directory picker, keychain, windows, settings, updater) is owned by the [desktop-app README](../../desktop-app/README.md); this package only types the client.

## Desktop providers

Three host providers implement harness capability seams through the same bridge:

- [`@deepseek-ai/dsh-notifications-desktop`](../../packages/notify/notifications-desktop) implements `ctx.notifications` by rendering each notification as a native toast; an optional `sessionId` becomes the toast's `dsh://` activation deep link.
- [`@deepseek-ai/dsh-updater-desktop`](../../packages/updater/updater-desktop) implements `ctx.updater` over the shell's Tauri updater: `state()` reads the replace-only cache, `check()` fetches the shell's online state, and `apply()` forwards to the shell.
- [`@deepseek-ai/dsh-credentials-desktop`](../../packages/credentials/credentials-desktop) resolves credential references from the shell keychain, layered under the read-only process environment.

## Web GUI settings rows

[`@deepseek-ai/dsh-client-ui-settings-desktop`](../../packages/client/ui-settings-desktop) renders the two General-section switch rows (close-to-tray and launch-at-login) and reads and writes the settings document through the loopback-only `desktop` RPC domain. Both rows stay hidden whenever the domain answers `desktop-unavailable`, a read fails, or the page authority is not loopback; the launch-at-login row additionally renders only on Windows. Both rows share one store instance: the controller loads on activation and reconnect, writes each toggle optimistically, and rolls back through a reload when the write fails.

## Host RPC surface

The web client reaches the desktop host through three unary RPC methods served by [`@deepseek-ai/dsh-host-apiproxy`](../../packages/host/apiproxy):

- `host.reportWindow { label, sessionId }` — the browser reports the session its window shows; answers `{ reported: true }`.
- `desktop.getSettings {}` — reads the settings document.
- `desktop.setSettings { closeToTray?, launchAtLogin? }` — applies a partial document and answers the complete one.

A deployment that does not compose the desktop host service answers `desktop-unavailable` on all three. The three methods sit in the loopback-pinned privileged set of [`@deepseek-ai/dsh-client-connection`](../../packages/client/connection), so remote browsers cannot reach them.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdesktophost--desktophost-abstract-seam"></a>

### `ctx.desktopHost` — `DesktopHost` (abstract seam)

Abstract desktop-shell host-control service. Subclass, implement the three methods, and load the subclass as a plugin — it registers as `ctx.desktopHost` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

```ts cordis-catalog
/**
 * Record the session one window now shows (the client-reported half of the
 * shell's window registry), so a deep link focuses the owning window.
 * @param label - shell window label ("main" or "win-<n>").
 * @param sessionId - session the window shows, or null for none.
 */
abstract reportWindow(label: string, sessionId: string | null): Promise<void>

/**
 * Read the shell settings document.
 * @returns the close-to-tray and launch-at-login flags.
 */
abstract getSettings(): Promise<DesktopSettingsDoc>

/**
 * Apply a partial settings document; omitted fields keep their values.
 * @param partial - close-to-tray and/or launch-at-login.
 * @returns the complete updated document.
 */
abstract setSettings(partial: Partial<DesktopSettingsDoc>): Promise<DesktopSettingsDoc>
```

Source: [`packages/host/desktop/src/index.ts:33`](../../packages/host/desktop/src/index.ts)

<a id="ctxnotifications--notificationservice-abstract-seam"></a>

### `ctx.notifications` — `NotificationService` (abstract seam)

Abstract notification service. Subclass, implement notify, and load the subclass as a plugin — it registers as ctx.notifications (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

notify rejects on delivery failure (unsupported platform, spawn error); the seam defines no fallback, and consumers own failure containment so a broken notification can never break the event dispatch that raised it.

```ts cordis-catalog
/**
 * Deliver one notification on the provider's channel.
 * @param notification - the consumer-built notification to render.
 */
abstract notify(notification: Notification): Promise<void>
```

Source: [`packages/notify/notifications/src/index.ts:33`](../../packages/notify/notifications/src/index.ts)

<a id="ctxupdater--updateservice-abstract-seam"></a>

### `ctx.updater` — `UpdateService` (abstract seam)

Abstract update service. Subclass, implement the three operations, and load the subclass as a plugin — it registers as `ctx.updater` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

```ts cordis-catalog
/**
 * Synchronous snapshot of the channel's last observed update state. It never
 * triggers a check or any network work.
 * @returns the current snapshot.
 */
abstract state(): UpdateState

/**
 * Explicitly trigger one update check. A provider may perform network work
 * here; the no-op provider only advances the check timestamp.
 * @param signal - optional cancellation of the check.
 * @returns the post-check snapshot.
 */
abstract check(signal?: AbortSignal): Promise<UpdateState>

/**
 * Apply one offered update to the named version.
 * @param version - the version to apply.
 * @param signal - optional cancellation of the apply.
 */
abstract apply(version: string, signal?: AbortSignal): Promise<void>
```

Source: [`packages/updater/updater/src/index.ts:45`](../../packages/updater/updater/src/index.ts)
<!-- END GENERATED cordis-surface -->
