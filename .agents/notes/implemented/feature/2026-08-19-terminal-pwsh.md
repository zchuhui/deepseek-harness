# Agent Note: PowerShell persistent PTY backend

Status: implemented

English | [中文](2026-08-19-terminal-pwsh.zh.md)

## Problem

[`dsh-terminal-bash`](../../../../packages/terminal/terminal-bash/README.md) hard-codes `/bin/bash`, `PS1`, and bash `PROMPT_COMMAND` OSC 133. Windows shipped profiles mount pwsh, not bash. Putting a dialect switch inside the bash package would make the backend's identity the platform rather than the shell it spawns, repeating the rejected one-executor mode switch from the [pwsh executor decision](2026-08-01-pwsh-tool-and-executor.md).

## Decision

`@deepseek-ai/dsh-terminal-pwsh` is the PowerShell twin of `dsh-terminal-bash`. It registers the same `shell` backend type, reuses the line-oriented sanitizer and session object, and starts `pwsh -NoLogo -NoProfile -NoExit` with a controlled `prompt` function that prints the same private OSC marker and printable `dsh> ` tail. Enter is `\r`. The executable is [`resolvePwshPath`](../../../../packages/shell/pwsh-local/src/resolve.ts).

Confined modes refuse spawn on Windows per the [ConPTY inspection decision](2026-08-19-windows-pty-conpty.md). `danger-full-access` starts the shell without a sandbox argv prefix.

`standard`, `code`, and `cordis` presets do not mount PTY. Compositions that opt in gate `terminal-bash` with `disabled: !!js process.platform === 'win32'` and `terminal-pwsh` with the inverted expression.

## Alternatives considered

**Add a `shell` config enum to `dsh-terminal-bash`.** Rejected: the backend's identity is the shell it spawns; platform-gated composition is the override channel, matching `tool-bash` / `tool-pwsh`.

**Register a different backend type `pwsh`.** Rejected for the first release: `dsh-tool-terminal` and `dsh-tool-bash-persistent` already select `shell`. A second type would split the model-facing catalog without a second consumer.

**Translate bash PROMPT_COMMAND into pwsh profile scripts on the fly.** Rejected: the controlled prompt is a private readiness contract, not a user profile.

## Consequences

Windows hosts that opt into persistent terminals speak PowerShell, with macOS-class idle inference and no confined PTY. Shared ACP PTY snapshots remain POSIX-only; Windows evidence is Loader composition plus native suites.

## Related

[Windows ConPTY inspection](2026-08-19-windows-pty-conpty.md), [persistent PTY sessions](2026-07-16-persistent-pty-sessions.md), [pwsh tool bash parity](2026-08-02-pwsh-tool-bash-parity.md).
