# Agent Note: Native Windows core as a required pull-request check

Status: implemented

English | [中文](2026-08-19-native-windows-core-required-check.zh.md)

## Problem

The Wine `windows` job is the required win32 toolchain signal on `all checks passed`. The native `windows-native` job already runs `check:ci:windows-complete` on `windows-2025` (or the self-hosted failover pool) but stays observational because the full inventory is capacity-expensive and flakes independently of the Wine gate. Windows coding-agent work now depends on ACL runner, ConPTY inspection, Job Objects, and `terminal-pwsh` — facts Wine cannot prove.

## Decision

Keep the Wine `windows` job required and unchanged in role. Add a second required native job, `windows-core`, that runs only `pnpm run check:ci:windows-core`:

- `@deepseek-ai/dsh-sandbox-windows-acl` tests
- `@deepseek-ai/dsh-subprocess-local` inspector and Job Object tests
- `@deepseek-ai/dsh-terminal-pwsh` tests
- `@deepseek-ai/dsh-hook-protocol` tests

Desktop installer staging stays on [desktop-release.yml](../../../../.github/workflows/desktop-release.yml). `windows-native` continues to run the complete inventory and remains out of `all-checks-passed.needs`. The full per-file coverage gate stays observational on native Windows until that job is stable.

Vitest's `windowsUnsupportedPackages` / `windowsUnsupportedTests` shrink to packages that still cannot run: `dsh-bash-local`, `dsh-tool-bash`, `dsh-sandbox-local` POSIX landlock paths, Claude/Codex hook bridges, and POSIX-only spawn specs. Supported Windows packages are no longer excluded solely because they used to throw.

## Alternatives considered

**Promote the entire `windows-native` job.** Rejected: the [native Windows PR CI decision](2026-08-08-native-windows-pull-request-ci.md) still holds for the complete inventory. Capacity and flake isolation stay with the observational job.

**Drop the Wine job once native core exists.** Rejected: Wine remains the cheap, required signal that Windows-facing TypeScript and the toolchain compile under a win32 Node. Native core answers kernel and ConPTY facts Wine cannot.

**Put Windows PTY evidence only in shared snapshots.** Rejected: those fixtures must replay on macOS/Linux. Native suites and Loader specs pin Windows behavior.

## Consequences

A pull request can fail `all checks passed` on a native ACL, Job Object, PTY, or hook-protocol regression without waiting on the complete Windows inventory. Operators still read `windows-native` for coverage completeness.

## Related

[Native Windows pull-request CI](2026-08-08-native-windows-pull-request-ci.md), [Windows ConPTY inspection](../feature/2026-08-19-windows-pty-conpty.md), [Job Object process trees](../feature/2026-08-19-windows-job-object-process-trees.md), [hooks on pwsh](../feature/2026-08-19-hooks-on-pwsh.md).
