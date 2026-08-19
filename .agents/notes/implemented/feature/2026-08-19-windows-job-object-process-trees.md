# Agent Note: Job Object process trees for local Windows spawn

Status: implemented

English | [中文](2026-08-19-windows-job-object-process-trees.zh.md)

## Problem

The Windows ACL runner already assigns confined children to a Job Object with `KILL_ON_JOB_CLOSE`. Ordinary `dsh-subprocess-local` spawns do not: `terminate` shells out to `taskkill /T /F`, and `treeAlive` on win32 watches only the direct child. Named-pipe grandchildren, ACP teardown, and LSP servers can outlive the handle the harness thinks it owns.

## Decision

On win32, `spawn()` assigns the child to a Job Object created with `KILL_ON_JOB_CLOSE`. `waitForExit` still awaits the Node child handle; `treeAlive` and `terminate` treat the job as the tree identity. Closing the job kills remaining descendants. `taskkill /T /F` remains only when job creation or assignment fails, and the subprocess README states that fallback.

PTY teardown uses the Windows process inspector from the [ConPTY decision](2026-08-19-windows-pty-conpty.md). Ordinary spawn and PTY inspection share the pid/start-identity table so two kill strategies do not invent two liveness facts.

Force-kill remains immediate. Windows does not gain POSIX signal negotiation.

## Alternatives considered

**Keep `taskkill` as the only tree kill.** Rejected: it is best-effort, PATH-dependent, and races PID reuse. The ACL runner already proved Job Objects for the confined path.

**Depend on `dsh-sandbox-windows-acl` from subprocess-local.** Rejected: Job Objects are a host process-tree primitive, not a sandbox policy. subprocess-local talks to kernel32 through the same koffi pattern without importing the ACL package.

**Wait for every job member in `waitForExit`.** Rejected for this change: Node already owns the direct child's exit; `treeAlive` covers descendants after that exit. Changing wait semantics would alter every ACP and tool timeout.

## Consequences

ACP, LSP, and one-shot pwsh teardown follow the confined runner's kill-on-close rule when the job attaches. Native suites cover grandchildren and the `taskkill` fallback. POSIX spawn tests stay excluded on Windows.

## Related

[Windows ConPTY inspection](2026-08-19-windows-pty-conpty.md), [Windows ACL restricted-token sandbox](2026-08-08-windows-acl-restricted-token-sandbox.md).
