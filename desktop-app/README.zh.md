# dsh-desktop — DeepSeek Harness 桌面壳(Tauri 2)

[English](README.md) | 中文

DeepSeek Harness 桌面端产品的 Tauri 2 骨架:把本地 `dsh web` 运行时作为子进程拉起,在原生窗口里渲染现有 web GUI,带系统托盘和一个带 token 的桥接 HTTP 服务,让 dsh 宿主侧 provider 触达原生原语。这是桌面端里程碑 2 的壳;按设计位于根 pnpm workspace 之外(理由见方案文档)。

## 启动顺序

1. 在 `127.0.0.1:3901` 启动桥接 HTTP 服务,携带每次运行生成的 token。
2. 按 `scripts/desktop-launch/launch.ps1` 相同的发现规则找到可执行的 dsh(环境变量覆盖、checkout 源码启动、PATH 上的 `dsh`),复用端口上已在运行的服务,或拉起新进程并轮询就绪(收到任意 HTTP 响应即视为就绪)。
3. 创建主窗口加载 `http://127.0.0.1:<port>`;失败时展示内置错误页并把详情写入 stderr。
4. 构建托盘:显示窗口 / 打开最新通知 / 退出。关闭窗口即隐藏;壳退出时,由壳拉起的 dsh 子进程随之终止。

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

## 更新、签名与更新清单

壳搭载真实 Tauri updater:`/api/desktop/update` 经 `tauri-plugin-updater` 对配置的端点做实时检查,以缓存的线上状态应答;`/api/desktop/update/apply` 下载、校验 minisign 签名、安装并重启壳。本地闭环由壳自行托管两个更新文件:`GET /update-manifest.json` 与 `GET /update-artifact` 从工作目录提供生成物;生产部署把 `plugins.updater.endpoints` 指向 HTTPS 主机。

用 `node scripts/build-and-sign.mjs` 构建并签名:它以 `createUpdaterArtifacts` 运行 `tauri build --bundles nsis`,用本地 minisign 私钥(`updater.key`,已 gitignore——私钥永不离开构建机;公钥内嵌于 `tauri.conf.json`)给安装器签名,并组装 `update-manifest.json`(版本、notes、pub_date、各平台签名与下载 URL)。`UPDATE_VERSION_OVERRIDE` 写入抬高的清单版本用于本地演练更新流程,`UPDATE_MANIFEST_BASE_URL` 覆盖安装件 URL。

安装器本身的 Authenticode 代码签名不在本里程碑(需要发布方自有证书);updater 的工件签名即上述 minisign 链。

## 桥接契约(host -> 壳原语)

每个请求携带头 `x-dsh-bridge-token`(值为当次运行的 token),否则返回 401。所有请求体为 JSON。

| 端点 | 方法 | 契约 |
|---|---|---|
| `/api/desktop/toast` | POST | `{ title, body, sessionId? }` 展示一条原生通知；安全的 `sessionId` 成为待跳转深链 |
| `/api/desktop/pick-directory` | POST | 打开原生目录选择器;`{ path }` 或 `{ canceled: true }` |
| `/api/desktop/keychain/{name}` | GET/POST/DELETE | 读取(`{ value }` 或 404)、存储(`{ value }`,非空)、删除 —— 经 `keyring` crate 使用 Windows 凭据管理器 |
| `/api/desktop/update` | GET | 经 Tauri updater 实时检查;`{ channel: "tauri", currentVersion, checkedAt, available, lastFailure }` |
| `/api/desktop/update/apply` | POST | 下载、校验 minisign 签名、安装并重启壳;失败以 500 + 消息应答 |

Tauri IPC 命令 `get_state`、`toast`、`pick_directory` 为内嵌 web UI 镜像同一组原语。

## 已知限制与待办

- **无 Authenticode 签名** —— NSIS 安装器本身不带发布方证书;只有 updater 工件做了 minisign 签名。发布方签名需要发布负责人自己的证书。
- **仅开发自托管更新** —— updater 端点与安装件 URL 指向壳自身的回环桥接;生产部署必须把清单与安装器托管在 HTTPS 上并轮换签名密钥。
- **GNU 工具链未验证** —— 面向 MSVC host 开发;GNU 链接器可能需要额外配置。
- **单窗口、固定托盘菜单** —— 多窗口编排与桌面设置 UI 等待后续里程碑。
- **无 OS 级 toast 点击激活** —— 托盘项「打开最新通知」执行深链（`?session=<id>`）；点击 toast 本身还无法激活壳,需等安装器里程碑注册 Windows 激活所需的 AppUserModelID 快捷方式。
