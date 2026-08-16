# `@deepseek-ai/dsh-workspace-todos-agent`

English | [中文](README.zh.md)

The Agent Consumer for [`dsh-workspace-todos`](../workspace-todos/README.md). It waits until a newly created Agent's session belongs to a registered workspace, then registers scoped `todos_read` and `todos_update` tools. Sessions outside a workspace receive neither tool.

## Configuration

| key | meaning |
|---|---|
| `statusUpdateApproval` | Required `ask` or `allow` policy for Agent status changes; content writes always ask. |

`todos_read` returns the workspace's committed, ordered view. `todos_update` creates one todo, edits its content, or changes its status in that fixed workspace. Creation and content edits always require human approval. The deployment config's required `statusUpdateApproval` value controls whether a status change asks as well. Every update carries the observed revision; a conflict returns the current record after the Agent re-reads it, and the domain's transition rules remain authoritative.

## Model Experience

### Workspace-todos tools

#### What the model sees

The generated [`todos_read` and `todos_update` tool schemas](../../../docs/tool-catalog.md) appear only in Agent scopes whose sessions belong to a registered workspace.

#### Token effect

Conditional tool-schema tokens; no tool is registered outside a workspace.

#### KV Cache effect

Registering or removing the tools changes the Agent tool schema and therefore its request prefix. Todo mutations do not change that schema.

## Known Limitations and Deferred Work

- **Assignment is a user-interface operation** — the Agent tool creates, edits, and changes status but does not choose or send work to another session; assignment remains the workbench's explicit user action.
- **Attachment follows the first workspace resolution** — once an Agent session gains a workspace, the scoped tools remain attached for that Agent lifetime; moving a live session between workspaces is not supported by the workspace registry.
