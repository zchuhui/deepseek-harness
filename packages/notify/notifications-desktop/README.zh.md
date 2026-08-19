# @deepseek-ai/dsh-notifications-desktop

[English](README.md) | 中文

[通知接缝](../notifications/README.md)的桌面 provider:经桌面壳桥接把每条通知渲染为原生 toast。桥接环境(`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`)缺失时在加载期大声失败,组合行不可能静默退化为无通知。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `bridgeUrl` | 壳导出的环境变量 | 桥接 URL 覆盖 |
| `bridgeToken` | 壳导出的环境变量 | 桥接 token 覆盖 |
| `timeoutMs` | 5000 | 单请求超时 |
| `backgroundOnlyKinds` | `['turn-completed']` | 窗口在前台时壳抑制的通知类别 |

## 模型体验

无:provider 经桌面壳渲染操作员通知;任何内容都不进入模型请求或会话日志。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **macOS/Linux 无点击穿透** —— Windows toast 经 `dsh://session/<id>` 协议激活可点击回跳会话;其余平台 notification 插件没有激活回调。
- **无送达确认** —— 壳只能证明接受了 toast 请求,不能证明操作系统真正展示。
