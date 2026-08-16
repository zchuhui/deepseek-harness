# @deepseek-ai/dsh-client-ui-workspace-todos

[English](README.md) | 中文

工作区待办界面的浏览器侧：根作用域 `conversation.workbench.tab` 条带的 `todos` 条目（order 20）。标签页面向选中的工作区而非某个会话——未选中工作区时渲染不可用状态——它加入详情列的标签环，而标签环在出现第二个标签页前保持隐藏；注册这个可选标签时会打开该列，使其可发现。

每个工作区一个 `WorkspaceTodosManager` 支撑标签页，首次访问时惰性创建，创建即开始其基线 `workspaceTodos.list` 读取。Host 上的每一次已提交变更——无论来自本客户端还是其他客户端——都会发出一帧 `workspace-todos/changed`；插件只把该帧路由到所属工作区的 manager，由其重新拉取基线（乱序 revision 会被丢弃，落在读取进行中的帧会在该读取之上重放）。连接代际死亡（`connection/reconnecting`）时，每个活跃 manager 的列表被标记过期——标签页显示过期横幅——下一个代际建立（`connection/reset`）时各自重新拉取基线。

变更通过 `ctx.remote.workspaceTodos` 提交，按待办的 revision compare-and-set 由 Host 负责。每次变更都携带视图观察到的 revision；`revision-conflict` 响应会带回权威待办，内容编辑器据此把草稿重定基到最新内容，重试从最新内容开始而不是丢弃编辑。卡片只提供领域允许的状态迁移（`pending → in_progress | cancelled`、`in_progress → pending | completed | cancelled`、`completed | cancelled → pending`）。指派分为两步：准备阶段记录浏览器本地的精确意图，并将该文本放入目标会话的输入区但不修改待办；显式发送动作发送保存的文本后，才以一次原子 Host 认领提交 `pending → in_progress` 加目标会话。取消、普通输入区编辑和发送失败都不会改变待办。删除隐藏在内联确认之后。

样式仅使用 `--dsw-*` 语义 token，因此标签页跟随当前的光亮、暗色、系统或黑曜石玻璃主题，包内没有本地颜色。`/client` 导出插件本体（`apply`/`inject`）、`TodosPane` 组件、`WorkspaceTodosActions` 动词封装以及注入面类型。

## 模型体验

无。该浏览器侧层只读取并编辑工作区待办 sidecar；待办内容绝不进入 Session 日志或模型上下文。

#### KV Cache 影响

无；任何待办变更都不触碰历史尾部。

## 已知限制与暂缓事项

- **指派交付无法跨 Host 与目标会话构成事务** —— 目标提示词会先被接受，再执行 compare-and-set 认领。并发修订冲突会保留未指派的待办，但无法撤回已经送达的任务消息；UI 会清除一次性意图，要求用户显式重新准备。
- **内容大小是 Host 策略** —— 部署方配置内容字节上限，超长内容由 Host 以 `content-too-large` 拒绝。编辑器不预先校验该上限，因此超长待办在保存时才失败，而不是在输入过程中。
- **时间戳无本地化** —— 更新时间显示是确定性的 ISO-8601 切片（`YYYY-MM-DD HH:mm`），不是本地化格式化器。
