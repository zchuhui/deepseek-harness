# @deepseek-ai/dsh-workspace-todos

English | [中文](README.zh.md)

Host-owned shared todos scoped to one registered workspace. The package registers `ctx.workspaceTodos`, persists `SharedTodoId`-keyed rows in a storage domain, publishes the Host `workspaceTodos.list`, `workspaceTodos.create`, `workspaceTodos.updateContent`, `workspaceTodos.setStatus`, `workspaceTodos.assign`, and `workspaceTodos.delete` Remote contract, and emits the forwarded `workspace-todos/changed` invalidation event. The [workspace notes and shared todos proposal](../../../.agents/notes/proposed/feature/2026-08-15-workspace-notes-and-shared-todos.zh.md) owns the design boundary.

Public request, value, and failure types are exported from the package root and `@deepseek-ai/dsh-workspace-todos/types`; [`src/types.ts`](src/types.ts) is their source. The browser read model is `WorkspaceTodosManager` from `@deepseek-ai/dsh-workspace-todos/client`; [`src/manager.ts`](src/manager.ts) is its source.

## Configuration

| key | meaning |
|---|---|
| `maxContentBytes` | Required positive safe integer: maximum UTF-8 byte length of one todo's single-line content. |

Content must contain at least one non-whitespace character and no line break; accepted text is stored verbatim rather than trimmed. Content validation precedes workspace lookup, so a blank, multi-line, or oversized body is rejected without touching persistence.

```yaml
- id: workspace-todos
  name: '@deepseek-ai/dsh-workspace-todos'
  config:
    maxContentBytes: 4096
```

The service injects `storageDomain` and `workspaceRegistry`. Its durable domain is `workspace_todos`, with one `todos` table keyed by `SharedTodoId`, one `cleanup_queue` table keyed by `WorkspaceId`, and a `revisions` global holding each workspace's monotone artifact-family revision counter.

## Data, ordering, and provenance

`SharedTodo` contains `todoId`, `workspaceId`, `revision`, single-line `content`, lifecycle `status`, immutable `createdBy`, `assignedSessionId`, and Host-assigned `createdAt`/`updatedAt` plus `completedAt` ISO-8601 timestamps. `createdBy` records how the todo came to exist: `{ kind: 'user' }` for the todos workbench tab or `{ kind: 'agent', sessionId }` for an Agent writing through an approved tool. `list` returns fresh immutable snapshots ordered by status rank (`pending`, then `in_progress`, then `completed`, then `cancelled`), then `createdAt` ascending, then `todoId` ascending.

`assignedSessionId` is written only by `assign`; `completedAt` is set on entering `completed` and cleared on leaving it.

## Service and Host Remote contract

The same six `WorkspaceTodosService` methods are published by `TypertRemoteService` and `@Remote`; the Host endpoint names are `workspaceTodos.list`, `workspaceTodos.create`, `workspaceTodos.updateContent`, `workspaceTodos.setStatus`, `workspaceTodos.assign`, and `workspaceTodos.delete`. Every method returns a discriminated business union: `{ ok: true, value }` or `{ ok: false, error }`. Operational storage failures reject instead of being mislabeled as business errors.

| Method | Request | Success `value` | Rejected `error.code` |
|---|---|---|---|
| `list` | `{ workspaceId }` | `{ todos }` ordered view | `unknown-workspace` |
| `create` | `{ workspaceId, content, createdBy }` | committed todo at revision 1 in `pending` | `unknown-workspace`, `content-blank`, `content-not-single-line`, `content-too-large` |
| `updateContent` | `{ todoId, expectedRevision, content }` | committed todo | `unknown-workspace`, `unknown-todo`, `revision-conflict`, `content-blank`, `content-not-single-line`, `content-too-large` |
| `setStatus` | `{ todoId, expectedRevision, status }` | committed todo | `unknown-workspace`, `unknown-todo`, `revision-conflict`, `invalid-transition` |
| `assign` | `{ todoId, expectedRevision, sessionId }` | committed todo in `in_progress` | `unknown-workspace`, `unknown-todo`, `revision-conflict`, `invalid-transition` |
| `delete` | `{ todoId, expectedRevision }` | `{ absent: true }` | `unknown-workspace`, `revision-conflict` |

`SharedTodosRevisionConflict` returns the authoritative `current` todo, or `null` when it no longer exists, so a caller can reconcile without a second `list` request. `SharedTodosInvalidTransition` returns both `current` and `requested`; `SharedTodosContentTooLarge` returns both `maxBytes` and `actualBytes`.

## Transitions, assignment, serialization, and idempotency

Allowed status transitions are `pending → in_progress | cancelled`, `in_progress → pending | completed | cancelled`, and `completed | cancelled → pending`. A `setStatus` request for the current status is a matching no-op that returns the stored todo without bumping its revision. `assign` commits `pending → in_progress` plus `assignedSessionId` in one atomic compare-and-set; re-assignment of a reopened `pending` todo replaces the earlier session id.

`updateContent`, `setStatus`, `assign`, and `delete` compare `expectedRevision` against the stored revision inside the owning workspace's mutation chain. A matching no-op content edit returns the stored todo unchanged. `delete` of an absent todo succeeds regardless of the supplied revision and always returns the stable `{ absent: true }` postcondition, so a retry after a lost success response is safe.

A per-workspace promise queue serializes each workspace's mutations, so concurrent edits through one service instance resolve in commit order and a stale writer receives `revision-conflict` with the authoritative todo. Serialization is single-process: storage-domain exposes no cross-process conditional write.

## Cleanup, recovery, and lifecycle

Deleting a workspace registration queues that workspace's record cleanup behind its prior mutations, then deletes the todos and finally the queue row; any interruption between steps replays safely on the next open because record deletion is idempotent. At open the service replays every queued entry and also reconciles orphaned todos whose workspace was deleted while the family was disabled. Disabling the plugin closes mutation admission, drains accepted operations, and closes the domain without deleting it; re-enabling restores every still-registered workspace's todos.

Every committed change and completed cleanup advances the workspace's revision counter in the domain global and emits `workspace-todos/changed` with `{ workspaceId, revision }`; the forwarded-event allowlist carries it to browser Consumers as the push invalidation signal.

## Client read model

`WorkspaceTodosManager` (`@deepseek-ai/dsh-workspace-todos/client`) owns one workspace's browser-side view: a `list` baseline refetched after each `workspace-todos/changed` frame for that workspace, stale-marking on disconnect, refetch on reconnect, in-flight collapse of concurrent refreshes, and replay of frames that land while a baseline is pending. Mutations stay on the generated Remote namespace; the manager owns only the read model and its freshness.

## Model Experience

### Workspace todos persistence

#### What the model sees

Nothing yet. The package registers no tools, injects no prompts, and writes no session events; `createdBy`'s Agent provenance is stored but no consumer writes it, so no request field ever carries this package's data. The deferred todos-agent Consumer owns any future model-visible surface.

#### Token effect

Zero direct tokens on every request.

#### KV Cache effect

Independent of live requests: the package never touches a request prefix, so it cannot invalidate provider cache reuse.

## Known Limitations and Deferred Work

- **Compare-and-set is single-process** — the per-workspace queue serializes one service instance only; multiple Host processes writing one storage root can still lose updates.
- **Agent surface is optional** — this provider stores and validates Agent-created provenance but mounts no tools itself; the separately installed todos-agent Consumer owns that model-facing behavior.
- **Whole-domain scans** — `list` and cleanup iterate the full `todos` table in memory; an indexed per-workspace read remains deferred until a consumer defines the scale policy.
- **Trusted caller boundary** — the Remote methods carry no authenticated actor or audit identity; a deployment must expose the Host gateway only through its trusted or separately authenticated boundary.
