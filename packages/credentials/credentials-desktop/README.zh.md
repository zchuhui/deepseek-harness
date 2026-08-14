# @deepseek-ai/dsh-credentials-desktop

[English](README.md) | 中文

[凭据接缝](../credentials/README.md)的桌面 keychain provider:经桌面壳桥接解析引用,分层为进程环境(只读、优先)覆盖 keychain(provider 管理、可写)。非空环境值遮蔽 keychain,遮蔽期间 `set`/`unset` 拒绝——接缝级的大声失败规则。空的存储值或环境值处处视为不存在。桥接环境(`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`)缺失时在加载期大声失败。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `bridgeUrl` | 壳导出的环境变量 | 桥接 URL 覆盖 |
| `bridgeToken` | 壳导出的环境变量 | 桥接 token 覆盖 |
| `timeoutMs` | 5000 | 单请求超时 |

## 模型体验

无:provider 在操作边界为 host 消费者解析凭据;密钥值永不进入模型请求或会话日志。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **无文件回退层** —— 与本地 provider 不同,桌面 provider 只在 keychain 之上叠加环境层;项目与用户 `.env` 回退仍归 `dsh-credentials-local`。
- **写依赖桥接** —— 壳不可达时,`describe` 报告 `writable: false`,`set`/`unset` 拒绝。
