# @deepseek-ai/dsh-updater-desktop

[English](README.md) | 中文

[更新接缝](../updater/README.md)的桌面 provider:`state()` 返回最近一次已知快照(缓存对象由每次 `check()` 整体替换、从不就地修改),`check()` 拉取壳的线上状态,`apply()` 转发给壳——在发布里程碑实现真实下载之前,壳应答 501。桥接环境(`DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`)缺失时在加载期大声失败;壳报告的渠道经 `updateChannel` 品牌化,非法渠道同样大声失败。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `bridgeUrl` | 壳导出的环境变量 | 桥接 URL 覆盖 |
| `bridgeToken` | 壳导出的环境变量 | 桥接 token 覆盖 |
| `timeoutMs` | 5000 | 单请求超时 |
| `channel` | `manual` | 首次检查前报告的渠道 |

## 模型体验

无:provider 只向 host 与壳代码报告更新状态;任何内容都不进入模型请求。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **无下载与安装** —— 壳骨架对 `apply` 应答 501;真实 Tauri Updater 接线属于发布里程碑。
- **仅轮询可得** —— `state()` 读缓存;新鲜度依赖调用方触发 `check()`。
