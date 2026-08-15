# dsh-desktop — DeepSeek Harness 桌面壳(Tauri 2)

[English](README.md) | 中文

DeepSeek Harness 桌面端产品的 Tauri 2 骨架:把本地 `dsh web` 运行时作为子进程拉起,在原生窗口里渲染现有 web GUI,带系统托盘和一个带 token 的桥接 HTTP 服务,让 dsh 宿主侧 provider 触达原生原语。壳持有 `dsh://` 协议——始终只运行一个实例,协议启动与 toast 点击都会路由回运行中的壳。这是桌面端里程碑 2 的壳;按设计位于根 pnpm workspace 之外(理由见方案文档)。

## 启动顺序

1. 在 `127.0.0.1:3901` 启动桥接 HTTP 服务,携带每次运行生成的 token。
2. 按 `scripts/desktop-launch/launch.ps1` 相同的发现规则找到可执行的 dsh(环境变量覆盖、checkout 源码启动、PATH 上的 `dsh`),复用端口上已在运行的服务,或拉起新进程并轮询就绪(收到任意 HTTP 响应即视为就绪)。
3. 创建主窗口加载 `http://127.0.0.1:<port>`;失败时展示内置错误页并把详情写入 stderr。
4. 构建托盘:显示窗口 / 新建窗口 / 打开最新通知 / 设置 / 退出。关闭主窗口即隐藏(关闭到托盘关闭时则退出);其他窗口真实关闭;壳退出时,由壳拉起的 dsh 子进程随之终止。
5. 注册 `dsh` 协议(Windows/Linux),并路由本次启动携带的深链以及之后到达的深链;启动深链直接决定主窗口的 URL。

## 前置条件

- Rust(stable,Windows 上为 MSVC host)与 Cargo。
- Microsoft Edge WebView2 运行时(Windows 11 已预装)。
- Node.js `^22.19.0` 或 `>=24.0.0`,源码启动路径还需仓库根目录 `pnpm install && pnpm build`。

## 构建与运行

```sh
cd desktop-app
pnpm install
pnpm tauri dev
cargo build
cargo test
```

## 配置(环境变量)

| 变量 | 默认值 | 含义 |
|---|---|---|
| `DSH_DESKTOP_PORT` | `3080` | 本地 dsh web 端口 |
| `DSH_DESKTOP_COMMAND` | 无 | 完整启动命令覆盖(按空白切分) |
| `DSH_DESKTOP_BRIDGE_PORT` | `3901` | 桥接 HTTP 端口 |

壳向拉起的 dsh 子进程导出 `DSH_DESKTOP_BRIDGE_URL` 与 `DSH_DESKTOP_BRIDGE_TOKEN`,宿主侧 provider 据此调用桥接。

## 深链

壳在每次启动时向操作系统注册 `dsh://` 协议(Windows 为 HKCU,Linux 为 `x-scheme-handler`)。规范形式:

- `dsh://` —— 显示主窗口。
- `dsh://session/<id>` —— 把主窗口导航到 `http://127.0.0.1:<port>/?session=<id>`(id 须匹配 `[A-Za-z0-9_-]{1,256}`)。

Windows 与 Linux 上,协议启动会拉起第二个进程;`tauri-plugin-single-instance` 把它的 argv 转发进运行中的壳。冷启动的第一条深链决定主窗口的 URL;之后的深链经窗口注册表路由——会话深链聚焦持有该会话的窗口,没有则新建一个窗口。macOS 上深链以 `deep-link://new-url` 事件到达(冷启动投递与协议注册随安装器里程碑)。toast 点击复用同一机制:Windows 上带会话的 toast 携带 `launch="dsh://session/<id>"` 与 `activationType="protocol"`,点击即经协议处理器路由回壳。

## 更新、签名与更新清单

壳搭载真实 Tauri updater:`/api/desktop/update` 经 `tauri-plugin-updater` 对配置的端点做实时检查,以缓存的线上状态应答;`/api/desktop/update/apply` 下载、校验 minisign 签名、安装并重启壳。本地闭环由壳自行托管两个更新文件:`GET /update-manifest.json` 与 `GET /update-artifact` 从工作目录提供生成物;生产部署把 `plugins.updater.endpoints` 指向 HTTPS 主机。

用 `node scripts/build-and-sign.mjs` 构建并签名:它以 `createUpdaterArtifacts` 运行 `tauri build --bundles nsis`,用本地 minisign 私钥(`updater.key`,已 gitignore——私钥永不离开构建机;公钥内嵌于 `tauri.conf.json`)给安装器签名,并组装 `update-manifest.json`(版本、notes、pub_date、各平台签名与下载 URL)。`UPDATE_VERSION_OVERRIDE` 写入抬高的清单版本用于本地演练更新流程,`UPDATE_MANIFEST_BASE_URL` 覆盖安装件 URL。

安装器本身的 Authenticode 签名由同一脚本驱动:`AUTHENTICODE_CERT`(.pfx 路径)与 `AUTHENTICODE_PASSWORD` 就位时,构建把 `bundle.windows.signCommand` 指向 `scripts/sign-windows.mjs`(signtool 调用;可用 `AUTHENTICODE_SIGNTOOL` 指到 SDK bin 下的完整路径,`AUTHENTICODE_TIMESTAMP_URL` 换时间戳服务器)。tauri 先对安装器做 Authenticode、后计算 minisign 工件签名,所以 `.sig` 覆盖的是签名后的安装器。证书缺失时构建照常产出未签名安装器并打印说明;发布方证书仍由发布负责人持有。

## 桥接契约(host -> 壳原语)

每个请求携带头 `x-dsh-bridge-token`(值为当次运行的 token),否则返回 401。所有请求体为 JSON。

| 端点 | 方法 | 契约 |
|---|---|---|
| `/api/desktop/toast` | POST | `{ title, body, sessionId? }` 展示一条原生通知；安全的 `sessionId` 成为待跳转深链,并在 Windows 上成为 toast 的协议激活目标(`dsh://session/<id>`) |
| `/api/desktop/pick-directory` | POST | 打开原生目录选择器;`{ path }` 或 `{ canceled: true }` |
| `/api/desktop/keychain/{name}` | GET/POST/DELETE | 读取(`{ value }` 或 404)、存储(`{ value }`,非空)、删除 —— 经 `keyring` crate 使用 Windows 凭据管理器 |
| `/api/desktop/windows/open` | POST | `{ sessionId? }` 新建一个窗口(id 须安全)并登记;`{ label, sessionId }` |
| `/api/desktop/windows/close` | POST | `{ label }` 关闭窗口——主窗口改为隐藏;`{ closed: true }` 或 404 |
| `/api/desktop/windows/focus` | POST | `{ label }` 显示、还原并聚焦;`{ focused: true }` 或 404 |
| `/api/desktop/windows/assign` | POST | `{ label, sessionId }` 记录某窗口当前显示的会话(客户端报告的一半,另一半是壳自身路由的启动目标);`{ assigned: true }`、404(未知 label)或 400(不安全 id) |
| `/api/desktop/windows` | GET | `{ windows: [{ label, sessionId }] }` —— 注册表快照;无目标时 `sessionId` 为 null |
| `/api/desktop/settings` | GET | `{ closeToTray, launchAtLogin }` —— 壳设置文档 |
| `/api/desktop/settings` | POST | 部分文档 `{ closeToTray?, launchAtLogin? }`;OS 副作用先于持久化执行;应答完整的更新后文档 |
| `/api/desktop/update` | GET | 经 Tauri updater 实时检查;`{ channel: "tauri", currentVersion, checkedAt, available, lastFailure }` |
| `/api/desktop/update/apply` | POST | 下载、校验 minisign 签名、安装并重启壳;失败以 500 + 消息应答 |

Tauri IPC 命令 `get_state`、`toast`、`pick_directory`、`get_settings`、`set_settings` 为内嵌 web UI 镜像同一组原语;托盘「设置」项打开内置的 `settings.html` 窗口,由它驱动设置命令。

## 壳设置

壳把 `closeToTray`(默认 true——关闭主窗口即隐藏)与 `launchAtLogin`(默认 false——Windows `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下名为 `dsh-desktop` 的值)持久化在应用配置目录的 `settings.json`。写入是原子的(临时文件 + 重命名),OS 变更先于文件与内存落地,因此注册表写入失败不会改变任何状态。文件不存在即默认值;文件损坏则启动失败并显示错误窗口,而不是猜测。

## 已知限制与待办

- **Authenticode 证书未配置** —— 签名工具链已就位(见上文 `AUTHENTICODE_*`),但发布方证书需发布负责人持有;没有证书时构建产出未签名安装器。
- **仅开发自托管更新** —— updater 端点与安装件 URL 指向壳自身的回环桥接;生产部署必须把清单与安装器托管在 HTTPS 上并轮换签名密钥。
- **GNU 工具链未验证** —— 面向 MSVC host 开发;GNU 链接器可能需要额外配置。
- **AUMID 快捷方式注册失败时 toast 回退 PowerShell 身份** —— 壳每次启动都把开始菜单里的 `DeepSeek Harness.lnk` 重写为自己 AUMID 的快捷方式,失败时启动日志报错并回退旧的 PowerShell toast 身份。
- **launchAtLogin 仅 Windows** —— web GUI 设置页与壳原生设置窗口都能读写 `closeToTray`/`launchAtLogin`,但开机自启的 Run 键只存在于 Windows;macOS/Linux 的登录自启等待各自平台的里程碑。
- **macOS/Linux 的 toast 点击穿透** —— 目前只有 Windows toast 携带协议激活;notification 插件在其余平台没有激活回调。
