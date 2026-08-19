# Agent Note: Windows hook commands run as PowerShell

Status: implemented

English | [中文](2026-08-19-hooks-on-pwsh.zh.md)

## Problem

Hook bridges already call `runHook` over `ctx.shell`, which is pwsh on Windows. `hooks.json` commands written for bash still reach that executor. Vitest excluded every `packages/hooks/*` suite on win32, so dialect-neutral protocol tests never ran where the mismatch surfaces. A shebang such as `#!/bin/bash` then fails as a confusing PowerShell parse error instead of a structured hook fault.

## Decision

`runHook` rejects a command on win32 when the text starts with a bash or POSIX `sh` shebang. The result is a non-blocking `HookOutput` with stderr naming PowerShell as the Windows dialect and stating that bash is not translated. Other commands still go through `ctx.shell`.

Hook-protocol unit tests run on Windows. Claude Code and Codex bridge suites stay excluded while they assume POSIX process groups or bash fixtures. Cancel-kills-detached-group coverage remains POSIX-only.

Windows documentation states that hook commands are PowerShell. Discovering Claude Code or Codex per-session config files is out of scope.

## Alternatives considered

**Translate bash hook scripts into PowerShell.** Rejected: the command string is user-authored; silent translation would change matching and side effects.

**Throw from `runHook`.** Rejected: the runner already maps infrastructure faults to non-blocking hook errors so the turn proceeds.

**Keep excluding the entire hooks group on Windows.** Rejected: codec, matcher, and merge tests do not need process groups.

## Consequences

A bash `hooks.json` on Windows fails loudly at the protocol layer. Operators rewrite commands in PowerShell or run the composition on POSIX. Native CI can require hook-protocol without requiring the bash bridges.

## Related

[pwsh tool and executor](2026-08-01-pwsh-tool-and-executor.md), [native Windows core required check](../process/2026-08-19-native-windows-core-required-check.md).
