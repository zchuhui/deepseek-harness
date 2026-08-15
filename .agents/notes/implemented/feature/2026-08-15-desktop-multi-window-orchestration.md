# Agent Note: Desktop multi-window orchestration

Status: implemented

English | [中文](2026-08-15-desktop-multi-window-orchestration.zh.md)

## Problem

The shell had one window ("main") and every deep link navigated it, replacing whatever the operator was doing. The milestone plan called for multi-window orchestration, and the tray had no way to open another window.

## Decision

- **A window registry** (`desktop-app/src-tauri/src/windows.rs`) tracks every shell-opened window: label ("main" plus monotonic "win-<n>") mapped to its session. Managed state; entries join on open, leave with the window's `Destroyed` event, and "main" starts registered with no session.
- **Deep links route through the registry** (`route_deep_link`): `dsh://` focuses main; a session focuses the window that owns it, or opens a new one. The FIRST link of a cold launch instead chooses the main window's URL — read via `deep_link().get_current()` before the window is built — so a protocol launch boots one window showing that session.
- **The bridge gains a windows plane**: `POST /api/desktop/windows/open { sessionId? }` → `{ label, sessionId }`, `POST /close { label }` (main hides; other windows close), `POST /focus { label }`, and `GET /windows` → the registry snapshot. The typed client (`packages/util/desktop-bridge`) mirrors the four calls.
- **The tray gains 新建窗口** (`open_window` with no session) and routes 打开最新通知 through `route_deep_link`, so a notification targets the window owning its session instead of always navigating main.
- **New windows load `?session=<id>&win=<label>`**; the web client ignores the extra `win` param today, and each window is an independent browser context, so per-window sessions need no client change.

## Alternatives considered

- **Hide-on-close for every window.** Rejected: session windows close for real and their registry entries leave with `Destroyed`; only main keeps the hide-to-tray behavior.
- **Navigating main for every deep link (the previous behavior).** Rejected: it clobbers the operator's main-window context; owning-window focus with a new-window fallback preserves it.
- **A client-to-shell window feedback channel** (the GUI reports which session each window shows). Deferred: registry bookkeeping covers shell-initiated navigation only; the limitation is documented, and the channel waits for the desktop-settings milestone surface that needs it.

## Consequences

- A toast click or protocol launch for a session the operator already has open focuses that window instead of reloading main.
- The bridge windows plane is generic: future host-side consumers (a desktop settings UI, tests) can open, close, focus, and list windows without shell changes.
- Registry bookkeeping is shell-initiated only; sessions opened through the GUI sidebar are untracked (documented limitation).

Related: [protocol deep links, single instance, and toast activation](2026-08-15-desktop-protocol-single-instance-toast-activation.md).
