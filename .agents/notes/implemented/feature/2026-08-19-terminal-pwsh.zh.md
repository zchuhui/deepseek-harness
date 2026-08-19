# Agent Note: PowerShell persistent PTY backend

Status: implemented

[English](2026-08-19-terminal-pwsh.md) | 中文

## Problem

[`dsh-terminal-bash`](../../../../packages/terminal/terminal-bash/README.md) 写死 `/bin/bash`、`PS1` 和 bash `PROMPT_COMMAND` OSC 133。Windows 随发行的 profile 挂载的是 pwsh 而不是 bash。在 bash 包里加方言开关会让后端的身份变成平台，而不是它拉起的 shell，这会重复 [pwsh 执行器决策](2026-08-01-pwsh-tool-and-executor.md) 已否决的「一个执行器、模式切换」。

## Decision

`@deepseek-ai/dsh-terminal-pwsh` 是 `dsh-terminal-bash` 的 PowerShell 孪生包。它注册同一个 `shell` 后端类型，复用面向行的 sanitizer 与会话对象，并以受控 `prompt` 函数启动 `pwsh -NoLogo -NoProfile -NoExit`；该函数打印相同的私有 OSC 标记和可打印的 `dsh> ` 尾。Enter 为 `\r`。可执行文件由 [`resolvePwshPath`](../../../../packages/shell/pwsh-local/src/resolve.ts) 解析。

按 [ConPTY 检查决策](2026-08-19-windows-pty-conpty.md)，Windows 上的受限模式拒绝 spawn。`danger-full-access` 在没有沙箱 argv 前缀的情况下启动 shell。

`standard`、`code` 和 `cordis` preset 不挂载 PTY。选择加入的组合用 `disabled: !!js process.platform === 'win32'` 闸住 `terminal-bash`，并用相反表达式闸住 `terminal-pwsh`。

## Alternatives considered

**给 `dsh-terminal-bash` 增加 `shell` 配置枚举。** 否决：后端的身份是它拉起的 shell；平台闸控的组合才是覆盖通道，与 `tool-bash` / `tool-pwsh` 一致。

**注册不同的后端类型 `pwsh`。** 首发否决：`dsh-tool-terminal` 和 `dsh-tool-bash-persistent` 已经选择 `shell`。第二种类型会在没有第二个消费方的情况下拆分面向模型的目录。

**把 bash PROMPT_COMMAND 即时翻译成 pwsh profile 脚本。** 否决：受控 prompt 是私有就绪约定，不是用户 profile。

## Consequences

选择加入持久终端的 Windows 宿主使用 PowerShell，空闲推断与 macOS 同级，且没有受限 PTY。共享的 ACP PTY snapshot 仍仅限 POSIX；Windows 证据是 Loader 组合加上原生套件。

## Related

[Windows ConPTY 检查](2026-08-19-windows-pty-conpty.md)、[持久 PTY 会话](2026-07-16-persistent-pty-sessions.md)、[pwsh 工具与 bash 对齐](2026-08-02-pwsh-tool-bash-parity.md)。
