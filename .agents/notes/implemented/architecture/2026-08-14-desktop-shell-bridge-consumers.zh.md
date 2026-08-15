# Agent Note: 桌面壳桥接与其宿主侧消费者

Status: implemented

[English](2026-08-14-desktop-shell-bridge-consumers.md) | 中文

## 问题

桌面壳(Tauri)与 dsh 宿主(Node)是两个进程。宿主侧接缝 provider 需要壳的原生原语(toast、目录选择器、keychain、updater),但 Tauri IPC 只到达内嵌 web UI,到不了宿主。里程碑 1 的接缝(`ctx.notifications`、`ctx.updater`、`ctx.credentials`)没有桌面 provider,宿主也没有任何触达壳的通道。

## 决策

- **带 token 鉴权的回环 HTTP 桥接**是宿主到壳的通道。壳在 `127.0.0.1:3901` 服务,携带当次运行的 token(启动时间与 pid 的哈希),每个请求必须带头 `x-dsh-bridge-token`,并向拉起的 dsh 子进程导出 `DSH_DESKTOP_BRIDGE_URL`/`DSH_DESKTOP_BRIDGE_TOKEN`。端点:`/api/desktop/toast`、`/pick-directory`、`/keychain/{name}`(GET/POST/DELETE)、`/update`、`/update/apply`(发布里程碑前应答 501)。契约归 `desktop-app/README.md` 拥有。
- **一个类型化客户端包**(`packages/util/desktop-bridge`):零依赖、基于 fetch;非 2xx 应答以 `DesktopBridgeError`(携带壳提供的消息)reject,传输失败以 fetch 错误 reject,keychain 读取 404 解析为 `undefined`。调用方 signal 经 `AbortSignal.any` 与单请求超时合并。
- **三个消费者 provider** 使用该客户端:`notifications-desktop`(toast)、`updater-desktop`(`state()` 为整体替换式缓存,`check()` 拉取,`apply()` 转发)、`credentials-desktop`(keychain 叠于进程环境之下,遵循接缝的遮蔽大声失败规则;写提交后发射 `credentials/updated`)。
- **加载期大声失败**:每个 provider 从配置(优先)或壳导出的环境解析 `bridgeUrl`/`bridgeToken`,任一缺失即在构造时抛错——在壳外组合的行不可能静默退化。

## 备选方案

- **Tauri IPC 打到宿主。** 否决:IPC 表面终止于 webview;宿主需要自己的客户端,web UI 会变成必经跳板。
- **裸 TCP/stdio 通道。** 否决:HTTP 给壳一个统一、类型化、带 token 的表面,并复用仓库里已被广泛演练的 Node fetch 边界。
- **单个 provider 包内嵌客户端。** 否决:三个 provider 共享同一线上客户端;重复检测与未来桥接端点都指向一个独立拥有的客户端包。
- **桌面 provider 带文件回退层。** 延期:桌面 provider 只在 keychain 之上叠加环境层;`.env` 回退仍归 `dsh-credentials-local`,直到有桌面消费者需要。

## 后果

- Tauri 壳保持原语 provider 的角色:接缝语义(类别、渠道、遮蔽)留在宿主侧,换壳重写也不受影响。
- 壳只向自己拉起的子进程导出桥接事实;复用已在运行的服务(无桥接环境)时,桌面 provider 在加载期大声失败——已记录,不静默。
- 更新端点是真实的:壳运行 tauri-plugin-updater 检查配置的端点,/api/desktop/update 以缓存的线上状态应答,/api/desktop/update/apply 执行下载-校验-安装-重启,并在桥接上为本地闭环自托管 update-manifest.json 与已签名安装件。签名是 minisign 链(私钥留在构建机,公钥内嵌于 tauri.conf.json);Authenticode 发布方签名仍归发布负责人。
- 通知深链走同一桥接:toast 载荷携带可选 `sessionId`,壳把最新一条存为待跳转深链,托盘项「打开最新通知」唤起、聚焦主窗口并导航到 `http://127.0.0.1:<port>/?session=<id>`——web 客户端在启动时解析的 URL 协议。OS 级 toast 点击激活在 Windows 上经 `dsh` 协议可用,toast 身份是壳自身的 AUMID(每次启动注册的开始菜单快捷方式);macOS/Linux 仍缺激活回调。
