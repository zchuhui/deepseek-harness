# @deepseek-ai/dsh-workspace-todos

[English](README.md) | 中文

Host 侧持有的、按已注册工作区作用域的共享待办。包注册 `ctx.workspaceTodos`，在存储域中持久化以 `SharedTodoId` 为键的行，发布 Host `workspaceTodos.list`、`workspaceTodos.create`、`workspaceTodos.updateContent`、`workspaceTodos.setStatus`、`workspaceTodos.assign`、`workspaceTodos.delete` Remote 契约，并发出转发的 `workspace-todos/changed` 失效事件。设计边界由[工作区笔记与共享待办方案](../../../.agents/notes/proposed/feature/2026-08-15-workspace-notes-and-shared-todos.zh.md)持有。

公开的请求、值与失败类型从包根与 `@deepseek-ai/dsh-workspace-todos/types` 导出；来源是 [`src/types.ts`](src/types.ts)。浏览器读模型是 `@deepseek-ai/dsh-workspace-todos/client` 的 `WorkspaceTodosManager`；来源是 [`src/manager.ts`](src/manager.ts)。

## 配置

| 键 | 含义 |
|---|---|
| `maxContentBytes` | 必填正安全整数：单条待办单行内容的最大 UTF-8 字节长度。 |

内容必须至少包含一个非空白字符且不含换行；接受的文本原样存储而非修剪。内容校验先于工作区查询，因此空白、多行或超长的正文不会触碰持久层。

```yaml
- id: workspace-todos
  name: '@deepseek-ai/dsh-workspace-todos'
  config:
    maxContentBytes: 4096
```

服务注入 `storageDomain` 与 `workspaceRegistry`。持久域为 `workspace_todos`：以 `SharedTodoId` 为键的 `todos` 表、以 `WorkspaceId` 为键的 `cleanup_queue` 表，以及持有每个工作区单调 artifact-family 版本号的 `revisions` global。

## 数据、排序与来源

`SharedTodo` 包含 `todoId`、`workspaceId`、`revision`、单行 `content`、生命周期 `status`、不可变的 `createdBy`、`assignedSessionId`，以及 Host 赋值的 `createdAt`/`updatedAt` 与 `completedAt` ISO-8601 时间戳。`createdBy` 记录待办的产生方式：待办标签页手工创建的 `{ kind: 'user' }`，或 Agent 通过获批工具写入的 `{ kind: 'agent', sessionId }`。`list` 返回新的不可变快照，按状态位次（`pending`、`in_progress`、`completed`、`cancelled`）、`createdAt` 升序、`todoId` 升序排列。

`assignedSessionId` 只由 `assign` 写入；`completedAt` 在进入 `completed` 时设置、离开时清空。

## 服务与 Host Remote 契约

同样的六个 `WorkspaceTodosService` 方法通过 `TypertRemoteService` 与 `@Remote` 发布；Host 端点名为 `workspaceTodos.list`、`workspaceTodos.create`、`workspaceTodos.updateContent`、`workspaceTodos.setStatus`、`workspaceTodos.assign`、`workspaceTodos.delete`。每个方法返回判别式业务联合：`{ ok: true, value }` 或 `{ ok: false, error }`。运营性存储失败以 reject 呈现，不会被误标为业务错误。

| 方法 | 请求 | 成功 `value` | 拒绝 `error.code` |
|---|---|---|---|
| `list` | `{ workspaceId }` | `{ todos }` 有序视图 | `unknown-workspace` |
| `create` | `{ workspaceId, content, createdBy }` | 修订号为 1、状态 `pending` 的已提交待办 | `unknown-workspace`、`content-blank`、`content-not-single-line`、`content-too-large` |
| `updateContent` | `{ todoId, expectedRevision, content }` | 已提交待办 | `unknown-workspace`、`unknown-todo`、`revision-conflict`、`content-blank`、`content-not-single-line`、`content-too-large` |
| `setStatus` | `{ todoId, expectedRevision, status }` | 已提交待办 | `unknown-workspace`、`unknown-todo`、`revision-conflict`、`invalid-transition` |
| `assign` | `{ todoId, expectedRevision, sessionId }` | `in_progress` 状态的已提交待办 | `unknown-workspace`、`unknown-todo`、`revision-conflict`、`invalid-transition` |
| `delete` | `{ todoId, expectedRevision }` | `{ absent: true }` | `unknown-workspace`、`revision-conflict` |

`SharedTodosRevisionConflict` 返回权威的 `current` 待办，不存在时为 `null`，调用方无需第二次 `list` 即可对账。`SharedTodosInvalidTransition` 同时返回 `current` 与 `requested`；`SharedTodosContentTooLarge` 同时返回 `maxBytes` 与 `actualBytes`。

## 状态迁移、指派、串行化与幂等

允许的状态迁移为 `pending → in_progress | cancelled`、`in_progress → pending | completed | cancelled`、`completed | cancelled → pending`。请求当前状态的 `setStatus` 是匹配的无操作，返回存储待办且不提升修订号。`assign` 在一次原子比较并设置中提交 `pending → in_progress` 加 `assignedSessionId`；对重开为 `pending` 的待办重新指派会替换先前的会话 id。

`updateContent`、`setStatus`、`assign` 与 `delete` 在所属工作区的变更链内将 `expectedRevision` 与存储修订号比较。匹配的无操作内容编辑原样返回存储待办。删除已不存在的待办无论提供的修订号为何都成功，并始终返回稳定的 `{ absent: true }` 后置条件，因此成功响应丢失后的重试是安全的。

按工作区的 promise 队列串行化该工作区的全部变更：经同一服务实例的并发编辑按提交顺序解决，过期写入方收到携带权威待办的 `revision-conflict`。串行化是单进程的：storage-domain 不提供跨进程条件写。

## 清理、恢复与生命周期

删除工作区注册会把该工作区的记录清理排在它先前的变更之后：先落地队列行，再删除待办，最后移除队列行；步骤间的任何中断都会在下一次打开时安全重放，因为记录删除是幂等的。打开时服务重放所有队列项，并核对家族禁用期间工作区被删除的孤儿待办。禁用插件会关闭变更准入门、排空已接受的变更并关闭域但不删除它；重新启用恢复所有仍注册工作区的待办。

每次提交的变更与完成的清理都会推进域 global 中该工作区的修订号，并发出携带 `{ workspaceId, revision }` 的 `workspace-todos/changed`；转发事件允许清单把它作为推送失效信号带给浏览器 Consumer。

## 客户端读模型

`WorkspaceTodosManager`（`@deepseek-ai/dsh-workspace-todos/client`）持有单个工作区的浏览器侧视图：`list` 基线在该工作区的每个 `workspace-todos/changed` 帧后重取、断连时标记过期、重连后重取、并发刷新合并为一次在途读取、基线在途期间到达的帧会被重放。变更仍走生成的 Remote 命名空间；manager 只持有读模型及其新鲜度。

## 模型体验

### 工作区待办持久化

#### 模型看到什么

暂无。本包不注册工具、不注入提示、不写会话事件；`createdBy` 的 Agent 来源已存储但没有消费者写入它，因此任何请求字段都不携带本包数据。延后的 todos-agent Consumer 持有未来的模型可见面。

#### Token 影响

每次请求零直接 token。

#### KV 缓存影响

与活动请求无关：本包从不触碰请求前缀，因此不会使提供方缓存复用失效。

## 已知限制与后续工作

- **比较并设置是单进程的** — 按工作区队列只串行化单个服务实例；多个 Host 进程写同一存储根仍可能丢失更新。
- **Agent 面是可选的** — 此 provider 存储并校验 Agent 创建来源，但不自行挂载工具；单独安装的 todos-agent Consumer 拥有该面向模型的行为。
- **全域扫描** — `list` 与清理在内存中遍历整个 `todos` 表；按工作区的索引读取在具体消费者定义规模策略前保持延后。
- **可信调用方边界** — Remote 方法不带经认证的执行者或审计身份；部署必须仅通过可信或另行认证的边界暴露 Host 网关。
