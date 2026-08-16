# `@deepseek-ai/dsh-workspace-notes-bundle`

[English](README.md) | 中文

这是 Web profile 的可选层。[`cordis.patch.yml`](cordis.patch.yml) 插入持久化的 [`dsh-workspace-notes`](../../workspace/workspace-notes/README.md) Host 服务、按工作区运行的 [`dsh-workspace-notes-agent`](../../workspace/workspace-notes-agent/README.md) 项目记忆与工具 Consumer，以及浏览器侧的 [`dsh-client-ui-workspace-notes`](../../client/ui-workspace-notes/README.md) 工作台界面。`dsh-base` 和 `dsh-web-app` 都不会引用它，因此新 profile 在安装前不会拥有笔记数据、路由、模型上下文或标签页。

在此源码 checkout 的根目录执行 `pnpm dsh plugin --profile web add .\packages\bundle\workspace-notes-bundle`，即可将它安装到 Web profile。插件命令会把相对路径锚定到调用目录，再把该组合包追加到 `dsh-web-app` 之后；它的依赖会为 profile loader 提供完整的 Host 与浏览器包闭包。包发布后，对应的发行版命令是 `dsh plugin --profile web add @deepseek-ai/dsh-workspace-notes-bundle`。profile 可以只安装此组合包而不安装共享待办组合包。patch 的显式策略是单条笔记最多 65,536 字节，最多十条 agent 可见笔记进入不超过 8,192 字节的项目记忆渲染。后续 profile patch 可以替换任一完整配置行。

## 模型体验

### 工作区笔记集成

#### 模型看到的内容

通过插入的 notes-agent 行，标记为 agent 可见的工作区笔记会成为该工作区所属会话中 agent 的已文档化项目记忆段落，并提供 `notes_read` 与 `notes_write` 工具。

#### Token 影响

有条件：项目记忆内容受组合包笔记数量和字节策略限制，工具 schema 只会出现在归属到工作区的 agent 中。

#### KV Cache 影响

该影响由 notes-agent 包负责：变化的快照可能在请求前替换其项目记忆段落；此 patch 载体本身不贡献请求文本。

## 已知限制与暂缓事项

- **依赖 Web profile**：此层依赖 `dsh-web-app` 插入的工作区注册表、存储、Host remote 与工作台 slots；它不是 headless profile 的组合包。
- **配置按整行替换**：profile 覆盖 `workspace-notes` 或 `workspace-notes-agent` 时必须重述所有必填字段。
