# Agent Note: Deploy preserves the source workspace install state

Status: implemented

English | [中文](2026-08-19-deploy-preserves-source-workspace-state.zh.md)

## Problem

`pnpm deploy --legacy --prod` runs as a filtered production install from the repository root. Both the desktop runtime staging ([stage-runtime.mjs](../../../../desktop-app/scripts/stage-runtime.mjs)) and the Python SDK single-exe builder ([build-exe-for-python-sdk.ts](../../../../scripts/build-exe-for-python-sdk.ts)) invoke it that way, so every release build rewrites the source workspace state file (`node_modules/.pnpm-workspace-state-v1.json`) to `filteredInstall: true`, `production: true`, and `dev: false`. pnpm's `verify-deps-before-run` check (default `install`) then reconstructs the auto-install command from those recorded settings, so the next `pnpm run` — including the pre-push `typecheck` hook — executes `pnpm install --production`. That strips every devDependency and then crashes in the root `postinstall` ([install-lefthook.mjs](../../../../scripts/install-lefthook.mjs)), which statically imported the removed `lefthook` package; the push fails until a full `pnpm install` resets the state. The failure is timing-dependent: it appears after any release build, not in the change that broke it.

## Decision

Both deploy scripts snapshot the source workspace state file (when present) before invoking `pnpm deploy` and restore the exact bytes immediately afterward, on success and failure, so a release build never leaves the development checkout in production-filtered mode. [install-lefthook.mjs](../../../../scripts/install-lefthook.mjs) additionally resolves the `lefthook` package lazily and exits quietly when the package is absent, so even a stray `pnpm install --production` no longer fails at the root postinstall.

## Alternatives considered

**Harden only the root postinstall.** Rejected as the whole fix: the auto-install still removes devDependencies, so the following typecheck fails on missing TypeScript and tsx, and the checkout stays broken until a manual full install.

**Disable `verify-deps-before-run` repository-wide.** Rejected: the repository has no `.npmrc`, and turning off pnpm's out-of-sync detection for every script run is a broader policy change than the defect.

**Run the deploy outside the workspace.** Rejected: `pnpm deploy` must resolve the workspace lockfile and packages, which requires a workspace working directory.

**Run a full `pnpm install` after each deploy.** Rejected: it re-materializes the entire workspace node_modules purely to reset two settings.

## Consequences

Release builds leave the source workspace state untouched, so the next development `pnpm run` and pre-push hook behave normally without a manual reinstall. The root postinstall is now a no-op under production installs, matching its role as a dev-only hook installer. Each deploy script carries a small snapshot/restore around the pnpm invocation.
