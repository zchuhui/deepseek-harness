# Agent Note: Windows 桌面端正式发布

Status: proposed

中文 | [English](2026-08-15-windows-desktop-production-release.md)

## Problem

Tauri 壳已经能够构建 NSIS 安装包，但安装后的可执行文件仍依赖 checkout 或 PATH 中的 `dsh`，会将无关的 loopback HTTP 服务视为已就绪，暴露过宽的 WebView bridge，并且没有由发布流程拥有的签名更新路径。

## Proposal

- Windows x64 安装包嵌入固定版本的 Node 22.19.0 可执行文件和已部署的生产 `@deepseek-ai/dsh` 依赖闭包。发布构建提供可执行文件及其 SHA-256；staging 拒绝缺失或校验不一致的文件。发布构建只启动此资源 runtime，调试构建保留现有 checkout/PATH 发现方式。
- 每次壳启动为 dsh 服务和 bridge 分配 loopback 端口，并且只向子进程传递相互独立的 256 位 token。Web bundle 注册 `/internal/desktop/ready`；只有 native shell 提供 token 时才返回 204。壳拒绝已被占用的端口，且不复用任意本地 HTTP 服务。
- 主 WebView 不可使用 Tauri IPC。壳关闭 `withGlobalTauri`，将 app-local settings IPC 保留在 settings window，并提供固定的 app CSP。dsh bridge 继续校验 token，且不再提供更新文件。
- NSIS 按当前用户安装、拒绝降级、嵌入 WebView2 bootstrapper，并使用被动更新。GitHub Releases 托管 HTTPS 更新 manifest 和 installer。标签工作流 staging runtime、构建 installer、通过 Azure Trusted Signing 进行 Authenticode 签名、为最终可执行文件重新生成 Tauri updater 签名，并发布校验和、SBOM、manifest、installer 和签名。

## Alternatives considered

- **继续从 PATH 解析 dsh。** 拒绝，因为已安装的桌面应用会依赖未声明的机器级 Node 和 CLI 安装。
- **复用固定本地端口上的任意服务。** 拒绝，因为无关进程可以占用端口并向 native window 提供浏览器内容。
- **在 GitHub Actions secrets 中保存 PFX。** 拒绝，因为 Azure Trusted Signing 将 Authenticode 私钥留在 CI 外并使用 OIDC 认证。

## Acceptance criteria

- 在干净的 Windows 10 22H2 或 Windows 11 x64 VM 上，即使 PATH 中没有 Node 和 dsh，也可安装和启动应用。
- 没有单次运行 token 的就绪响应、已占用的 Web 端口和不完整的 bundled runtime 都会在主 WebView 打开前失败。
- 发布工作流验证 Authenticode 签名，在其后生成 Tauri updater 签名，并向对应的 `desktop-v<version>` GitHub Release 发布 manifest、installer、校验和和 SBOM。
- 每个受影响的 pull request 都运行必需的 Windows desktop workflow：Rust 测试、runtime staging 和 NSIS installer 构建。

## Risks

- Azure account、certificate profile、timestamp URL、GitHub Environment、updater 私钥、固定 Node archive checksum 都是 release owner 配置。缺失配置会阻断发布，不会生成未签名或无法验证的版本。
- 首个版本只支持 Windows x64。ARM64、企业离线部署和 beta channel 需要独立的 runtime artifact 和 update feed。
