# Use DeepSeek Harness on Windows

English | [中文](windows.zh.md)

This reference describes the Windows product path for `dsh web`, headless, and the desktop installer. It does not try to make Windows behave like Linux.

## Shell

The default one-shot shell is PowerShell (`pwsh`). POSIX bash scripts are not translated.

Hook commands in `hooks.json` also run as PowerShell. A bash or `sh` shebang fails at the hook protocol layer with a structured error instead of a PowerShell parse dump.

## Sandbox

Write confinement uses the Windows ACL restricted-token runner and reports `enforcement: 'partial'`. Objects that grant Everyone write access, NTFS hard links, and FAT-class volumes outside grant roots can still be written.

The first confined execution for a workspace on this machine can block for tens of seconds while Windows propagates inheritable ACEs. Unusually wide grant roots and FAT-class volumes log operator warnings; they do not change the mode name.

Read isolation and network policy are out of scope on this runner.

## Persistent terminals

Persistent PTY is opt-in. Windows uses `dsh-terminal-pwsh`; Linux and macOS use `dsh-terminal-bash`. Shipped `standard`, `code`, and `cordis` presets omit PTY.

Confined PTY is unavailable. Open a persistent terminal only under `danger-full-access`. One-shot `pwsh` continues to run under the ACL runner.

Idle detection is heuristic: prompt marker plus silence. Windows has no stdin-wait syscall table.

## Desktop installer

The Windows x64 installer embeds a pinned Node runtime and the production `dsh` closure. A clean Windows 10 22H2 or Windows 11 x64 machine can install and start without Node or `dsh` on PATH. ARM64 is a separate artifact.

## Boundaries that stay different from POSIX

These are not Windows port bugs:

- Attachment ancestor-directory `fsync` relies on NTFS journaling; JSONL already uses `MoveFileExW(WRITE_THROUGH)`.
- Credential files do not use POSIX `0o600`; switching to ACL mode bits is a separate feature.
- `createIfAbsent` hard links fail on volumes that do not support hard links.
- The sandbox retains Everyone, does not isolate reads, and has no network policy.

The [Python SDK example](./python-sdk.md) loads `terminal-bash` and therefore stays POSIX-only unless you swap that backend.
