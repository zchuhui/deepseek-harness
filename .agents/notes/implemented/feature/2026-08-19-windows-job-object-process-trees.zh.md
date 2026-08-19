# Agent Note: Job Object process trees for local Windows spawn

Status: implemented

[English](2026-08-19-windows-job-object-process-trees.md) | 中文

## Problem

Windows ACL runner 已经把受限子进程分配到带 `KILL_ON_JOB_CLOSE` 的 Job Object。普通的 `dsh-subprocess-local` spawn 没有：`terminate` 会外壳调用 `taskkill /T /F`，而 win32 上的 `treeAlive` 只监视直接子进程。命名管道孙进程、ACP 拆卸和 LSP 服务器可以在 harness 自以为拥有的句柄之后继续存活。

## Decision

在 win32 上，`spawn()` 把子进程分配到以 `KILL_ON_JOB_CLOSE` 创建的 Job Object。`waitForExit` 仍等待 Node 子进程句柄；`treeAlive` 和 `terminate` 把 job 当作树身份。关闭 job 会杀掉剩余后代。仅当 job 创建或分配失败时才保留 `taskkill /T /F`，并且 subprocess README 写明该回退。

PTY 拆卸使用 [ConPTY 决策](2026-08-19-windows-pty-conpty.md) 中的 Windows 进程检查器。普通 spawn 与 PTY 检查共享 pid/启动身份表，因此两种杀策略不会发明两套存活事实。

强制终止仍然立即生效。Windows 不获得 POSIX 信号协商。

## Alternatives considered

**把 `taskkill` 当作唯一的树终止。** 否决：它是尽力而为的、依赖 PATH 的，并且会与 PID 复用竞态。ACL runner 已经在受限路径上证明了 Job Object。

**让 subprocess-local 依赖 `dsh-sandbox-windows-acl`。** 否决：Job Object 是宿主进程树原语，不是沙箱策略。subprocess-local 用同一套 koffi 模式与 kernel32 对话，而不导入 ACL 包。

**在 `waitForExit` 中等待每一个 job 成员。** 本次变更否决：Node 已经拥有直接子进程的退出；该退出之后由 `treeAlive` 覆盖后代。改变等待语义会改动每一次 ACP 和工具超时。

## Consequences

当 job 附加成功时，ACP、LSP 和一次性 pwsh 拆卸遵循受限 runner 的关闭即杀规则。原生套件覆盖孙进程和 `taskkill` 回退。POSIX spawn 测试在 Windows 上仍被排除。

## Related

[Windows ConPTY 检查](2026-08-19-windows-pty-conpty.md)、[Windows ACL 受限令牌沙箱](2026-08-08-windows-acl-restricted-token-sandbox.md)。
