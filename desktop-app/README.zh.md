# dsh-desktop — DeepSeek Harness 桌面壳(Tauri 2)

[English](README.md) | 中文

DeepSeek Harness 桌面端产品的 Tauri 2 骨架:把本地 `dsh web` 运行时作为子进程拉起,在原生窗口里渲染现有 web GUI,带系统托盘和一个带 token 的桥接 HTTP 服务,让 dsh 宿主侧 provider 触达原生原语。这是桌面端里程碑 2 的壳;按设计位于根 pnpm workspace 之外(理由见方案文档)。

## 启动顺序

1. 在 `127.0.0.1:3901` 启动桥接 HTTP 服务,携带每次运行生成的 token。
2. 按 `scripts/desktop-launch/launch.ps1` 相同的发现规则找到可执行的 dsh(环境变量覆盖、checkout 源码启动、PATH 上的 `dsh`),复用端口上已在运行的服务,或拉起新进程并轮询就绪(收到任意 HTTP 响应即视为就绪)。
3. 创建主窗口加载 `http://127.0.0.1:<port>`;失败时展示内置错误页并把详情写入 stderr。
4. 构建托盘:显示窗口 / 退出。关闭窗口即隐藏;壳退出时,由壳拉起的 dsh 子进程随之终止。

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

## 桥接契约(host -> 壳原语)

每个请求携带头 `x-dsh-bridge-token`(值为当次运行的 token),否则返回 401。所有请求体为 JSON。

| 端点 | 方法 | 契约 |
|---|---|---|
| `/api/desktop/toast` | POST | `{ title, body }` 展示一条原生通知 |
| `/api/desktop/pick-directory` | POST | 打开原生目录选择器;`{ path }` 或 `{ canceled: true }` |
| `/api/desktop/keychain/{name}` | GET/POST/DELETE | 读取(`{ value }` 或 404)、存储(`{ value }`,非空)、删除 —— 经 `keyring` crate 使用 Windows 凭据管理器 |
| `/api/desktop/update` | GET | 桩状态 `{ channel: "manual", currentVersion: null, ... }` |
| `/api/desktop/update/apply` | POST | 501 —— 真实 Tauri Updater provider 属于发布里程碑 |

Tauri IPC 命令 `get_state`、`toast`、`pick_directory` 为内嵌 web UI 镜像同一组原语。

## 已知限制与待办

- **无打包与签名** —— `bundle.active` 为 false;安装包、代码签名与差分包更新属于发布里程碑。
- **updater 是桩** —— state/apply 端点已就位,供宿主侧 `ctx.updater` provider 对接;不执行任何下载或安装。
- **GNU 工具链未验证** —— 面向 MSVC host 开发;GNU 链接器可能需要额外配置。
- **单窗口、固定托盘菜单** —— 多窗口编排与桌面设置 UI 等待后续里程碑。
