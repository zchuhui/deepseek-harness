# @deepseek-ai/dsh-notifications

[English](README.md) | 中文

操作员通知能力接缝(`ctx.notifications`)。消费者针对观察到的事件提出一条通知,由 provider 渲染到操作员的渠道上。接缝本身不承载触发策略:桥接决定触发什么(`dsh-notify-events`),provider 决定如何送达(`dsh-notifications-terminal`、`dsh-notifications-windows`)。

抽象类 `NotificationService` 注册为 `ctx.notifications`(每个上下文一个实现,重复加载抛错)。`notify(notification)` 在送达失败(平台不支持、spawn 出错)时 reject;接缝不定义降级,由消费者自行包含失败,保证坏掉的通知不会打断触发它的事件分发。

## 类型

- `Notification { kind, title, body, sessionId? }` —— 只面向操作员;任何字段都不进入会话日志或模型请求。
- `NotificationKindMap` —— 可合并扩展的类别映射;消费者通过声明合并新增类别。

## 模型体验

无:接缝承载的操作员通知永不进入模型请求或会话日志。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求,对任何模型请求的 token 流与缓存前缀均无贡献。

## 已知限制与待办

- **无点击回跳目标** —— `sessionId` 只是关联数据;能够导航的 provider 需要自己实现跳转映射,这属于桌面壳里程碑。
