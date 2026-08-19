# 在 Windows 上使用 DeepSeek Harness

[English](windows.md) | 中文

本参考描述 `dsh web`、headless 和桌面安装包在 Windows 上的产品路径。它不会试图让 Windows 表现得像 Linux。

## Shell

默认的一次性 shell 是 PowerShell（`pwsh`）。POSIX bash 脚本不会被翻译。

`hooks.json` 中的 hook 命令同样以 PowerShell 运行。bash 或 `sh` shebang 会在 hook 协议层以结构化错误失败，而不是一串 PowerShell 解析输出。

## 沙箱

写隔离使用 Windows ACL 受限令牌 runner，并报告 `enforcement: 'partial'`。授予 Everyone 写访问的对象、NTFS 硬链接，以及授权根之外的 FAT 类卷仍可写入。

本机该工作区第一次受限执行可能阻塞数十秒，因为 Windows 会传播可继承 ACE。异常宽的授权根和 FAT 类卷会记录操作员警告；它们不改变模式名称。

该 runner 不提供读隔离和网络策略。

## 持久终端

持久 PTY 是选择加入的。Windows 使用 `dsh-terminal-pwsh`；Linux 和 macOS 使用 `dsh-terminal-bash`。随发行的 `standard`、`code` 和 `cordis` preset 省略 PTY。

受限 PTY 不可用。只能在 `danger-full-access` 下打开持久终端。一次性 `pwsh` 继续在 ACL runner 下运行。

空闲检测是启发式的：prompt 标记加静默。Windows 没有 stdin 等待的 syscall 表。

## 桌面安装包

Windows x64 安装包嵌入钉死的 Node 运行时和生产 `dsh` 闭包。干净的 Windows 10 22H2 或 Windows 11 x64 机器可以在 PATH 没有 Node 或 `dsh` 的情况下安装并启动。ARM64 是独立工件。

## 与 POSIX 保持不同的边界

这些不是 Windows 移植缺陷：

- 附件祖先目录 `fsync` 依赖 NTFS 日志；JSONL 已经使用 `MoveFileExW(WRITE_THROUGH)`。
- 凭据文件不使用 POSIX `0o600`；改用 ACL 是另一项功能。
- 在不支持硬链接的卷上，`createIfAbsent` 硬链接会失败。
- 沙箱保留 Everyone、不隔离读访问，也没有网络策略。

[Python SDK 示例](./python-sdk.md) 装载 `terminal-bash`，因此除非你替换该后端，否则仍仅限 POSIX。
