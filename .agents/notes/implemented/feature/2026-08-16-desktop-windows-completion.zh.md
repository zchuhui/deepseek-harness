# Agent Note:Windows 桌面端收尾:壳身份、导航回传、Authenticode 工具与设置行

Status: implemented

[English](2026-08-16-desktop-windows-completion.md) | 中文

## 问题

Windows 桌面端在壳骨架之后还差四块:toast 一直显示在 Windows PowerShell 的身份下(壳没有注册自己的 AUMID);壳的窗口注册表只跟踪壳发起的导航,操作员在 web GUI 侧栏打开的会话不被深链路由识别;发布链路没有 Authenticode 签名工具,也没有在 web GUI 里读写壳设置(closeToTray/launchAtLogin)的入口。

## 决策

- **壳每次启动注册自身 AUMID 快捷方式。** `aumid.rs` 用 COM(IShellLinkW + IPropertyStore)把开始菜单里的 `DeepSeek Harness.lnk` 重写为指向当前可执行文件、标记 `System.AppUserModel.ID` = tauri identifier 的快捷方式——快捷方式就是 Windows 的 AUMID 注册载体,dev、免安装与安装部署由此收敛到同一身份。toast 经壳身份显示;注册失败启动日志报错并回退旧的 PowerShell 身份。
- **客户端→壳导航回传。** 壳给每个窗口的 URL 都带 `?win=<label>`(主窗口恒为 `main`);web 客户端在工作区基线就绪后把「本窗口当前显示的会话」经新 RPC `host.reportWindow` 报给宿主,宿主经新接缝 `ctx.desktopHost`(`dsh-host-desktop` 服务定义 + `dsh-host-desktop-shell` 桥接提供者)转发到桥接的 `POST /api/desktop/windows/assign`,壳更新窗口注册表。指向侧栏会话的深链因此聚焦已有窗口而不是新开。浏览器标签没有 `win` 参数就从不报告;无桌面壳的宿主应答 `desktop-unavailable`,客户端把报告当尽力而为丢弃。
- **Authenticode 工具链进构建脚本。** `build-and-sign.mjs` 以 `--config` overlay 恢复 `createUpdaterArtifacts: true`(提交的 tauri.conf.json 保持关闭,普通 `tauri build` 不产更新工件);`AUTHENTICODE_CERT`/`AUTHENTICODE_PASSWORD` 就位时把 `bundle.windows.signCommand` 指向 `scripts/sign-windows.mjs`。tauri 先对安装器做 Authenticode、后计算 minisign 工件签名,所以 `.sig` 覆盖签名后的安装器;证书缺失时构建照常并打印说明。发布方证书仍由发布负责人持有。
- **web GUI 壳设置行。** 新 RPC 域 `desktop.getSettings`/`desktop.setSettings`(loopback 特权,与配置平面并列)驱动设置页 General 区两行:closeToTray(全平台)与 launchAtLogin(仅 Windows,webview 平台探测)。RPC 不可用(无桌面壳)时行整体隐藏;写入失败回滚重读,壳是这两项的权威存储。壳原生的 settings.html 窗口保留。

## 已考虑的替代方案

- **只在安装器里注册 AUMID 快捷方式。** 不采用:dev 与免安装部署从不跑安装器,toast 身份永远修不好;启动时注册让三种部署收敛到同一身份。
- **壳观察 webview 导航来跟踪会话。** 不采用:Tauri 对 SPA 内部导航没有可靠钩子;客户端主动报告以宿主 RPC 为通道,天然覆盖侧栏打开的所有会话。
- **构建后单独跑 signtool、再用 minisign 重签。** 不采用:重签需要构建机上有 minisign CLI 且顺序易错;tauri 的 `bundle.windows.signCommand` 在算 updater 工件前签安装器,顺序由构建器保证。
- **把壳设置注册成 settings 命名空间。** 不采用:settings 接缝每应用只有一个 provider,壳才是这两项权威存储,镜像会造出第二真相;独立的 `desktop.*` RPC 域直读直写壳。

## 后果

- 三个 RPC 方法(`host.reportWindow`、`desktop.getSettings`、`desktop.setSettings`)进入特权方法集合:`desktop.*` 读写壳的原生状态,`host.reportWindow` 驱动原生窗口路由,与 `host.pickDirectory` 同类。
- 桌面部署的宿主 profile 需组合 `@deepseek-ai/dsh-host-desktop-shell`(与既有 notifications-desktop/updater-desktop/credentials-desktop 并列;缺桥接环境时加载期大声失败)。壳自身也新增 `/api/desktop/windows/assign` 端点与 `?win=` URL 约定。
- Windows 侧剩余项基本只剩发布动作:发布方证书、生产 HTTPS 更新托管与密钥轮换;产品功能上的缺口剩 macOS/Linux 的 toast 点击穿透与登录自启。

相关:[桌面能力接缝](../architecture/2026-08-14-desktop-capability-seams-notifications-updater.md)、[壳桥接消费者](../architecture/2026-08-14-desktop-shell-bridge-consumers.md)、[协议深链、单实例与 toast 激活](2026-08-15-desktop-protocol-single-instance-toast-activation.md)。
