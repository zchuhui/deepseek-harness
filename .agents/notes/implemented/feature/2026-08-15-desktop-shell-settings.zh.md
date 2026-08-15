# Agent Note:桌面壳设置

Status: implemented

[English](2026-08-15-desktop-shell-settings.md) | 中文

## 问题

桌面专属行为是硬编码的:关闭主窗口总是隐藏,没有开机自启,里程碑方案里的「桌面设置 UI」完全没有界面——托盘菜单是静态的,桥接也没有设置平面。

## 决策

- **一份设置文档**(`desktop-app/src-tauri/src/settings.rs`):`closeToTray`(默认 true)与 `launchAtLogin`(默认 false),存放在应用配置目录下的 `settings.json`。加载大声失败——文件不存在即默认值,文件损坏则启动失败并显示错误窗口。写入是原子的(临时文件 + 重命名)。
- **应用顺序为 OS 副作用 → 持久化 → 内存**(`settings::apply`):注册表写入失败不会改变任何状态,内存文档只在提交点更新。`launchAtLogin` 经 `reg.exe` 映射到 Windows `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下名为 `dsh-desktop` 的值(带引号的 exe 路径);仅 Windows 支持,其他平台报错。
- **桥接新增 settings 平面**:`GET /api/desktop/settings` 与 `POST /api/desktop/settings`(部分文档 `{ closeToTray?, launchAtLogin? }`,布尔值校验,应答完整更新后文档)。类型化客户端(`packages/util/desktop-bridge`)镜像两个调用。
- **壳原生设置窗口**:托盘新增「设置」,打开内置的 `settings.html` 窗口(标签 "settings",独立 capability,仅 `core:default`),驱动新的 `get_settings`/`set_settings` IPC 命令;开启 `withGlobalTauri`,页面使用 `window.__TAURI__.core.invoke`。
- **关闭处理器读取设置**:关闭到托盘开启时隐藏主窗口;关闭时置退出标志并退出。

## 已考虑的替代方案

- **web GUI 内的设置页**(宿主 seam + 客户端插件)。推迟:需要新的宿主 API 平面与客户端 slot 工作及其 GUI 测试门禁;壳原生窗口今天就交付设置界面,桥接平面留给后续宿主侧集成。
- **损坏设置文件即退出整个应用。** 不采用:复用运行时失败启动已有的错误窗口路径——同样的可见性,但壳仍展示原因。
- **逐字段的 keyring 或注册表存储。** 不采用:一份带原子写入的 JSON 文档是同时容纳两个字段并保持可 diff 的最小机制。

## 后果

- 托盘菜单现在是 显示窗口 / 新建窗口 / 打开最新通知 / 设置 / 退出;设置窗口实时编辑关闭到托盘与开机自启并原子持久化。
- `launchAtLogin` 仅 Windows;macOS/Linux 的登录自启留在各自平台的里程碑(README 已知限制已更新)。
- 桥接 settings 平面可供宿主消费,未来的 web GUI 设置页无需改壳即可复用类型化客户端。

相关:[桌面多窗口编排](2026-08-15-desktop-multi-window-orchestration.md)。
