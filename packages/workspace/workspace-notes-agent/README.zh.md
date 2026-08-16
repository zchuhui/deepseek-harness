# `@deepseek-ai/dsh-workspace-notes-agent`

[English](README.md) | 中文

这是 [`dsh-workspace-notes`](../workspace-notes/README.md) 的 Agent Consumer。它会等待新建 Agent 的会话归属到一个已注册工作区，然后注册有作用域的 `notes_read` 和 `notes_write` 工具、每次写入都需要的批准门，以及项目记忆 system-prompt 段落。工作区外的会话不会得到这些贡献。

## 配置

| key | 含义 |
|---|---|
| `maxRenderBytes` | 项目记忆完整渲染的必填正整数上限。 |
| `maxNotes` | 选中的 agent 可见笔记数量的必填正整数上限。 |

每个模型步骤之前，插件读取当前工作区笔记；当工作区的家族修订号或渲染配置改变时，写入可忽略的 `workspace-notes/snapshot` 会话事件。提示词段落只从这一持久化快照组装，因此回放能够重建 Agent 实际可见的笔记列表。配置要求 `maxRenderBytes` 和 `maxNotes`；按确定性顺序选取最新的 agent 可见笔记。单条笔记若无法容纳进字节预算，会被记录并省略，而不会被静默截断。

`notes_read` 返回已提交的 agent 可见视图。`notes_write` 会在 Agent 固定的工作区中创建、编辑、更改可见性或删除一条笔记，并在变更提交前询问用户。带修订号的编辑和删除使用 Host 服务的 compare-and-set 结果，因此冲突会返回权威记录以供重试。

## 模型体验

### 工作区项目记忆

#### 模型看到的内容

当 Agent 的会话归属到工作区时，最新的 `workspace-notes/snapshot` 会在带作用域的 `workspace-notes:project-memory` system-prompt 段落中渲染选中的 agent 可见笔记。最新快照中不存在的笔记不会对模型可见。

#### Token 影响

有条件且受 `maxRenderBytes` 与 `maxNotes` 限制；会话不在工作区内或工作区没有选中笔记时为零。

#### KV Cache 影响

新写入的快照改变渲染文本时，项目记忆段落会被替换。未变化的工作区修订号与渲染策略会保留先前快照及其可复用前缀。

### 工作区笔记工具

#### 模型看到的内容

生成的 [`notes_read` 和 `notes_write` 工具 schema](../../../docs/tool-catalog.md) 只会出现在会话归属到已注册工作区的 Agent 作用域中。

#### Token 影响

有条件的工具 schema token；工作区外不会注册工具。

#### KV Cache 影响

注册或移除工具会改变 Agent 工具 schema，进而改变其请求前缀；普通笔记修改不会改变 schema。

## 已知限制与暂缓事项

- **单条过大笔记会被排除**：插件会明确记录错误，而不会截断超过 `maxRenderBytes` 的笔记；目前没有部分笔记渲染。
- **快照在模型步骤边界刷新**：模型请求正在进行时的笔记变更会在下一步生效，不会影响已经组装的请求。
