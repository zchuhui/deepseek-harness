# @deepseek-ai/dsh-updater

[English](README.md) | 中文

DeepSeek Harness 的更新能力接缝。抽象类 `UpdateService`(`ctx.updater`)是它的 Service Definition。provider 在三个操作背后提供真实的更新源与安装机制:`state()` 同步返回一个渠道最近观察到的事实快照、不做任何网络操作;`check(signal?)` 显式触发一次检查并返回检查后的快照;`apply(version, signal?)` 应用一个已提供的更新。渠道是品牌化 `UpdateChannel` —— `updateChannel(value)` 工厂在构造时拒绝空名、多行名与含空白名,使错误配置在加载时就大声失败,而不是拖到检查时刻。

`UpdateState` 快照携带渠道、已安装的 `currentVersion`(未安装时为 `null`)以及三个可选事实:`checkedAt`(首次检查前不存在)、`available`(提供的 `{ version, publishedAt }`;检查确认已是最新时为 `null`,未检查前不存在)、`lastFailure`(最近一次检查失败及其时间,从未失败时不存在)。接缝不定义 Cordis 事件,也没有插件配置。provider 通过继承 `UpdateService` 注册为 `ctx.updater`;每个上下文一个实现,重复加载抛错。no-op provider 见 [`@deepseek-ai/dsh-updater-manual`](../updater-manual/README.md)。

## 模型体验

无:接缝只向 host 与 provider 代码报告更新状态;任何内容都不进入模型请求。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求,对任何模型请求的 token 流与缓存前缀均无贡献。

## 已知限制与待办

- **不附带 provider** —— 接缝只声明能力而不带实现,组合必须加载类似 `@deepseek-ai/dsh-updater-manual` 的 provider;接缝本身不能在运行时选择。
- **仅轮询可得** —— 更新可用性通过调用 `state()`/`check()` 发现,从不通过 Cordis 事件推送,消费者必须轮询才能察觉变化。
