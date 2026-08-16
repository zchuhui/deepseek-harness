# `@deepseek-ai/dsh-workspace-notes-agent`

English | [中文](README.zh.md)

The Agent Consumer for [`dsh-workspace-notes`](../workspace-notes/README.md). It waits until a newly created Agent's session belongs to a registered workspace, then registers scoped `notes_read` and `notes_write` tools, an approval gate for every write, and a project-memory system-prompt segment. Sessions outside a workspace receive none of these contributions.

## Configuration

| key | meaning |
|---|---|
| `maxRenderBytes` | Required positive integer cap for the complete project-memory rendering. |
| `maxNotes` | Required positive integer cap for selected agent-visible notes. |

Before each model step, the plugin reads the current workspace notes and records an ignorable `workspace-notes/snapshot` session event when the workspace family revision or render configuration changed. The prompt segment is assembled only from that durable snapshot, so replay reconstructs the exact agent-visible note list. The configuration requires `maxRenderBytes` and `maxNotes`; newest agent-visible notes are selected deterministically, while a single note that cannot fit the byte budget is logged and omitted rather than silently truncating it.

`notes_read` returns the committed agent-visible view. `notes_write` creates, edits, changes visibility, or deletes one note in the Agent's fixed workspace and asks the user before the mutation commits. Revision-bearing edits and deletes use the Host service's compare-and-set result, so a conflict returns the authoritative record for a retry.

## Model Experience

### Workspace project memory

#### What the model sees

For an Agent whose session belongs to a workspace, the latest `workspace-notes/snapshot` renders the selected agent-visible notes in the scoped `workspace-notes:project-memory` system-prompt segment. Notes absent from the latest snapshot are not visible.

#### Token effect

Conditional and capped by `maxRenderBytes` and `maxNotes`; zero when the session has no workspace or the workspace has no selected notes.

#### KV Cache effect

The project-memory segment is replaced when a newly appended snapshot changes its rendered text. Unchanged workspace revision and render policy preserve the preceding snapshot and its reusable prefix.

### Workspace-notes tools

#### What the model sees

The generated [`notes_read` and `notes_write` tool schemas](../../../docs/tool-catalog.md) appear only in Agent scopes whose sessions belong to a registered workspace.

#### Token effect

Conditional tool-schema tokens; no tool is registered outside a workspace.

#### KV Cache effect

Registering or removing the tools changes the Agent tool schema and therefore its request prefix; ordinary note mutations do not change the schema.

## Known Limitations and Deferred Work

- **One oversized note is excluded** — the plugin logs a clear error instead of truncating a note that exceeds `maxRenderBytes`; no partial-note rendering exists.
- **Snapshots refresh at model-step boundaries** — a note changed during an in-flight model request reaches the next step, not the request already assembled.
