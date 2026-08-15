# Agent Note:桌面协议深链、单实例与 toast 激活

Status: implemented

[English](2026-08-15-desktop-protocol-single-instance-toast-activation.md) | 中文

## 问题

桌面壳此前只能通过托盘项深链(「打开最新通知」以 eval 导航主窗口)。没有自定义 URL 协议,第二次启动会拉起第二个壳,toast 点击无法激活壳——README 曾把激活推迟到安装器里程碑的 AppUserModelID 快捷方式。

## 决策

- **壳持有 `dsh://` 协议。** 使用 `tauri-plugin-deep-link`,`tauri.conf.json` 中配置 `plugins.deep-link.desktop.schemes = ["dsh"]`;`register_all()` 每次启动执行(Windows 为 HKCU,Linux 为 `x-scheme-handler`),dev 与免安装部署无需安装器步骤。
- **始终只有一个壳在运行。** `tauri-plugin-single-instance`(最先注册,启用 `deep-link` feature)持有实例身份;Windows/Linux 上协议启动会拉起第二个进程,其 argv 携带 URL,插件把 argv 转发进运行中的壳。回调把 `dsh://` 路由为显示主窗口,把 `dsh://session/<id>` 路由为导航。
- **单一规范语法**,位于 `desktop-app/src-tauri/src/deeplink.rs`:`parse_deep_link` 只接受 `dsh://`(Home)与 `dsh://session/<id>`(id 须匹配 `[A-Za-z0-9_-]{1,256}`),其余一律丢弃。`handle_url` 把会话目标存为待跳转通知深链并调用 `navigate_main`(显示/还原/聚焦 + `window.location.href` eval),托盘项改为复用该函数而不是重复实现。
- **协议冷启动主实例。** 注册之后在 `setup` 里读取 `deep_link().get_current()`(Windows/Linux 把链接作为唯一 argv 项传入)。macOS 以 `deep-link://new-url` 事件投递,注册了监听器;macOS 的冷启动投递与协议注册随安装器里程碑。
- **无 AUMID 快捷方式的 Windows toast 激活。** `toast.rs` 把桥接 toast 渲染为 PowerShell 5.1 WinRT toast,携带 `activationType="protocol"` 与 `launch="dsh://session/<id>"`,点击即启动协议处理器并路由回运行中的壳。标题、正文与 appId 以转义字面量嵌入——`escape_xml` 后再做 PowerShell 单引号翻倍,UTF-16LE base64 `-EncodedCommand`——与 `packages/notify/notifications-windows` 同一模式。壳现在每次启动都把开始菜单的 `DeepSeek Harness.lnk` 重写为自身 AUMID 的快捷方式(`aumid.rs`),toast 显示在壳自己的身份下;注册失败时回退 PowerShell 身份。

## 已考虑的替代方案

- **经壳自身 AUMID 的前台激活。** 暂不采用:它需要本里程碑推迟的安装器注册的开始菜单快捷方式;协议激活今天就能在 dev 与免安装部署中工作。
- **经 `tauri-plugin-notification` 的 toast 动作。** 不采用:该插件的桌面 builder 没有激活回调或动作 API(只有 Android 的 `action_type_id`)。
- **手写注册表写入(`reg.exe`)。** 不采用:deep-link 插件已拥有注册职责,并保持各平台界面一致。
- **在 Windows/Linux 上监听 `deep-link://new-url` 而非 single-instance 回调。** 不采用:回调在那些平台拥有 argv 转发职责;事件监听器只为 macOS 编译,链接绝不会导航两次。

## 后果

- 深链在 dev 与免安装部署中端到端可用:从浏览器、shell 命令或 toast 点击发起的 `dsh://session/<id>` 都能在主窗口打开对应会话。
- 单一导航路径(`navigate_main`)服务托盘点击、协议启动与事件投递。
- Windows toast 点击穿透可用;toast 身份是壳自身的 AUMID(每次启动注册的开始菜单快捷方式),注册失败才回退 PowerShell 身份。
- macOS/Linux 的 toast 点击穿透仍然缺失(notification 插件限制);Linux 协议注册已接线但未在本机验证。

相关:[桌面能力接缝](../architecture/2026-08-14-desktop-capability-seams-notifications-updater.md)、[壳桥接消费者](../architecture/2026-08-14-desktop-shell-bridge-consumers.md)。
