# @deepseek-ai/dsh-workspace-notes

English | [中文](README.zh.md)

Host-owned durable notes scoped to one registered workspace. The package registers `ctx.workspaceNotes`, persists `NoteId`-keyed rows in a storage domain, publishes the Host `workspaceNotes.list`, `workspaceNotes.create`, `workspaceNotes.update`, and `workspaceNotes.delete` Remote contract, and emits the forwarded `workspace-notes/changed` invalidation event. The [workspace notes and shared todos proposal](../../../.agents/notes/proposed/feature/2026-08-15-workspace-notes-and-shared-todos.zh.md) owns the design boundary.

Public request, value, and failure types are exported from the package root and `@deepseek-ai/dsh-workspace-notes/types`; [`src/types.ts`](src/types.ts) is their source. The browser read model is `WorkspaceNotesManager` from `@deepseek-ai/dsh-workspace-notes/client`; [`src/manager.ts`](src/manager.ts) is its source.

## Configuration

| key | meaning |
|---|---|
| `maxContentBytes` | Required positive safe integer: maximum UTF-8 byte length of one note's content. |

Content must contain at least one non-whitespace character, but accepted text is stored verbatim rather than trimmed. Content validation precedes workspace lookup, so a blank or oversized body is rejected without touching persistence.

```yaml
- id: workspace-notes
  name: '@deepseek-ai/dsh-workspace-notes'
  config:
    maxContentBytes: 65536
```

The service injects `storageDomain` and `workspaceRegistry`. Its durable domain is `workspace_notes`, with one `notes` table keyed by `NoteId`, one `cleanup_queue` table keyed by `WorkspaceId`, and a `revisions` global holding each workspace's monotone artifact-family revision counter.

## Data, ordering, and provenance

`WorkspaceNote` contains `noteId`, `workspaceId`, `revision`, `content` (Markdown), `agentVisible`, immutable `source`, and Host-assigned `createdAt`/`updatedAt` ISO-8601 timestamps. `source` records how the note came to exist: `{ kind: 'manual' }`, `{ kind: 'message', sessionId, sourceEventSeq }` for a copy out of one persisted session message, or `{ kind: 'agent', sessionId }` for a note an Agent wrote through an approved tool. `list` returns fresh immutable snapshots ordered by `updatedAt` descending, then `noteId` ascending. A created note's `updatedAt` always advances past every existing stamp in the same workspace, so creation order is encoded even within one millisecond and the ordered view is a deterministic truncation input.

`agentVisible` is the future read gate for Agent integrations; this package exposes no tool and reads nothing into model context by itself. The separately mounted Consumer packages own that surface.

## Service and Host Remote contract

The same four `WorkspaceNotesService` methods are published by `TypertRemoteService` and `@Remote`; the Host endpoint names are `workspaceNotes.list`, `workspaceNotes.create`, `workspaceNotes.update`, and `workspaceNotes.delete`. Every method returns a discriminated business union: `{ ok: true, value }` or `{ ok: false, error }`. Operational storage failures reject instead of being mislabeled as business errors.

| Method | Request | Success `value` | Rejected `error.code` |
|---|---|---|---|
| `list` | `{ workspaceId }` | `{ notes }` ordered view | `unknown-workspace` |
| `create` | `{ workspaceId, content, agentVisible, source }` | committed note at revision 1 | `unknown-workspace`, `content-blank`, `content-too-large` |
| `update` | `{ noteId, expectedRevision, content?, agentVisible? }` | committed note | `unknown-workspace`, `unknown-note`, `revision-conflict`, `content-blank`, `content-too-large` |
| `delete` | `{ noteId, expectedRevision }` | `{ absent: true }` | `unknown-workspace`, `revision-conflict` |

`WorkspaceNotesRevisionConflict` returns the authoritative `current` note, or `null` when it no longer exists, so a caller can reconcile without a second `list` request. `WorkspaceNotesContentTooLarge` returns both `maxBytes` and `actualBytes`.

## Compare-and-set, serialization, and idempotency

`update` and `delete` compare `expectedRevision` against the stored revision inside the owning workspace's mutation chain. A matching no-op update returns the stored note without bumping its revision. `delete` of an absent note succeeds regardless of the supplied revision and always returns the stable `{ absent: true }` postcondition, so a retry after a lost success response is safe.

A per-workspace promise queue serializes each workspace's mutations, so concurrent edits through one service instance resolve in commit order and a stale writer receives `revision-conflict` with the authoritative note. Serialization is single-process: storage-domain exposes no cross-process conditional write.

## Cleanup, recovery, and lifecycle

Deleting a workspace registration queues that workspace's record cleanup behind its prior mutations, then deletes the notes and finally the queue row; any interruption between steps replays safely on the next open because record deletion is idempotent. At open the service replays every queued entry and also reconciles orphaned notes whose workspace was deleted while the family was disabled. Disabling the plugin closes mutation admission, drains accepted operations, and closes the domain without deleting it; re-enabling restores every still-registered workspace's notes.

Every committed change and completed cleanup advances the workspace's revision counter in the domain global and emits `workspace-notes/changed` with `{ workspaceId, revision }`; the forwarded-event allowlist carries it to browser Consumers as the push invalidation signal.

## Client read model

`WorkspaceNotesManager` (`@deepseek-ai/dsh-workspace-notes/client`) owns one workspace's browser-side view: a `list` baseline refetched after each `workspace-notes/changed` frame for that workspace, stale-marking on disconnect, refetch on reconnect, in-flight collapse of concurrent refreshes, and replay of frames that land while a baseline is pending. Mutations stay on the generated Remote namespace; the manager owns only the read model and its freshness.

## Model Experience

### Workspace notes persistence

#### What the model sees

Nothing yet. The package registers no tools, injects no prompts, and writes no session events; `agentVisible` is stored and validated but no consumer reads it, so no request field ever carries this package's data. The deferred notes-agent Consumer owns any future model-visible surface.

#### Token effect

Zero direct tokens on every request.

#### KV Cache effect

Independent of live requests: the package never touches a request prefix, so it cannot invalidate provider cache reuse.

## Known Limitations and Deferred Work

- **Compare-and-set is single-process** — the per-workspace queue serializes one service instance only; multiple Host processes writing one storage root can still lose updates.
- **Agent surface is optional** — this provider stores and validates `agentVisible` but mounts no tools or prompt itself; the separately installed notes-agent Consumer owns that model-visible behavior.
- **Whole-domain scans** — `list` and cleanup iterate the full `notes` table in memory; an indexed per-workspace read remains deferred until a consumer defines the scale policy.
- **Trusted caller boundary** — the Remote methods carry no authenticated actor or audit identity; a deployment must expose the Host gateway only through its trusted or separately authenticated boundary.
