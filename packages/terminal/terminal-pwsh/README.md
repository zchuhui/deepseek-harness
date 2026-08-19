# @deepseek-ai/dsh-terminal-pwsh

English | [中文](README.zh.md)

Persistent PowerShell backend for `ctx.terminals` over `ctx.subprocess.spawnTerminal`. It starts `pwsh -NoLogo -NoProfile -NoExit` with a controlled `prompt` function that prints the same private OSC marker and printable `dsh> ` tail as `dsh-terminal-bash`. Enter is `\r`. The executable is [`resolvePwshPath`](../../shell/pwsh-local/README.md). Session objects reuse the bash backend's line-oriented sanitizer and send lifecycle.

## Plugin (`terminal-pwsh`)

The plugin injects `pty`, `sandboxPolicy`, and `subprocess`, then registers the configured backend type (`shell`). `danger-full-access` starts the shell without a sandbox argv prefix. On Windows, any confined mode refuses `terminal_open` before spawn: the ACL runner cannot isolate a new console, so ConPTY plus `sandbox.confine()` stays fail-closed. On POSIX, confined modes wrap argv through `ctx.sandbox` exactly as `dsh-terminal-bash` does. A sandbox-mode change is fenced while the owner has an open PTY or a spawn in progress.

Shipped `standard` / `code` / `cordis` presets omit PTY. Opt-in compositions gate this package with `disabled: !!js process.platform !== 'win32'` and gate `terminal-bash` with the inverted expression. The `minimal` preset disables `terminal-bash` and `tool-bash-persistent` on win32.

Readiness is prompt-marker plus silence inference. Windows has no stdin-wait syscall table, so idle is heuristic, matching macOS.

## Model Experience

### Current file policy and indirect consumer

#### What the model sees

The policy owner contributes capability-neutral `sandbox:policy` context. Through `@deepseek-ai/dsh-tool-terminal` or another PTY consumer, the model may also receive bounded MOTD, send deltas, scrollback pages, readiness reasons, cleanup errors, and the Windows confined-PTY refusal.

#### Token effect

The current-policy clause is present while this backend is mounted. Retained PTY scrollback is not placed in model history until a consumer returns bounded output.

#### KV Cache effect

A standing-policy change appends an owner-rendered superseding runtime-context snapshot after retained history; consumer results remain append-only.

## Known Limitations and Deferred Work

- Confined persistent terminals are unavailable on Windows; only `danger-full-access` may open a PTY.
- Exact stdin-wait detection is unavailable on Windows; readiness is prompt-marker and silence/timeout.
- Line-oriented output is normalized; full-screen alternate-buffer interaction is unsupported.
- Sessions do not survive harness process exit.
