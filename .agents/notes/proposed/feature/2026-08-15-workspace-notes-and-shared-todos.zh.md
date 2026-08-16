# Agent Note: 工作区笔记与共享待办采用可选插件

Status: proposed

[English](2026-08-15-workspace-notes-and-shared-todos.md) | 中文

## Problem

会话需要持久化的工作区级笔记与人机共享待办，但并非每种部署都需要其中任一项。若把它们做成桌面端的必选子系统，profile 将无法移除其存储、模型工具、提示词内容和 UI。

## Proposal

工作区笔记与共享待办分别构成可组合的插件族。profile 只加载所需的领域、Agent 集成和 UI 包。未加载某个插件族的 profile 不会创建其持久化状态，也不会暴露其 RPC 方法、工具、上下文注入或工作台标签页。

现有 `todo_write` 工具仍是调用 Agent 会话的临时执行计划。它的工具名、事件类型、整表替换语义和会话投影均保持不变。Web UI 可以将该计划标为“执行计划”，以区别于可选的工作区级共享待办。

## Package topology

- `dsh-workspace-notes` 负责笔记 ID、记录、校验、工作区域存储和服务方法。
- `dsh-workspace-notes-agent` 可选地提供 `notes_read`、受审批控制的 `notes_write` 和模型可见的笔记快照事件。
- `dsh-ui-workspace-notes` 可选地注册笔记工作台标签页，并调用笔记 RPC 方法。
- `dsh-workspace-todos` 负责共享待办 ID、记录、校验、工作区域存储和服务方法。
- `dsh-workspace-todos-agent` 可选地按配置的审批策略提供 `todos_read` 与 `todos_update`。
- `dsh-ui-workspace-todos` 可选地注册待办工作台标签页，并调用待办 RPC 方法。

基础对话 UI 提供可选的工作台标签页注册点。详情仍是其内置的会话级标签页。标签插件获得活跃工作区 ID；当对应插件族未装配时，不注册任何标签页。基础 UI 不拥有笔记或共享待办 store。

## Persistence and lifecycle

`dsh-workspace-notes` 打开一个 `workspace-notes` domain，并以 `NoteId` 为键提供 `notes` 表。记录包含 `workspaceId`、正数 `revision`、Markdown `content`、`agentVisible`、判别联合 `source` 和 ISO-8601 创建与更新时间。消息来源包含 `sessionId` 和持久化来源事件 ID；手工来源没有来源引用；Agent 来源记录创建会话 ID。

`dsh-workspace-todos` 打开一个 `workspace-todos` domain，并以 `SharedTodoId` 为键提供 `todos` 表。记录包含 `workspaceId`、正数 `revision`、单行 `content`、`status`、`createdBy`、可选的已提交 `assignedSessionId` 和时间戳。允许的迁移为 `pending → in_progress | cancelled`、`in_progress → pending | completed | cancelled`、`completed → pending` 和 `cancelled → pending`。只有 `completed` 写入 `completedAt`；离开该状态时清除它。

创建操作返回新记录。更新和删除要求期望修订号，并以携带当前记录的类型化冲突失败；客户端刷新并要求用户重试，而不是静默覆盖其他写入者。每个 provider 串行化自己的变更。删除工作区注册会排队清理该工作区的记录；启动时恢复被中断的清理。禁用插件不会删除其 domain，重新启用会恢复仍已注册工作区的记录。

持久化清理是同一 domain 内的一张 `cleanupQueue` 表，以 `WorkspaceId` 为键并记录入队时间。删除工作区注册会 upsert 一条队列记录；provider 的串行变更通道随后删除该工作区的记录，最后删除队列记录。记录删除是幂等的，因此启动恢复在 domain 打开时重跑队列中的每一条记录，任何步骤崩溃后重跑都是安全的。针对已注销工作区的变更无论队列状态如何都以 unknown-workspace 错误失败。

## Host and client protocol

每个领域公开独立的 Typert remote namespace。列表操作接收一个 `WorkspaceId` 并返回带修订号的有序视图；创建、更新、删除和状态操作返回已提交视图。领域校验和工作区存在性检查在 Host 运行。UI 绝不直接写入领域存储。

Host 在一次已提交变更或恢复清理后发送 `host/workspace-artifact-changed` 帧，其中包含工作区 ID、工件族和单调递增的工件族修订号。每个客户端工件族 manager 在连接时获取 baseline，并在收到更新帧后重新获取被指定的工作区。断开连接的客户端在 baseline 返回前将本地列表视为过期。未加载某个工件族的客户端没有对应 manager，并忽略该工件族的帧。

笔记和待办 RPC schema 为未知工作区、未知工件、修订冲突、非法迁移、非法内容和功能不可用声明稳定错误详情。API catalog 生成、fetch proxy、浏览器 API client 和 fake API fixture 都随 remote 声明变更；任何 UI 包都不另行发明 HTTP 端点。

## Workbench UI

`ui-conversation` 声明名为 `conversation.workbench.tab` 的 root-scoped list slot。其 owner 提供选中的工作区 ID、活跃标签 ID、选取标签动作，以及 session-maybe 的详情货币。内置详情标签仍由 `ui-conversation` 注册；没有会话时它渲染空详情状态，工作区标签仍可使用。

工作台在客户端工作区 UI 状态中按工作区 ID 保存上次选中的标签。选择工具调用会选择详情。笔记和待办仅在各自客户端 manager 获得 baseline 后注册标签。其标签渲染加载、不可用、空和冲突状态，不假定当前存在会话。既有 `conversation.details.tool` slot 仍是详情内部的工具输出渲染器，不复用为标签扩展点。

笔记标签支持创建、编辑、可见性变更、删除确认和从消息创建笔记。待办标签支持创建、内容编辑、显式状态变更、删除确认和指派。消息操作仅在笔记 UI 插件启用时注册，并保留被寻址的持久化消息事件 ID。

所有工作台贡献者使用 `dsh-client-ui-theme` 提供的语义化 `--dsw-*` 主题 token；功能 CSS 不包含写死的浅色或深色。主题变更会重绘笔记、待办、状态 glyph、编辑预览、悬浮与选中状态及冲突反馈，不重新挂载工作台。当持久化偏好为 `system` 时，客户端跟随操作系统的 `prefers-color-scheme` 变更，并保留活跃工作区、标签、展开分组和未保存的编辑草稿。

## Durable and model-visible state

每个插件族拥有独立且带版本的 `storageDomain`，以品牌化的 `NoteId` 或 `SharedTodoId` 为键，并以 `WorkspaceId` 为作用域。其 provider 串行化写入，并定义删除、修订和工作区移除时的行为。它不修改会话日志，也不迁移会话日志记录。

笔记 Agent 插件只读取 `agentVisible` 笔记。在某次请求接收项目记忆之前，它会向该会话追加一个不可变快照，记录精确的笔记 ID、修订号和渲染文本；当最新已存在的快照已与当前视图和渲染配置一致时跳过追加。可见性或内容变更仅在追加新快照后的后续请求中生效。该快照保留模型可见输入，以支持回放和分叉。

来自消息的笔记除复制的内容外，还保留来源会话 ID 与持久化的消息／事件引用。共享待办定义显式状态迁移，并将指派意图与输入区草稿分开保存；编辑或丢弃草稿绝不会改变待办。

## Agent tools and assignment

Agent 集成从拥有该 Agent 的会话推导工作区；工具参数绝不选择任意工作区 ID。没有已注册工作区的会话不暴露这些工具。`notes_read` 只返回配置字节上限内的可见笔记。`notes_write` 创建或编辑可见的项目记忆笔记，并且总是在提交前请求审批。它不能创建用户私有笔记，也不能改变笔记来源引用。

`todos_read` 返回调用方工作区的共享待办。`todos_update` 每次只接受一种操作：创建、编辑内容或变更状态。创建和内容编辑请求审批；既有待办上的有效状态更新遵从配置的进度策略。该工具不能删除待办或设置 `assignedSessionId`；删除和指派仍是显式用户动作。工具结果命名已提交修订号，使模型可以在冲突后重新读取。

选择“指派”会创建仅客户端使用的指派意图，其中包含待办 ID、期望修订号和目标会话 ID，然后准备目标会话的草稿。用户调用单独的“发送指派”动作。客户端先创建或验证目标会话，以该意图发送提示词，并且仅当 Host 接受这一精确意图后才提交 `pending → in_progress` 和 `assignedSessionId`。取消、编辑掉意图、发送失败或路由到其他会话都会清除意图，而不变更待办。

## Context limits and snapshot order

notes-agent 配置要求最大渲染字节数和最大笔记数。它按 `updatedAt` 再按 ID 排序可见笔记，将其渲染为带分隔符的不可信工作区材料；单条笔记超过单条上限时明确失败。仅按照已记录的确定性截断规则省略较旧笔记。

每次模型请求时，插件获取可见笔记视图、渲染它，并仅在去重键自上一条已追加快照以来变化时才追加 `workspace-notes/snapshot`——去重键是工件族修订号加上影响渲染的配置指纹。请求组装读取该请求时刻之前（含该时刻）最新的一条快照事件，并从该事件载荷构建有作用域的项目记忆提示词段，因此视图未变时复用更早的事件，任意请求的回放读到的正是该请求当时使用的快照。跳过未变化的快照以限制会话日志增长；配置指纹防止限制变化而内容未变时沿用过期渲染。追加（发生时）在请求组装之前完成。事件存储工作区 ID、工件族修订号、有序笔记 ID 与修订号、渲染文本和截断元数据。其不变式拒绝格式错误的 ID、重复笔记、不可能的修订号，或与编码记录不匹配的文本。

`workspace-notes/snapshot` 携带 envelope 的 `ignorable: true`。笔记 Agent 是可选的，因此未装配该家族的构建仍必须能加载并回放包含快照事件的会话；快照对这样的构建不携带语义，因为项目记忆段只存在于启用笔记的组装中。

## Profile composition

```yaml
plugins:
  - '@deepseek-ai/dsh-workspace-notes'
  - '@deepseek-ai/dsh-workspace-notes-agent'
  - '@deepseek-ai/dsh-ui-workspace-notes'
  - '@deepseek-ai/dsh-workspace-todos'
  - '@deepseek-ai/dsh-workspace-todos-agent'
  - '@deepseek-ai/dsh-ui-workspace-todos'
```

笔记与待办的三件套彼此独立。部署可以只加载面向用户的笔记服务与 UI、只加载共享待办、同时加载两个插件族，或两者都不加载。Agent 集成包依赖对应的领域包；UI 包依赖对应的领域 RPC 能力。桌面 bundle 在 profile 中选择这些条目，而不是将功能作为无条件行为嵌入。

## Delivery sequence

1. 增加 root 工作台标签 slot 和仅详情的基线，并测试没有标签贡献者的组装保持现有行为。
2. 实现两个领域插件、其持久化恢复、remote 声明、生成的 API 路径和客户端 manager；每个都随无 Agent、无 UI 的组合测试交付。
3. 实现笔记与待办 UI 插件，包括冲突呈现和从消息创建笔记的操作。
4. 增加 Agent 集成、审批渲染、确定性的项目记忆快照和可运行的组装示例。
5. 在领域和输入区 API 能够提交精确发送动作后增加指派意图；不得从任意草稿变更推断指派。

## Alternatives considered

- **将笔记和共享待办设为桌面应用的一部分。** 不采用，因为无头、自动化和定制桌面 profile 会被迫携带不可用的 UI、存储、工具和提示词行为。
- **将 `todo_write` 扩展为共享待办存储。** 不采用，因为它是单个 Agent 会话拥有的、事件溯源的整表执行计划；共享待办需要稳定 ID、部分更新、人类所有权和工作区生命周期。
- **将全部笔记和待办放入一个 workspace-artifacts 插件。** 不采用，因为部署必须能够只启用笔记或只启用共享待办；两种持久化模型和 Agent 权限会独立演进。

## Acceptance criteria

- 未加载任一插件族的 profile 没有相关 storage domain、RPC 方法、模型工具、上下文注入或工作台标签页，且现有 `todo_write` 行为不变。
- 每个领域包可以单独加载；其可选 Agent 与 UI 插件在所需领域能力缺失时明确失败。
- 启用笔记的 Agent 请求会记录该请求使用的精确可见笔记快照，回放不会把更新后的工作区笔记读入先前请求，未装配笔记家族的构建仍能加载包含快照事件的会话。
- 共享待办的变更保留稳定 ID，校验已记录的状态迁移；仅编辑或丢弃输入区草稿不会改变指派状态。
- 并发编辑返回当前修订号而不覆盖数据；中断的工作区清理会在启动时恢复；禁用并重新启用插件族会保留已注册工作区的记录。
- 工作台在工作区已选中但没有会话时仍可使用，而详情继续通过现有会话级 slot 渲染工具输出。
- 领域／不变式测试覆盖校验、迁移、冲突和恢复；remote／客户端测试覆盖 baseline 与推送帧刷新；UI 测试覆盖标签缺席、空状态、冲突和取消指派；组装后的可运行示例为项目记忆和每种受支持组合提供无密钥快照。
- UI 覆盖在浅色、深色、跟随系统和曜石玻璃主题下验证笔记与待办；系统颜色方案变更会更新语义颜色，同时保留活跃工作区、标签、展开状态和未保存草稿。

## Risks

- 更多包和 profile 会增加组合测试与依赖声明。每个可选包都需要精简 README、resolver manifest 条目和经过测试的缺席路径。
- 引入存储前，每个领域都必须定义工作区移除与并发写入；未明确的文件格式或后写覆盖会丢失用户数据。
- 项目记忆文本是不可信的用户内容。必须设置大小限制、渲染分隔符，并审批 Agent 编写的可见笔记，以限制提示词注入和上下文增长。
