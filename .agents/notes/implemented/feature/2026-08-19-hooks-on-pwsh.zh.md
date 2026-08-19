# Agent Note: Windows hook commands run as PowerShell

Status: implemented

[English](2026-08-19-hooks-on-pwsh.md) | 中文

## Problem

Hook 桥接已经通过 `ctx.shell` 调用 `runHook`，而 Windows 上的执行器是 pwsh。为 bash 编写的 `hooks.json` 命令仍会到达该执行器。Vitest 在 win32 上排除了每一个 `packages/hooks/*` 套件，因此方言无关的协议测试从未在不匹配出现的地方运行。诸如 `#!/bin/bash` 的 shebang 随后会以令人困惑的 PowerShell 解析错误失败，而不是结构化的 hook 故障。

## Decision

当文本以 bash 或 POSIX `sh` shebang 开头时，`runHook` 在 win32 上拒绝该命令。结果是非阻塞的 `HookOutput`，stderr 点明 PowerShell 是 Windows 方言，并说明 bash 不会被翻译。其他命令仍走 `ctx.shell`。

hook-protocol 单元测试在 Windows 上运行。Claude Code 和 Codex 桥接套件在假定 POSIX 进程组或 bash 夹具期间仍被排除。取消即杀分离组的覆盖仍仅限 POSIX。

Windows 文档写明 hook 命令是 PowerShell。发现 Claude Code 或 Codex 的每会话配置文件不在范围内。

## Alternatives considered

**把 bash hook 脚本翻译成 PowerShell。** 否决：命令字符串由用户编写；静默翻译会改变匹配和副作用。

**从 `runHook` 抛错。** 否决：runner 已经把基础设施故障映射为非阻塞 hook 错误，以便回合继续。

**继续在 Windows 上排除整个 hooks 组。** 否决：codec、matcher 和 merge 测试不需要进程组。

## Consequences

Windows 上的 bash `hooks.json` 会在协议层响亮失败。操作员用 PowerShell 重写命令，或在 POSIX 上运行该组合。原生 CI 可以要求 hook-protocol，而不要求 bash 桥接。

## Related

[pwsh 工具与执行器](2026-08-01-pwsh-tool-and-executor.md)、[原生 Windows 核心必过检查](../process/2026-08-19-native-windows-core-required-check.md)。
