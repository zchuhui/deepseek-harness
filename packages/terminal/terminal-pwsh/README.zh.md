# @deepseek-ai/dsh-terminal-pwsh

[English](README.md) | 中文

这是一个基于 `ctx.subprocess.spawnTerminal`、为 `ctx.terminals` 提供的持久 PowerShell 后端。它以受控 `prompt` 函数启动 `pwsh -NoLogo -NoProfile -NoExit`；该函数打印与 `dsh-terminal-bash` 相同的私有 OSC 标记和可打印的 `dsh> ` 尾。Enter 为 `\r`。可执行文件由 [`resolvePwshPath`](../../shell/pwsh-local/README.md) 解析。会话对象复用 bash 后端的面向行 sanitizer 与发送生命周期。

## 插件（`terminal-pwsh`）

该插件注入 `pty`、`sandboxPolicy` 和 `subprocess`，然后注册所配置的后端类型（`shell`）。`danger-full-access` 在没有沙箱 argv 前缀的情况下启动 shell。在 Windows 上，任何受限模式都会在 spawn 之前拒绝 `terminal_open`：ACL runner 无法隔离新控制台，因此 ConPTY 加上 `sandbox.confine()` 保持失败关闭。在 POSIX 上，受限模式与 `dsh-terminal-bash` 一样通过 `ctx.sandbox` 包装 argv。当所有者存在开放的 PTY 或正在进行 spawn 时，沙箱模式变更会被闸住。

随发行的 `standard` / `code` / `cordis` preset 省略 PTY。选择加入的组合用 `disabled: !!js process.platform !== 'win32'` 闸住本包，并用相反表达式闸住 `terminal-bash`。`minimal` preset 在 win32 上禁用 `terminal-bash` 和 `tool-bash-persistent`。

就绪是 prompt 标记加静默推断。Windows 没有 stdin 等待的 syscall 表，因此空闲是启发式的，与 macOS 一致。

## 模型体验

### 当前文件策略与间接消费方

#### 模型看到的内容

策略归属方会贡献与具体能力无关的 `sandbox:policy` 上下文。模型通过 `@deepseek-ai/dsh-tool-terminal` 或其他 PTY 消费方还可能收到有界的 MOTD、发送增量、scrollback 页、就绪原因、清理错误，以及 Windows 上受限 PTY 的拒绝。

#### Token 影响

装载该后端期间，当前策略子句会一直存在。消费方返回有界输出前，保留的 PTY scrollback 不会进入模型历史。

#### KV Cache 影响

常驻策略发生变化时，会在保留的历史之后追加一份由归属方渲染、取代先前状态的运行时上下文快照；消费方结果保持仅追加。

## 已知限制与暂缓事项

- Windows 上不可用受限持久终端；只有 `danger-full-access` 可以打开 PTY。
- Windows 上无法进行精确 stdin 等待检测；就绪依赖 prompt 标记和静默／超时。
- 输出按行规范化；不支持全屏备用缓冲区交互。
- harness 进程退出后，会话无法继续存在。
