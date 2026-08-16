# `@deepseek-ai/dsh-workspace-todos-bundle`

[English](README.md) | 中文

这是 Web profile 的可选层。[`cordis.patch.yml`](cordis.patch.yml) 插入持久化的 [`dsh-workspace-todos`](../../workspace/workspace-todos/README.md) Host 服务、按工作区运行的 [`dsh-workspace-todos-agent`](../../workspace/workspace-todos-agent/README.md) 工具 Consumer，以及浏览器侧的 [`dsh-client-ui-workspace-todos`](../../client/ui-workspace-todos/README.md) 工作台界面。`dsh-base` 和 `dsh-web-app` 都不会引用它，因此新 profile 在安装前不会拥有共享待办数据、路由、工具或标签页。

在此源码 checkout 的根目录执行 `pnpm dsh plugin --profile web add .\packages\bundle\workspace-todos-bundle`，即可将它安装到 Web profile。插件命令会把相对路径锚定到调用目录，再把该组合包追加到 `dsh-web-app` 之后；它的依赖会为 profile loader 提供完整的 Host 与浏览器包闭包。包发布后，对应的发行版命令是 `dsh plugin --profile web add @deepseek-ai/dsh-workspace-todos-bundle`。profile 可以只安装此组合包而不安装笔记组合包。patch 的显式策略是单条待办最多 4,096 字节且必须为单行，以及 Agent 的每次状态变更都需要人工批准。后续 profile patch 可以替换任一完整配置行。

## 模型体验

### 工作区待办工具

#### 模型看到的内容

通过插入的 todos-agent 行，所属会话位于工作区的 agent 会获得该工作区共享待办的 `todos_read` 和 `todos_update` 工具。

#### Token 影响

有条件的工具 schema token：工具只会出现在归属到工作区的 agent 中。

#### KV Cache 影响

无直接影响。插入的工具会出现在 Agent 工具 schema 中；此 patch 载体不添加提示词文本或会话历史。

## 已知限制与暂缓事项

- **依赖 Web profile**：此层依赖 `dsh-web-app` 插入的工作区注册表、存储、Host remote 与工作台 slots；它不是 headless profile 的组合包。
- **配置按整行替换**：profile 覆盖 `workspace-todos` 或 `workspace-todos-agent` 时必须重述所有必填字段。
