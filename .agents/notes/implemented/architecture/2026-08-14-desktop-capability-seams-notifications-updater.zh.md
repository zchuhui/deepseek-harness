# Agent Note: 桌面端里程碑能力接缝:notifications 与 updater

Status: implemented

[English](2026-08-14-desktop-capability-seams-notifications-updater.md) | 中文

## 问题

桌面端产品方案(Tauri 壳 + dsh web 运行时)需要 keychain、通知、更新、目录选择四项能力,初稿把它们全塞进一个 Rust “Desktop Bridge” 黑盒。仓库规则正相反:有多个消费者的能力必须落在能力接缝(Service Definition / Service Provider / Consumer)上,让壳只是一个 provider 而不是唯一入口,headless、CLI 与测试替身才有同一条语义路径。通知尤其没有家——harness 完全没有外部通知通道(`schedule` 只是会话内提醒,`ui-sidebar` 明确记录“不存在完成/错误通知源”);更新也没有渠道/状态词汇。

## 决策

三个接缝先落在主仓,壳工程之后再在同一批 Service Definition 后面接入 Tauri provider。

- `ctx.notifications`(`packages/notify/notifications`):抽象 `NotificationService`;`notify(notification)` 在送达失败时 reject,接缝不定义降级——由消费者包含失败,坏掉的通知绝不能打断触发它的事件分发。`Notification { kind, title, body, sessionId? }` 只面向操作员;任何字段都不进入会话日志或模型请求。
- Provider:`notifications-terminal` 渲染一行带标签的 logger 输出(headless 默认);`notifications-windows` 经 PowerShell 5.1 WinRT 互操作、由 `dsh-native-command` 无 shell 拉起原生 toast,把标题/正文/appId 以转义字面量嵌入 `-EncodedCommand` 载荷(操作员文本永不经过 shell 引号边界),非 win32 平台 reject。
- `notify-events` 桥:任务结算经 `ctx.jobs.onJobDone`(注册表只通过服务回调送达结算——jobs 不发射任何 Cordis 事件),审批等待与失败回合经 durable `approval/asked`/`turn/end` 通过 `session/event` 观察,另有 `tool-failed`——桥接把该类别声明合并进 `NotificationKindMap`,默认关闭,因为逐调用工具失败可恢复且频繁。各类开关是经校验的 Config;插件卸载时全部订阅撤销;送达失败被包含并记录日志。
- `ctx.updater`(`packages/updater/updater`):抽象 `UpdateService`,含 `state()`/`check(signal?)`/`apply(version, signal?)`;品牌化 `UpdateChannel` 在构造时校验(空名、多行、含空白都在加载期大声失败);`UpdateState` 携带 channel、currentVersion、checkedAt、available、lastFailure。`updater-manual` 是 `apply` 恒 reject 的 no-op provider。
- 目录选择**不加新接缝**:`host/directory-picker` 已经拥有交互形态问题(native——含 Windows IFileOpenDialog——、browse 与自适应组合)。桌面壳日后通过 `DirectoryPickerCapabilities` 声明合并加入自己的交互。方案里的 `ctx.dialogs` 作废,不再构建。
- Windows 启动器(`scripts/desktop-launch`:`launch.ps1`、`launch.cmd`、README)拉起 `dsh web`(源码、全局 `dsh`、或明确报错三种发现路径),探测端口、轮询就绪并打开浏览器——壳落地前的过渡品。

## 备选方案

- **纯 Rust 的 Desktop Bridge(方案原形态)。** 否决:单一消费者、没有 headless 与测试替身路径,违反仓库对一切可换能力适用的接缝规则。
- **默认对每次工具失败都触发。** 否决:agent 逐调用失败并恢复是常态;可选的 `toolFailed` 开关保持默认安静。
- **经 Cordis 事件观察 jobs。** 目前不可能——结算只经 `onJobDone` 回调送达观察者;桥接改经 `ctx.effect` 注册。
- **与 picker 并列的 `ctx.dialogs` 接缝。** 否决:重复现有接缝的交互形态契约;桌面壳需要的是变体,不是第二个注册表。
- **用 pwsh 7 发 toast。** 否决:Windows 只保证系统自带 `powershell.exe`。

## 后果

- Tauri 壳日后在 `ctx.notifications`(原生 toast、点击回跳)与 `ctx.updater`(Tauri Updater、签名校验、回滚)后面接入 provider,并新增一种 picker 交互变体——host 侧语义与测试随换随用。
- 六个新包全部与模型无关,已登记进 Model Experience 验证器的审计句清单。
- 未改任何出厂 bundle 默认:headless/CI 通过组合行采用终端 provider,桥保持可选项。
- 方案文档 5.5.2 的 dialog 条目被现有 directory-picker 接缝取代(方案位于版本控制之外的 `.local-plugins`)。
