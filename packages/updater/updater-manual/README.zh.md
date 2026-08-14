# @deepseek-ai/dsh-updater-manual

[English](README.md) | 中文

更新接缝的 no-op provider。它继承 UpdateService 并注册为 ctx.updater,报告配置的渠道与已安装版本,不获取也不安装任何东西。state() 返回同步快照:首次检查前只报告 channel 与 currentVersion(未安装时为 null);check() 记录当前时间戳并把渠道报告为已是最新(available: null),因为手动 provider 没有更新源;apply() 恒 reject,错误信息为 manual updater cannot apply updates; compose a real updater provider。该 provider 从不填充 lastFailure。

配置经 Schemastery 校验。channel(默认 manual)是更新渠道名,currentVersion(默认 null,即未安装)是快照报告的版本。默认化是显式的 resolveSpec(config) 步骤——显式 channel 优先于 manual,显式 currentVersion 优先于未安装——绝不在服务内部藏着 ?? default。非法渠道在加载期大声失败:resolveSpec 经 updateChannel 品牌化渠道,后者拒绝空名、多行名与含空白名。

## 模型体验

无:手动 provider 只向 host 代码报告更新状态;任何内容都不进入模型请求。

#### KV Cache 影响

无:本包不组装也不发送任何 provider 请求,对任何模型请求的 token 流与缓存前缀均无贡献。

## 已知限制与待办

- **无下载与安装** —— apply 恒 reject、check 从不咨询更新源,因此该 provider 只能报告状态,永远无法真正获取或安装更新。
- **无签名校验语义** —— provider 不定义更新真实性契约(无签名、无固定),真实 provider 在应用任何更新前必须自行补充。
- **无回滚** —— apply 不提供回退已应用更新的途径,而手动 provider 从不应用更新,回滚仍是未来 provider 的职责。
