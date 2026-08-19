# @deepseek-ai/dsh-notify-events

[English](README.md) | 中文

[通知接缝](../notifications/README.md)的事件桥:针对观察到的每类事实各提出一条通知——后台任务结算(`ctx.jobs.onJobDone`)、审批等待(durable `approval/asked`)、回合失败(带 error 原因的 `turn/end`)、回合完成(带 `completed` 原因的 `turn/end`),以及(可选加入的)工具调用失败(携带 error 的 `tool/result`)。所有触发源都已在 harness 中,本插件只做分类与转发。送达失败被包含并记录日志,绝不抛回事件分发。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `jobSettled` | true | 每个后台任务进入终态时触发 |
| `approvalWaiting` | true | 出现等待审批时触发 |
| `turnFailed` | true | 回合因错误终止时触发 |
| `turnCompleted` | false | 回合成功完成时触发;默认关闭,因为完成频繁且通常就在眼前 |
| `toolFailed` | false | 工具调用失败时触发;默认关闭,因为工具失败可恢复且频繁 |

桥接把 `tool-failed` 与 `turn-completed` 类别通过声明合并加入 `NotificationKindMap`。插件卸载时所有订阅一并撤销。

## 模型体验

无:桥接的每条通知都派生自发射方包已记录的事实;本包不注册任何面向模型的内容。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求。

## 已知限制与待办

- **无按任务类型过滤** —— 结算对每个终态后台任务都会触发;按生产类型过滤等有消费者需要时再加。
- **无主任务不携带 sessionId** —— 无主后台工作的关联需要所属产品提供身份。
