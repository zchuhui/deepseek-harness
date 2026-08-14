# @deepseek-ai/dsh-notifications-terminal

[English](README.md) | 中文

[通知接缝](../notifications/README.md)的终端 provider:每条通知渲染为一行带标签的主机控制台日志,是 headless 的默认形态。渲染行格式为 `[dsh] <title>: <body>`。

provider 没有配置项:组合时把它选为 `ctx.notifications` 行即可,适用于一切存在控制台的环境。

## 模型体验

无:provider 把操作员通知渲染到主机控制台;任何内容都不进入模型请求或会话日志。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **仅控制台可见** —— 只有在组合了带控制台输出的 logger 时才能看到;后台或纯 GUI 运行需要 toast 类 provider,例如 `dsh-notifications-windows`。
