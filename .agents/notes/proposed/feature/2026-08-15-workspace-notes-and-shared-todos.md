# Agent Note: Workspace notes and shared todos as optional plugins

Status: proposed

English | [中文](2026-08-15-workspace-notes-and-shared-todos.zh.md)

## Problem

Sessions need durable workspace-level notes and human/agent shared todos, but not every deployment needs either feature. Making them a required desktop subsystem would create storage, model tools, prompt content, and UI that profiles cannot remove.

## Proposal

Workspace notes and shared todos are independently composable plugin families. A profile loads only the domain, agent integration, and UI packages it wants. A profile that does not load a family creates none of its durable state and exposes none of its RPC methods, tools, context injection, or workbench tabs.

The existing `todo_write` tool remains the calling agent session's transient execution plan. Its tool name, event type, replacement semantics, and session projection remain unchanged. The web UI may label that plan as “Execution plan” so it is distinct from the optional workspace-level shared todos.

## Package topology

- `dsh-workspace-notes` owns note ids, records, validation, workspace-domain storage, and service methods.
- `dsh-workspace-notes-agent` optionally adds `notes_read`, approval-controlled `notes_write`, and the model-visible note snapshot event.
- `dsh-ui-workspace-notes` optionally registers the Notes workbench tab and uses the notes RPC methods.
- `dsh-workspace-todos` owns shared-todo ids, records, validation, workspace-domain storage, and service methods.
- `dsh-workspace-todos-agent` optionally adds `todos_read` and `todos_update` under the configured approval policy.
- `dsh-ui-workspace-todos` optionally registers the Todos workbench tab and uses the todo RPC methods.

The base conversation UI supplies an optional workbench-tab registration point. Details remains its built-in session-scoped tab. Tab plugins receive the active workspace id and register no tab when their family is absent. The base UI owns no note or shared-todo store.

## Persistence and lifecycle

`dsh-workspace-notes` opens a `workspace-notes` domain with a `notes` table keyed by `NoteId`. A record contains `workspaceId`, positive `revision`, Markdown `content`, `agentVisible`, a discriminated `source`, and ISO-8601 creation and update times. A message source contains `sessionId` and the durable source event id; a manual source has no source reference; an agent source records the creating session id.

`dsh-workspace-todos` opens a `workspace-todos` domain with a `todos` table keyed by `SharedTodoId`. A record contains `workspaceId`, positive `revision`, single-line `content`, `status`, `createdBy`, optional committed `assignedSessionId`, and timestamps. The allowed transitions are `pending → in_progress | cancelled`, `in_progress → pending | completed | cancelled`, `completed → pending`, and `cancelled → pending`. Only `completed` stamps `completedAt`; leaving that state clears it.

Create returns a new record. Update and delete require an expected revision and fail with a typed conflict containing the current record; clients refresh and ask the user to retry rather than silently overwriting another writer. Each provider serializes its own mutations. A workspace registration deletion queues durable cleanup of that workspace's records; startup resumes an interrupted cleanup. Disabling a plugin does not remove its domain, and re-enabling it restores the records for still-registered workspaces.

Durable cleanup is a `cleanupQueue` table in the same domain, keyed by `WorkspaceId` and holding the enqueue time. Deleting a workspace registration upserts one queue record; the provider's serialized mutation lane then deletes that workspace's records and finally the queue record. Record deletion is idempotent, so startup recovery re-runs every queue entry found at domain open, and a crash at any step resumes safely. Mutations naming a deregistered workspace fail with the unknown-workspace error regardless of queue state.

## Host and client protocol

Each domain exposes a separate Typert remote namespace. Its list operation accepts one `WorkspaceId` and returns a revision-bearing, ordered view; create, update, delete, and status operations return the committed view. Domain validation and workspace-existence checks run on the host. The UI never writes domain storage directly.

The host sends `host/workspace-artifact-changed` frames carrying the workspace id, artifact family, and monotonic family revision after a committed mutation or recovered cleanup. Each client family manager fetches its baseline on connect and refetches the named workspace after a newer frame. A disconnected client treats its local list as stale until the baseline returns. A client that does not load a family has no manager and ignores that family's frames.

The notes and todos RPC schemas declare stable error details for unknown workspace, unknown artifact, revision conflict, invalid transition, invalid content, and unavailable feature. API catalog generation, the fetch proxy, the browser API client, and fake API fixtures change with the remote declaration; no UI package invents a parallel HTTP endpoint.

## Workbench UI

`ui-conversation` declares a root-scoped list slot named `conversation.workbench.tab`. Its owner provides the selected workspace id, active-tab id, tab-selection action, and a session-maybe details currency. The built-in Details tab remains registered by `ui-conversation`; without a session it renders an empty details state while workspace tabs remain usable.

The workbench stores the last selected tab by workspace id in the client workspace UI state. Selecting a tool call selects Details. Notes and Todos register their tab only after their client manager has a baseline. Their tabs render loading, unavailable, empty, and conflict states rather than assuming a current session. The existing `conversation.details.tool` slot remains a tool-output renderer inside Details and is not reused as a tab extension point.

The Notes tab supports create, edit, visibility changes, delete confirmation, and message-to-note creation. The Todo tab supports create, content edits, explicit status changes, delete confirmation, and assignment. A message action registers only when the notes UI plugin is active and preserves the addressed durable message event id.

All workbench contributors use the semantic `--dsw-*` theme tokens supplied by `dsh-client-ui-theme`; feature CSS contains no literal light or dark color. Theme changes repaint notes, todos, status glyphs, editor previews, hover and selected states, and conflict feedback without remounting the workbench. When the persisted preference is `system`, the client follows the operating system's `prefers-color-scheme` change and retains the active workspace, tab, expanded groups, and unsaved editor draft.

## Durable and model-visible state

Each family has its own versioned `storageDomain`, keyed by branded `NoteId` or `SharedTodoId` and scoped by `WorkspaceId`. Its provider serializes writes and defines deletion, revision, and workspace-removal behavior. It does not alter session logs or migrate their records.

The notes agent plugin reads only `agentVisible` notes. Before a request that receives project memory, it appends an immutable snapshot of the exact note ids, revisions, and rendered text to that session, skipping the append when the newest existing snapshot already matches the current view and render config. A visibility or content change affects a later request only after a new snapshot is appended. The snapshot preserves the model-visible input for replay and forks.

Message-derived notes retain the source session id and durable message/event reference in addition to their copied content. Shared todos define explicit state transitions and retain assignment intent separately from composer drafts; editing or discarding a draft never changes a todo.

## Agent tools and assignment

Agent integrations derive the workspace from the owning agent session; tool arguments never select an arbitrary workspace id. A session without a registered workspace omits these tools. `notes_read` returns only visible notes within a configured byte limit. `notes_write` creates or edits visible project-memory notes and always requests approval before committing. It cannot create private user notes or change a note's source reference.

`todos_read` returns the caller workspace's shared todos. `todos_update` accepts one operation at a time: create, edit content, or change status. Creation and content edits request approval; a valid status update on an existing todo follows the configured progress policy. The tool cannot delete a todo or set `assignedSessionId`; deletion and assignment remain explicit user actions. Tool results name the committed revision so a model can re-read after a conflict.

Selecting “Assign” creates a client-only assignment intent containing the todo id, expected revision, and target session id, then prepares the target session's draft. The user invokes a distinct Send assignment action. The client first creates or verifies the target session, sends the prompt with the intent, and commits `pending → in_progress` plus `assignedSessionId` only after the host accepts that exact intent. Cancelling, editing away the intent, send failure, or routing to a different session clears the intent without mutating the todo.

## Context limits and snapshot order

The notes-agent config requires a maximum rendered byte count and maximum note count. It orders visible notes by `updatedAt` then id, renders them as delimited untrusted workspace material, and fails loud when one note exceeds the per-note limit. It omits older notes only according to the documented deterministic truncation rule.

For every model request, the plugin obtains the visible-note view, renders it, and appends `workspace-notes/snapshot` only when the dedup key changed since the last appended snapshot — the family revision plus a fingerprint of the render-affecting config. Request assembly reads the newest snapshot event at or before the request and builds the scoped project-memory prompt section from that event payload, so an unchanged view reuses the earlier event and replay of any request reads exactly the snapshot that request used. Skipping unchanged snapshots bounds session-log growth; the config fingerprint prevents a stale render when limits change without content changing. The append completes before request assembly. The event stores workspace id, family revision, ordered note ids and revisions, rendered text, and truncation metadata. Its invariant rejects malformed ids, duplicate notes, impossible revisions, or text that does not match the encoded records.

`workspace-notes/snapshot` carries the envelope's `ignorable: true`. The notes agent is optional, so a build without the family must still load and replay a session containing snapshot events; the snapshot carries no semantics for such a build, because the project-memory section exists only in notes-enabled assemblies.

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

The notes and todo triplets are independent. A deployment may load only a user-facing notes service and UI, only shared todos, both families, or neither. Agent integration packages require their corresponding domain package; UI packages require the corresponding domain RPC capability. Desktop bundles select these entries in their profile rather than embedding the features as unconditional behavior.

## Delivery sequence

1. Add the root workbench-tab slot with its Details-only baseline and test that an assembly with no tab contributors preserves current behavior.
2. Implement the two domain plugins, their persistence recovery, remote declarations, generated API paths, and client managers; ship each with a no-agent, no-UI composition test.
3. Implement the Notes and Todos UI plugins, including conflict presentation and message-derived note action.
4. Add the agent integrations, approval rendering, deterministic project-memory snapshots, and runnable assembled examples.
5. Add assignment intents after the domain and composer APIs can commit an exact send action; do not infer assignment from arbitrary draft changes.

## Alternatives considered

- **Make notes and shared todos part of the desktop application.** Rejected because headless, automation, and tailored desktop profiles would inherit unavailable UI, storage, tools, and prompt behavior.
- **Extend `todo_write` into the shared todo store.** Rejected because it is an event-sourced, whole-list execution plan owned by one agent session, while shared todos need stable ids, partial updates, human ownership, and workspace lifetime.
- **Put all notes and todos in one workspace-artifacts plugin.** Rejected because deployments must be able to enable notes without shared todos and vice versa; the two durable models and agent permissions evolve independently.

## Acceptance criteria

- A profile with neither family has no related storage domain, RPC method, model tool, context injection, or workbench tab, and existing `todo_write` behavior is unchanged.
- Each domain can load alone; its optional agent and UI plugins fail loud when the required domain capability is absent.
- A notes-enabled agent request records the exact visible-note snapshot used for that request, replay does not read newer workspace notes into an earlier request, and a build without the notes family still loads a session containing snapshot events.
- Shared-todo mutations preserve stable ids, validate the documented state transitions, and do not change assignment state merely because a composer draft is edited or discarded.
- A concurrent edit returns the current revision without overwriting data; interrupted workspace cleanup resumes at startup; disabling and re-enabling a family preserves records for registered workspaces.
- The workbench remains usable with a selected workspace and no session, while Details continues to render tool output through its existing session-scoped slot.
- Domain/invariant tests cover validation, transitions, conflicts, and recovery; remote/client tests cover baseline plus push-frame refresh; UI tests cover tab absence, empty state, conflicts, and assignment cancellation; assembled runnable examples provide keyless snapshots for project memory and each supported composition.
- UI coverage verifies Notes and Todos under light, dark, system, and glass-obsidian themes; a system color-scheme change preserves the active workspace, tab, expanded state, and unsaved draft while updating semantic colors.

## Risks

- More packages and profiles increase composition testing and dependency declarations. Every optional package needs a narrow README, resolver manifest entry, and a tested absence path.
- Workspace removal and concurrent writes must be defined by each domain before storage is introduced; an unspecified file format or last-write-wins update would lose user data.
- Project-memory text is untrusted user content. Size limits, rendering delimiters, and approval for agent-authored visible notes are required to limit prompt injection and context growth.
