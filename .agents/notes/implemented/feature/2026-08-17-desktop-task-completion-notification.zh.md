# Agent Note: 任务完成通知 —— turn-completed 触发、仅后台桌面 toast 与 desktop profile

Status: implemented

[English](2026-08-17-desktop-task-completion-notification.md) | 中文

## 问题

回合完成时桌面壳不产生任何操作员通知。通知能力早已以包的形式存在——`ctx.notifications` 接缝、`dsh-notify-events` 桥,以及 terminal/windows/desktop 三个 provider——但桥没有「成功完成」触发,而且没有任何已发布 profile 挂载它们。

## 决策

- **`dsh-notify-events` 增加 `turn-completed` 触发。** 桥在 `reason.kind === 'completed'` 的 `turn/end` 上提出 `{ kind: 'turn-completed', title: '任务完成', body: '回复已生成', sessionId }`,受 `turnCompleted` 开关控制,默认 false(完成频繁且通常就在眼前)。该类别通过声明合并加入 `NotificationKindMap`,与 `tool-failed` 并列。
- **仅后台的桌面 toast。** `dsh-notifications-desktop` 新增 `backgroundOnlyKinds`(默认 `['turn-completed']`);命中的通知经 `dsh-desktop-bridge.toast(..., backgroundOnly)` 把 `backgroundOnly: true` 送到 `POST /api/desktop/toast`。壳新增的 `windows::is_any_window_focused` 在任一注册窗口持有焦点时抑制 `backgroundOnly` toast,因此提醒只在操作员离开时触发。
- **独立的 `desktop` profile。** 壳现在启动 `dsh --profile desktop`(新增 `desktop` profile 模板:`dsh-base` + `dsh-web-app` + `dsh-desktop`)。新增的 `dsh-desktop` bundle 挂载 `dsh-notify-events`(`turnCompleted: true`)+ `dsh-notifications-desktop`。此前壳启动的是普通 `web` profile,后者没有挂载任何通知行。
- **终端通知。** `dsh-headless` bundle 挂载 `dsh-notify-events`(`turnCompleted: true`)+ `dsh-notifications-terminal`,使一次性 CLI 运行在完成时向宿主控制台打印提示行。

## 已考虑并否决的替代

- **在 web-app bundle 里用条件行替代 desktop profile。** 否决:桌面壳是一个独立部署,其宿主插件只能在桥接环境下加载;独立 profile 命名了这一边界,并契合桌面部署宿主 profile 的要求。
- **每次完成都通知。** 否决:操作员正看着时会很吵;壳的焦点检查把提醒限定在「离开」场景。
- **把 harness 类别透传进壳。** 否决:壳保持通用,只认 `backgroundOnly` 布尔;类别到策略的映射由 provider 持有。

## 后果

- 壳新增 `backgroundOnly` toast 标志与 `windows::is_any_window_focused`;其桥接契约记录了该标志。
- 桌面壳的启动命令从 `web` 改为 `--profile desktop`;`desktop` profile 从随附模板自动初始化。
- `turnCompleted` 在桥中默认关闭;`desktop` 与 `headless` bundle 显式开启。

Related: [桌面能力接缝](../architecture/2026-08-14-desktop-capability-seams-notifications-updater.md), [壳桥接消费者](../architecture/2026-08-14-desktop-shell-bridge-consumers.md), [Windows 桌面补全](2026-08-16-desktop-windows-completion.md)。
