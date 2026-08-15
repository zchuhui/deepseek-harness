# Agent Note: Desktop protocol deep links, single instance, and toast activation

Status: implemented

English | [中文](2026-08-15-desktop-protocol-single-instance-toast-activation.zh.md)

## Problem

The desktop shell could deep-link only through its tray item ("open latest notification" navigates the main window by eval). There was no custom URL protocol, a second launch booted a second shell, and toast clicks could not activate the shell — the README deferred activation to the installer milestone's AppUserModelID shortcut.

## Decision

- **The shell owns the `dsh://` protocol.** `tauri-plugin-deep-link` with `plugins.deep-link.desktop.schemes = ["dsh"]` in `tauri.conf.json`; `register_all()` runs at every boot (HKCU on Windows, `x-scheme-handler` on Linux), so dev and unpackaged installs need no installer step.
- **One running shell.** `tauri-plugin-single-instance` (registered first, `deep-link` feature) owns instance identity; on Windows/Linux a protocol launch spawns a second process whose argv carries the URL, and the plugin forwards that argv into the running shell. The callback routes `dsh://` to show the main window and `dsh://session/<id>` to navigate it.
- **One canonical grammar** in `desktop-app/src-tauri/src/deeplink.rs`: `parse_deep_link` accepts only `dsh://` (Home) and `dsh://session/<id>` with `[A-Za-z0-9_-]{1,256}` ids; everything else is dropped. `handle_url` stores session targets as the pending notification deep link and calls `navigate_main` (show/unminimize/focus + `window.location.href` eval), which the tray item now reuses instead of duplicating.
- **Primary cold start by link.** `deep_link().get_current()` is read in `setup` after registration (Windows/Linux pass the link as the only argv entry). macOS receives links as `deep-link://new-url` events and registers a listener; cold-start delivery and scheme registration on macOS stay with the installer milestone.
- **Windows toast activation without the AUMID shortcut.** `toast.rs` renders the bridge toast as a PowerShell 5.1 WinRT toast with `activationType="protocol"` and `launch="dsh://session/<id>"`, so a click starts the protocol handler, which routes back into the running shell. Title, body, and appId are embedded as escaped literals — `escape_xml` then PowerShell single-quote doubling, UTF-16LE base64 `-EncodedCommand` — the same pattern as `packages/notify/notifications-windows`. The toast still displays under PowerShell's AppUserModelID; the shell's own identity waits for the installer milestone.

## Alternatives considered

- **Foreground activation through the shell's own AUMID.** Rejected for now: it requires the installer-registered Start Menu shortcut this milestone defers; protocol activation works in dev and unpackaged installs today.
- **A toast action through `tauri-plugin-notification`.** Rejected: the plugin's desktop builder has no activation callback or action API (only the Android `action_type_id`).
- **Hand-rolled registry writes (`reg.exe`).** Rejected: the deep-link plugin owns registration and keeps the platform surface uniform.
- **Listening for `deep-link://new-url` on Windows/Linux instead of the single-instance callback.** Rejected: the callback owns argv forwarding on those platforms; the event listener is compiled only for macOS, so links never navigate twice.

## Consequences

- Deep links work end-to-end in dev and unpackaged installs: a `dsh://session/<id>` launch from a browser, a shell command, or a toast click opens the session in the main window.
- One navigation path (`navigate_main`) serves tray clicks, protocol launches, and event delivery.
- Windows toast click-through works today; toast identity remains PowerShell's until the installer registers the shell's AUMID (desktop-app README Known Limitations updated).
- macOS/Linux toast click-through is still absent (notification plugin limitation); Linux protocol registration is wired but untested on this host.

Related: [desktop capability seams](2026-08-14-desktop-capability-seams-notifications-updater.md), [shell bridge consumers](2026-08-14-desktop-shell-bridge-consumers.md).
