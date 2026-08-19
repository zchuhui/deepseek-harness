# Agent Note: Deploy 保留源工作区的安装状态

Status: implemented

[English](2026-08-19-deploy-preserves-source-workspace-state.md) | 中文

## 问题

`pnpm deploy --legacy --prod` 会以从仓库根执行的过滤式生产安装方式运行。桌面运行时暂存（[stage-runtime.mjs](../../../../desktop-app/scripts/stage-runtime.mjs)）和 Python SDK 单可执行文件构建器（[build-exe-for-python-sdk.ts](../../../../scripts/build-exe-for-python-sdk.ts)）都采用这种方式调用，因此每次发布构建都会把源工作区状态文件（`node_modules/.pnpm-workspace-state-v1.json`）改写为 `filteredInstall: true`、`production: true` 和 `dev: false`。pnpm 的 `verify-deps-before-run` 校验（默认 `install`）随后会从这些记录的设置重建自动安装命令，于是下一次 `pnpm run`——包括 pre-push 的 `typecheck` 钩子——会执行 `pnpm install --production`。这会删除全部 devDependency，随后在根 `postinstall`（[install-lefthook.mjs](../../../../scripts/install-lefthook.mjs)）处崩溃，因为该脚本静态导入了已被删除的 `lefthook` 包；push 会一直失败，直到执行一次完整的 `pnpm install` 重置状态。该故障取决于时序：它会在任意一次发布构建之后出现，而不是出现在引入它的那次改动里。

## 决策

两个 deploy 脚本都会在调用 `pnpm deploy` 之前快照源工作区状态文件（存在时），并在其之后立即按字节恢复（无论成功还是失败），从而保证发布构建永远不会把开发检出目录留在生产过滤模式。此外，[install-lefthook.mjs](../../../../scripts/install-lefthook.mjs) 改为惰性解析 `lefthook` 包，并在包缺失时静默退出，因此即使误执行一次 `pnpm install --production`，也不会再在根 postinstall 处失败。

## 曾考虑的替代方案

**只加固根 postinstall。** 否决：不能作为完整修复，因为自动安装仍会删除 devDependency，随后的 typecheck 会因缺少 TypeScript 和 tsx 而失败，检出目录在手动完整安装之前仍处于损坏状态。

**仓库级禁用 `verify-deps-before-run`。** 否决：仓库没有 `.npmrc`，为每一次脚本运行关闭 pnpm 的不同步检测，比本缺陷所需的范围更大。

**在工作区之外运行 deploy。** 否决：`pnpm deploy` 必须解析工作区的 lockfile 和包，因此必须位于工作区工作目录内。

**每次 deploy 后运行一次完整的 `pnpm install`。** 否决：仅仅为了重置两个设置就重新物化整个工作区的 node_modules，代价过高。

## 后果

发布构建不再改动源工作区状态，因此下一次开发 `pnpm run` 和 pre-push 钩子无需手动重装即可正常工作。根 postinstall 在生产安装下变为空操作，与其作为仅开发用途的钩子安装器的角色一致。每个 deploy 脚本在 pnpm 调用前后各带一小段快照/恢复逻辑。
