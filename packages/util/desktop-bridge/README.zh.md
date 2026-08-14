# @deepseek-ai/dsh-desktop-bridge

[English](README.md) | 中文

桌面壳原生桥接的零依赖类型化客户端:一条带 token 鉴权的回环 HTTP API,让 dsh 宿主侧 provider 触达 toast、目录选择、keychain 与 updater 原语。线上契约由 `desktop-app/README.md` 拥有;本包只做客户端类型化。

纯库,非插件:无 ctx,除连接参数外无状态。每个请求携带头 `x-dsh-bridge-token`(当次运行的 token);非 2xx 应答以 `DesktopBridgeError`(状态码 + 壳提供的消息)reject,传输失败以 fetch 错误 reject,keychain 读取 404 解析为 `undefined`。

## 模型体验

无:客户端是宿主侧桥接管道;任何内容都不进入模型请求。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **无重试与退避** —— 每次调用一个请求;桥接流量的重试等有消费者需要时再加。
- **依赖 fetch** —— 客户端依赖 Node 的 fetch 全局;替代传输不在范围内。
