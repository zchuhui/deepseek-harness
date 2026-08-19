# Agent Note: Native Windows core as a required pull-request check

Status: implemented

[English](2026-08-19-native-windows-core-required-check.md) | 中文

## Problem

Wine `windows` job 是 `all checks passed` 上必过的 win32 工具链信号。原生 `windows-native` job 已经在 `windows-2025`（或自托管故障转移池）上运行 `check:ci:windows-complete`，但保持观察性，因为完整清单容量昂贵，并且会独立于 Wine 闸门抖动。Windows 编码 Agent 工作现在依赖 ACL runner、ConPTY 检查、Job Object 和 `terminal-pwsh` — 这些事实 Wine 无法证明。

## Decision

保持 Wine `windows` job 必过，角色不变。增加第二个必过的原生 job `windows-core`，只运行 `pnpm run check:ci:windows-core`：

- `@deepseek-ai/dsh-sandbox-windows-acl` 测试
- `@deepseek-ai/dsh-subprocess-local` 检查器与 Job Object 测试
- `@deepseek-ai/dsh-terminal-pwsh` 测试
- `@deepseek-ai/dsh-hook-protocol` 测试

桌面安装包 staging 仍在 [desktop-release.yml](../../../../.github/workflows/desktop-release.yml)。`windows-native` 继续运行完整清单，并且仍不在 `all-checks-passed.needs` 中。完整的按文件覆盖闸门在原生 Windows 上保持观察性，直到该 job 稳定。

Vitest 的 `windowsUnsupportedPackages` / `windowsUnsupportedTests` 缩小到仍然不能运行的包：`dsh-bash-local`、`dsh-tool-bash`、`dsh-sandbox-local` 的 POSIX landlock 路径、Claude/Codex hook 桥接，以及仅 POSIX 的 spawn spec。已支持的 Windows 包不再仅仅因为曾经抛错而被排除。

## Alternatives considered

**提升整个 `windows-native` job。** 否决：完整清单的 [原生 Windows PR CI 决策](2026-08-08-native-windows-pull-request-ci.md) 仍然成立。容量与抖动隔离仍归观察性 job。

**一旦存在原生核心就丢掉 Wine job。** 否决：Wine 仍是廉价、必过的信号，证明面向 Windows 的 TypeScript 和工具链能在 win32 Node 下编译。原生核心回答 Wine 无法回答的内核与 ConPTY 事实。

**只把 Windows PTY 证据放进共享 snapshot。** 否决：那些夹具必须在 macOS/Linux 上回放。原生套件和 Loader spec 钉住 Windows 行为。

## Consequences

拉取请求可以因为原生 ACL、Job Object、PTY 或 hook-protocol 回归而让 `all checks passed` 失败，而不必等待完整 Windows 清单。操作员仍阅读 `windows-native` 以了解覆盖完整性。

## Related

[原生 Windows 拉取请求 CI](2026-08-08-native-windows-pull-request-ci.md)、[Windows ConPTY 检查](../feature/2026-08-19-windows-pty-conpty.md)、[Job Object 进程树](../feature/2026-08-19-windows-job-object-process-trees.md)、[hooks 跑在 pwsh 上](../feature/2026-08-19-hooks-on-pwsh.md)。
