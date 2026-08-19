# Agent Note: Windows ConPTY process inspection for persistent PTY

Status: implemented

[English](2026-08-19-windows-pty-conpty.md) | 中文

## Problem

`dsh-subprocess-local` 已经通过 `node-pty` 分配终端（Windows 上为 ConPTY），但 `createProcessInspector()` 在 `win32` 上会抛错。因此前台检查、后代拆卸和 `spawnTerminal()` 会在任何 PTY 消费方启动之前失败。Linux 读取 `/proc`；macOS 快照 `ps`。Windows 既没有 POSIX 进程组，也没有 stdin 等待的 syscall 表。

Windows ACL runner 也拒绝 `CREATE_NEW_CONSOLE` / `CREATE_NO_WINDOW`，因为受限令牌子进程会以 `STATUS_DLL_INIT_FAILED` 死亡。因此不能假定把 ConPTY 子进程包进 `sandbox.confine()` 就能工作。

## Decision

`createProcessInspector('win32')` 返回 Windows 检查器。进程树来自 `Win32_Process` 快照（`ProcessId`、`ParentProcessId`、`CreationDate`），解析为 Linux 与 macOS 使用的同一套 pid/启动身份记录。`foregroundPgid` 返回 ConPTY 根 pid：Windows 没有 POSIX 进程组 id，因此本机上 seam 的数值 `processGroupId` 就是该根 pid，绝不是负 pgid。`isStdinWaiting` 恒为 `false`，与 macOS 一致；就绪仍靠 prompt 标记加静默推断。`processSession` 为空。`signalGroup` / `signalProcess` 向正 pid 投递 `process.kill`；它们从不向 `-pid` 发信号。

Windows 上仍拒绝受限 PTY 会话。当所有者的沙箱模式不是 `danger-full-access` 时，`dsh-terminal-pwsh` 在 spawn 之前拒绝 `terminal_open`。模型可见错误会点明该限制。一次性 `pwsh` 继续在 ACL runner 下运行。非受限 PTY 直接使用 `node-pty` ConPTY。

随发行的 `standard` / `code` / `cordis` preset 仍省略 PTY。`minimal` preset 在 win32 上禁用 `terminal-bash` 和 `tool-bash-persistent`。

## Alternatives considered

**把 Windows PID 假装成 POSIX pgid 并向 `-pid` 发信号。** 否决：`process.kill(-pid)` 在 Windows 上无意义，并且会漏掉后代。

**通过 ACL runner 的 argv 前缀运行受限 PTY。** 在原生探针证明 ConPTY 加上 `WRITE_RESTRICTED` 下的 `CreateProcessAsUserW` 能启动 pwsh 之前否决。隐藏控制台的子进程已在 DLL 初始化期间死亡；与其交付半可用的受限 shell，不如失败关闭。

**实现 Linux 风格的 stdin 等待检测。** 否决：Windows 上没有稳定的公开 syscall 表能证明该事实。未知等待在 macOS 上已经是一等就绪未命中。

## Consequences

`spawnTerminal()` 不再仅仅因为宿主是 Windows 而抛错。Windows 上的持久 PTY 是非受限的、启发式空闲的，并且是 opt-in。必须在 macOS/Linux 上回放的无密钥 snapshot 不记录 Windows 名册；改由原生检查器套件和 Loader 组合 spec 钉住。

## Related

pwsh 后端见 [terminal-pwsh](2026-08-19-terminal-pwsh.md)。普通 spawn 的树终止见 [Job Object 进程树](2026-08-19-windows-job-object-process-trees.md)。原先的 PTY 约定仍是[持久 PTY 会话](2026-07-16-persistent-pty-sessions.md)。沙箱控制台缺口记录在 [Windows ACL 受限令牌沙箱](2026-08-08-windows-acl-restricted-token-sandbox.md)。桌面安装包见 [Windows 桌面生产发布](2026-08-15-windows-desktop-production-release.md)。
