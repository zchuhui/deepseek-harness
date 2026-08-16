# @deepseek-ai/dsh-client-ui-workspace-notes

[English](README.md) | 中文

工作区笔记界面的浏览器侧：根作用域 `conversation.workbench.tab` 条带的 `notes` 条目（order 10），以及 `conversation.chat.assistant-actions` 条带的 `note` 条目（order 20）。标签页面向选中的工作区而非某个会话——未选中工作区时渲染不可用状态——它加入详情列的标签环，而标签环在出现第二个标签页前保持隐藏；注册这个可选标签时会打开该列，使其可发现。消息动作把一条已定稿助手消息的文本复制为一条新的私有笔记，并保留可持久化的出处（会话 id + 已持久化的源事件 seq）；无文本的消息不渲染任何内容，因此绝不会发起一次空白创建。

每个工作区一个 `WorkspaceNotesManager` 支撑标签页，首次访问时惰性创建，创建即开始其基线 `workspaceNotes.list` 读取。Host 上的每一次已提交变更——无论来自本客户端还是其他客户端——都会发出一帧 `workspace-notes/changed`；插件只把该帧路由到所属工作区的 manager，由其重新拉取基线（乱序 revision 会被丢弃，落在读取进行中的帧会在该读取之上重放）。连接代际死亡（`connection/reconnecting`）时，每个活跃 manager 的列表被标记过期——标签页显示过期横幅——下一个代际建立（`connection/reset`）时各自重新拉取基线。

变更通过 `ctx.remote.workspaceNotes` 提交，按笔记的 revision compare-and-set 由 Host 负责。每次 update 与 delete 都携带编辑器观察到的 revision；`revision-conflict` 响应会带回权威笔记，编辑器据此把草稿重定基到最新内容，重试从最新内容开始而不是丢弃编辑。删除隐藏在内联确认之后；Agent 可见性切换是一次不触碰内容的普通 update。

样式仅使用 `--dsw-*` 语义 token，因此标签页与动作跟随当前的光亮、暗色、系统或黑曜石玻璃主题，包内没有本地颜色。`/client` 导出插件本体（`apply`/`inject`）、`NotesPane` 与 `MessageNoteAction` 组件、`WorkspaceNotesActions` 动词封装以及注入面类型。

## 模型体验

无。该浏览器侧层只读取并编辑工作区笔记 sidecar；笔记内容绝不进入 Session 日志或模型上下文。

#### KV Cache 影响

无；任何笔记变更都不触碰历史尾部。

## 已知限制与暂缓事项

- **Agent 可见性依赖可选 Consumer** —— 只有单独安装的 `dsh-workspace-notes-agent` Consumer 已挂载时，`agentVisible` 笔记才会进入模型；UI 本身不会加载它。
- **内容大小是 Host 策略** —— 部署方配置 `maxContentBytes`，超长内容由 Host 以 `content-too-large` 拒绝。编辑器不预先校验该上限，因此超长笔记在保存时才失败，而不是在输入过程中。
- **内容按原文渲染** —— 笔记正文以纯 Markdown 文本存储并展示；标签页不做 Markdown 渲染。
- **时间戳无本地化** —— 更新时间显示是确定性的 ISO-8601 切片（`YYYY-MM-DD HH:mm`），不是本地化格式化器。
