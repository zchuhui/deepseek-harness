# `@deepseek-ai/dsh-workspace-todos-agent`

[English](README.md) | 中文

这是 [`dsh-workspace-todos`](../workspace-todos/README.md) 的 Agent Consumer。它会等待新建 Agent 的会话归属到一个已注册工作区，然后注册有作用域的 `todos_read` 和 `todos_update` 工具。工作区外的会话不会得到任一工具。

## 配置

| key | 含义 |
|---|---|
| `statusUpdateApproval` | Agent 状态变更的必填 `ask` 或 `allow` 策略；内容写入始终需要询问。 |

`todos_read` 返回工作区已提交且有序的视图。`todos_update` 会在该固定工作区中创建一条待办、编辑其内容或改变其状态。创建和内容编辑始终需要人工批准。部署配置中必填的 `statusUpdateApproval` 决定状态变更是否也需要询问。每次更新都携带观察到的修订号；冲突后 Agent 会重新读取并得到当前记录，领域的状态转换规则仍是权威依据。

## 模型体验

### 工作区待办工具

#### 模型看到的内容

生成的 [`todos_read` 和 `todos_update` 工具 schema](../../../docs/tool-catalog.md) 只会出现在会话归属到已注册工作区的 Agent 作用域中。

#### Token 影响

有条件的工具 schema token；工作区外不会注册工具。

#### KV Cache 影响

注册或移除工具会改变 Agent 工具 schema，进而改变其请求前缀。待办修改不会改变该 schema。

## 已知限制与暂缓事项

- **分配是用户界面操作**：Agent 工具可以创建、编辑和改变状态，但不能选择另一个会话或向其发送工作；分配仍是工作台中显式的用户操作。
- **挂载跟随首次工作区解析**：Agent 会话一旦进入工作区，有作用域的工具会在该 Agent 生命周期内保持挂载；工作区注册表不支持移动仍在运行的会话。
