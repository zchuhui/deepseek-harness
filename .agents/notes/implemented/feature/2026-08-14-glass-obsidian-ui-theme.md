# Agent Note: Glass Obsidian built-in Web theme

Status: implemented

English | [中文](2026-08-14-glass-obsidian-ui-theme.zh.md)

## Problem

The Web client needed an optional, premium glass visual treatment without changing the default appearance, delaying the first paint, or scattering theme-specific selectors through feature CSS Modules.

## Decision

`glass-obsidian` is a fourth built-in `ui-theme.preference` value. The Host bootstrap and `ThemePresenter` both write `body[data-dsw-theme]`, so a stored Glass Obsidian choice is available before React renders and remains current after runtime changes. The new `glass-obsidian.css` owns its deep-blue palette, translucent semantic surface tokens, guarded `backdrop-filter`, and opaque fallback for browsers without blur support. Feature modules consume the existing semantic tokens plus narrowly named glass aliases; they do not define another palette.

Blur applies only to stable application chrome and floating surfaces: the application frame, sidebar, conversation shell, inspector, composer, menus, dialogs, and hover cards. Transcript rows, tool output, and code blocks remain opaque, avoiding blur behind high-volume scrolling content. Glass Obsidian is opt-in; the stored default remains `system`.

## Verification

Focused Vitest coverage confirms the setting schema, Host bootstrap, runtime persistence, appearance selection, DOM theme attribute, and web stylesheet order. The Web build and focused documentation-pairing check cover the browser artifact and paired documentation.

## Alternatives considered

**A separately installed theme plugin.** An external plugin can register runtime tokens, but the current built-in preference schema and pre-React bootstrap cannot persist or paint that dynamic id without adding a new cross-package extension protocol. It would also need global CSS ownership over independent component modules. The built-in product theme is the smaller complete path.

**Apply blur to every panel and message.** This creates repeated backdrop compositing in the scrolling transcript, weakens text contrast, and makes tool and code output visually unstable. Restricting blur preserves the glass hierarchy without turning content into decoration.

## Consequences

Users can select and retain Glass Obsidian alongside Light, Dark, and System. Later built-in themes can use the same preference, bootstrap, attribute, stylesheet, and token path. A third-party plugin still requires an explicit persistent-theme extension before it can become a first-class prepaint appearance option.
