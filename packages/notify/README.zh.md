# notify/ — 操作员通知

[English](README.md) | 中文

提出并送达操作员通知的能力族:桥接对 harness 已发出的事实分类,provider 把它们渲染到操作员的渠道。全部为 **product** 包。

| 包 | 角色 | ctx key |
|---|---|---|
| [`notifications/`](notifications/README.md) | 通知能力接缝 | `ctx.notifications` |
| [`notifications-terminal/`](notifications-terminal/README.md) | 终端 provider:每条通知一行带标签日志 | 注册 `ctx.notifications` |
| [`notifications-windows/`](notifications-windows/README.md) | 经 PowerShell WinRT 互操作的 Windows toast provider | 注册 `ctx.notifications` |
| [`notify-events/`](notify-events/README.md) | 事件桥:任务结算、审批、失败回合、可选工具失败 | 消费 `ctx.notifications` 与 `ctx.jobs` |
| [`notifications-desktop/`](notifications-desktop/README.md) | 经壳桥接的桌面 toast provider | 注册 `ctx.notifications` |

本族没有任何模型可见内容:每条通知都派生自发射方包已拥有的事实。
