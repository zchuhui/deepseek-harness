# Agent Note: In-app directory browser as the web default

Status: implemented

English | [中文](2026-08-16-web-directory-browser-default.zh.md)

## Problem

The adaptive directory-picker row chooses the native operating-system folder dialog for a locally attended Windows host. That dialog confirms a path but does not let the browser application present the selected hierarchy, which makes choosing a project directory difficult to inspect.

## Decision

`dsh-web-app` mounts the paired `dsh-host-directory-picker-browse` and `dsh-client-ui-directory-picker-browse` rows directly. The host lists directories and the client opens its in-app browser, where the operator navigates folder levels, sees the selected folder's children, and confirms the chosen path. The generic `dsh-host-directory-picker-auto` package remains available to compositions that prefer host-dependent selection; a deployment that needs the native dialog replaces both browse rows together.

## Alternatives considered

- **Keep the adaptive chooser in the web bundle.** Rejected: its Windows-local result is the system dialog that hides the hierarchy the application needs to show.
- **Mount both interaction pairs.** Rejected: each backend provides the same `directoryPicker` service and client `single` slots, so duplicate rows fail at load.
- **Rewrite the browser as a second picker.** Rejected: the browse pair already provides directory listing, child navigation, path breadcrumbs, and folder creation; another implementation would duplicate the capability.

## Consequences

The folder control opens an application dialog instead of an OS chooser in the shipped web and desktop Web GUI. Its existing Miller columns reveal one level and the selected folder's child level together; breadcrumbs and path entry support deeper navigation. Choosing the operating-system dialog remains a configuration composition choice, not a runtime fallback.
