# @deepseek-ai/dsh-host-desktop-shell

[English](README.md) | 中文

[桌面宿主接缝](../desktop/README.md)的桌面壳桥接 provider：通过把窗口报告与设置读写转发给桌面壳桥接来实现 `ctx.desktopHost`。桥接环境（`DSH_DESKTOP_BRIDGE_URL`／`DSH_DESKTOP_BRIDGE_TOKEN`）缺失时在加载期大声失败，组合行不可能静默退化为无宿主控制。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `bridgeUrl` | 壳导出的环境变量 | 桥接 URL 覆盖 |
| `bridgeToken` | 壳导出的环境变量 | 桥接 token 覆盖 |
| `timeoutMs` | 5000 | 单请求超时 |

## 模型体验

无：provider 把窗口报告与设置转发给桌面壳；任何内容都不进入模型请求或会话日志。

#### KV Cache 影响

无；本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **无文件回退** —— provider 只经壳桥接读写；`closeToTray`／`launchAtLogin` 没有文件或环境回退。
- **写依赖桥接** —— 壳不可达时，`setSettings` 与 `reportWindow` 拒绝。
