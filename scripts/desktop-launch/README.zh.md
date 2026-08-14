# desktop-launch 桌面端启动器

[English](README.md) | 中文

Windows 双击启动器:双击后自动启动本地 dsh web 服务并打开默认浏览器。这是「桌面端里程碑 1」的脚本化过渡形态——先打通「本地服务 + 浏览器」这条链路,后续由 Tauri 桌面壳接管。

## 用途

- 双击 `launch.cmd` 即可启动 dsh web(默认 `http://127.0.0.1:3080`)并打开浏览器。
- 也支持在命令行传入参数,便于指定端口、只起服务不开浏览器,或后台运行。

## 用法

```bat
:: 双击等价于无参数运行
launch.cmd

:: 指定端口
launch.cmd -Port 8080

:: 只起服务,不打开浏览器
launch.cmd -NoBrowser

:: 后台起服务(隐藏窗口)后立即返回
launch.cmd -Detached
```

## 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `-Port <n>` | `3080` | 本地服务监听端口。若该端口已被其它进程占用且无 dsh 响应,脚本报错退出。 |
| `-Url <url>` | `http://127.0.0.1:$Port` | 就绪后要打开的浏览器地址。 |
| `-NoBrowser` | 关 | 只启动服务,不打开浏览器。 |
| `-Detached` | 关 | 用隐藏窗口后台启动服务后立即返回;不加时前台运行,控制台随服务保持打开。 |

## 启动方式与依赖

脚本按以下优先级寻找可执行的 dsh:

1. 当前目录或脚本所在目录能向上找到仓库 checkout(`package.json` 的 `name` 为 `@deepseek-ai/dsh-root`)时,用源码启动:`node --import tsx/esm apps/cli/src/bin.ts web --port <端口>`。
2. 否则使用 PATH 中的 `dsh.cmd`:`dsh web --port <端口>`。
3. 都找不到时退出码为 2,并提示 `pnpm build` 或 `npm i -g @deepseek-ai/dsh`。

依赖:

- Node.js `^22.19.0` 或 `>=24.0.0`(仓库 `package.json` 的 `engines` 范围)。
- 源码启动方式需先在仓库根目录运行 `pnpm install` 与 `pnpm build`(生成构建产物与前端资源)。
- 全局安装方式需 `npm i -g @deepseek-ai/dsh`(安装内置的构建产物)。

## 局限

- 不是安装包:只是一组脚本,没有安装、卸载、升级能力。
- 无系统托盘、无开机自启。
- 前台运行时保留一个控制台窗口,关闭该窗口即停止服务;`-Detached` 后台运行无窗口,停止需在任务管理器结束对应进程。
- 想把控制台窗口收进托盘,可用第三方工具 RBTray(https://github.com/lallousx86/rbtray):它能把任意窗口最小化到系统托盘。

## 与桌面端实施方案的关系

本启动器对应 `.local-plugins/桌面端产品实施方案总览.md` 的里程碑 1(阶段 1 的 Runtime Manager 与启动链),以脚本先行交付「启动本地 dsh web + 打开浏览器」这条链路,供 Tauri 桌面壳替换。
