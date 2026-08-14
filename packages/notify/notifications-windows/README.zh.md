# @deepseek-ai/dsh-notifications-windows

[English](README.md) | 中文

[通知接缝](../notifications/README.md)的 Windows toast provider:通过 Windows PowerShell 5.1 的 WinRT 互操作把每条通知渲染为原生 toast,经 `dsh-native-command` 以无 shell 方式拉起。标题、正文与 AppUserModelID 以转义字面量嵌入 `-EncodedCommand` 载荷,操作员文本永远不会到达 shell 引号边界。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `appId` | PowerShell 自带 AppUserModelID | toast 展示所用的应用身份;自定义值必须是已注册的应用身份 |
| `powershell` | `powershell.exe` | 启动器可执行文件名 |

非 win32 平台与 runner 失败(非零退出或 spawn 出错)都会 reject;其他平台请组合 `dsh-notifications-terminal`。

## 模型体验

无:provider 通过操作系统渲染操作员通知;任何内容都不进入模型请求或会话日志。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **仅支持 PowerShell 5.1** —— WinRT 脚本面向系统自带的 `powershell.exe`,不使用 pwsh 7。
- **toast 无点击回跳** —— 只携带文本;跳回会话的导航属于桌面壳里程碑。
- **无送达确认** —— 操作系统不确认 toast 是否真正展示;runner 只能证明 PowerShell 干净退出。
