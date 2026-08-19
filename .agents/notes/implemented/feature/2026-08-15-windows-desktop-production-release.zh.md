# Agent Note: Windows desktop production release

Status: implemented

[English](2026-08-15-windows-desktop-production-release.md) | 中文

## Problem

Tauri 壳已经能够构建 NSIS 安装包，但已安装的应用不得依赖 checkout 或 PATH 中的 `dsh`，不得将无关的 loopback HTTP 服务视为已就绪，不得暴露过宽的 WebView bridge，并且必须拥有一条签名更新路径。

## Decision

Windows x64 安装包嵌入固定版本的 Node 22.19.0 可执行文件和已部署的生产 `@deepseek-ai/dsh` 依赖闭包。发布构建提供可执行文件及其 SHA-256；staging 拒绝缺失或校验不一致的文件。发布构建只启动此资源 runtime，调试构建保留 checkout/PATH 发现方式。

每次壳启动为 dsh 服务和 bridge 分配 loopback 端口，并且只向子进程传递相互独立的 256 位 token。Web bundle 注册 `/internal/desktop/ready`；只有 native shell 提供 token 时才返回 204。壳拒绝已被占用的端口，且不复用任意本地 HTTP 服务。

主 WebView 不可使用 Tauri IPC。壳关闭 `withGlobalTauri`，将 app-local settings IPC 保留在 settings window，并提供固定的 app CSP。dsh bridge 继续校验 token，且不提供更新文件。

NSIS 按当前用户安装、拒绝降级、嵌入 WebView2 bootstrapper，并使用被动更新。GitHub Releases 托管 HTTPS 更新 manifest 和 installer。标签工作流 staging runtime、构建 installer、通过 Azure Trusted Signing 进行 Authenticode 签名、为最终可执行文件重新生成 Tauri updater 签名，并发布校验和、SBOM、manifest、installer 和签名。首发仅 Windows x64。

Azure account、certificate profile、timestamp URL、GitHub Environment、updater 私钥、固定 Node archive checksum 都是 release owner 配置。缺失配置会阻断发布，不会生成未签名版本。

## Alternatives considered

- **继续从 PATH 解析 dsh。** 拒绝，因为已安装的桌面应用会依赖未声明的机器级 Node 和 CLI 安装。
- **复用固定本地端口上的任意服务。** 拒绝，因为无关进程可以占用端口并向 native window 提供浏览器内容。
- **在 GitHub Actions secrets 中保存 PFX。** 拒绝，因为 Azure Trusted Signing 将 Authenticode 私钥留在 CI 外并使用 OIDC 认证。

## Consequences

在干净的 Windows 10 22H2 或 Windows 11 x64 VM 上，即使 PATH 中没有 Node 和 dsh，也可安装和启动应用。没有单次运行 token 的就绪响应、已占用的 Web 端口和不完整的 bundled runtime 都会在主 WebView 打开前失败。ARM64、企业离线部署和 beta channel 仍是独立产物。

## Related

壳功能（AUMID、`dsh://`、toast 点击、开机自启）见 [desktop Windows 补齐](2026-08-16-desktop-windows-completion.md)。持久 PTY、Job Object 与原生核心检查见 [Windows ConPTY 检查](2026-08-19-windows-pty-conpty.md)、[Job Object 进程树](2026-08-19-windows-job-object-process-trees.md) 和 [原生 Windows 核心必过检查](../process/2026-08-19-native-windows-core-required-check.md)。
