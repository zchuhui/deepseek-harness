# Agent Note: Windows ConPTY process inspection for persistent PTY

Status: implemented

English | [中文](2026-08-19-windows-pty-conpty.zh.md)

## Problem

`dsh-subprocess-local` already allocates terminals through `node-pty`, which uses ConPTY on Windows, but `createProcessInspector()` throws on `win32`. Foreground inspection, descendant teardown, and `spawnTerminal()` therefore fail before any PTY consumer can start. Linux reads `/proc`; macOS snapshots `ps`. Windows has neither POSIX process groups nor a stdin-wait syscall table.

The Windows ACL runner also refuses `CREATE_NEW_CONSOLE` / `CREATE_NO_WINDOW` because restricted-token children die with `STATUS_DLL_INIT_FAILED`. Wrapping a ConPTY child in `sandbox.confine()` therefore cannot be assumed to work.

## Decision

`createProcessInspector('win32')` returns a Windows inspector. Process trees come from a `Win32_Process` snapshot (`ProcessId`, `ParentProcessId`, `CreationDate`) parsed into the same pid/start-identity records Linux and macOS use. `foregroundPgid` returns the ConPTY root pid: Windows has no POSIX process-group id, so the seam's numeric `processGroupId` on this host is that root pid, never a negative pgid. `isStdinWaiting` is always `false`, matching macOS; readiness stays prompt-marker plus silence inference. `processSession` is empty. `signalGroup` / `signalProcess` deliver `process.kill` to the positive pid; they never signal `-pid`.

Confined PTY sessions stay refused on Windows. `dsh-terminal-pwsh` rejects `terminal_open` before spawn when the owner's sandbox mode is not `danger-full-access`. The model-visible error names that restriction. One-shot `pwsh` continues to run under the ACL runner. Unconfined PTY uses `node-pty` ConPTY directly.

Shipped `standard` / `code` / `cordis` presets still omit PTY. The `minimal` preset disables `terminal-bash` and `tool-bash-persistent` on win32.

## Alternatives considered

**Pretend Windows PIDs are POSIX pgids and signal `-pid`.** Rejected: `process.kill(-pid)` is meaningless on Windows and would miss descendants.

**Run confined PTY through the ACL runner argv prefix.** Rejected until a native probe proves ConPTY plus `CreateProcessAsUserW` under `WRITE_RESTRICTED` starts pwsh. Hidden-console children already die during DLL init; fail closed rather than ship a half-working confined shell.

**Implement Linux-style stdin-wait detection.** Rejected: there is no stable public syscall table for that fact on Windows. Unknown wait is already a first-class readiness miss on macOS.

## Consequences

`spawnTerminal()` no longer throws solely because the host is Windows. Persistent PTY on Windows is unconfined, heuristic-idle, and opt-in. Keyless snapshots that must replay on macOS/Linux do not record the Windows roster; native inspector suites and Loader composition specs pin it instead.

## Related

The pwsh backend is [terminal-pwsh](2026-08-19-terminal-pwsh.md). Tree kill for ordinary spawns is [Job Object process trees](2026-08-19-windows-job-object-process-trees.md). The original PTY contract remains [persistent PTY sessions](2026-07-16-persistent-pty-sessions.md). The sandbox console gap is documented in [Windows ACL restricted-token sandbox](2026-08-08-windows-acl-restricted-token-sandbox.md). Desktop installers are [Windows desktop production release](2026-08-15-windows-desktop-production-release.md).
