# @deepseek-ai/dsh-client-ui-workspace-notes

English | [中文](README.zh.md)

Workspace notes surface plugin, browser half: the `notes` entry (order 10) of the root-scoped `conversation.workbench.tab` strip plus the `note` entry (order 20) of the `conversation.chat.assistant-actions` strip. The tab addresses the selected workspace, not a session — with no workspace selected it renders its unavailable state — and joins the details column's tab ring, which stays hidden until a second tab exists; registering this optional tab opens that column so it is discoverable. The action copies one finalized assistant message's text into a fresh private note, preserving the durable provenance (session id + the persisted source event seq); a message without text renders nothing, so a blank create can never be attempted.

One `WorkspaceNotesManager` per workspace backs the tab, created lazily on first address with its baseline `workspaceNotes.list` read starting at creation. Every committed Host mutation — this client's or another client's — emits a `workspace-notes/changed` frame; the plugin routes each frame to the addressed workspace's manager only, which refetches the baseline (out-of-order revisions are dropped, and a frame landing during an in-flight read replays over it). A dead connection generation (`connection/reconnecting`) marks every live manager's list stale — the tab shows the stale banner — and the next established generation (`connection/reset`) repulls each baseline.

Mutations go through `ctx.remote.workspaceNotes`; the Host owns per-note revision compare-and-set. Every update and delete carries the revision the editor observed, and a `revision-conflict` reply carries the authoritative note, so the editor rebases onto the latest content and the retry starts from it instead of discarding the edit. Delete sits behind an inline confirmation; the Agent-visibility toggle is a plain update that never touches content.

Styling uses the `--dsw-*` semantic tokens only, so the tab and the action follow the active light, dark, system, or obsidian-glass theme with no package-local colors. The `/client` exports are the plugin body (`apply`/`inject`), the `NotesPane` and `MessageNoteAction` components, the `WorkspaceNotesActions` verb wrapper, and the injected face types.

## Model Experience

None, as this browser-side layer only reads and edits the workspace notes sidecar; note content never enters the Session log or model context.

#### KV Cache effect

None; no notes mutation touches the history tail.

## Known Limitations and Deferred Work

- **Agent visibility depends on the optional Consumer** — an `agentVisible` note reaches a model only when the separately installed `dsh-workspace-notes-agent` Consumer is mounted; the UI does not load it by itself.
- **Content size is a Host policy** — the deployment configures `maxContentBytes`, and the Host rejects oversized content with `content-too-large`. The editor does not pre-check the limit, so an oversized note fails on save rather than while typing.
- **Content renders verbatim** — the note body is stored and displayed as plain Markdown text; no Markdown rendering is applied in the tab.
- **Stamps are locale-free** — the updated-time display is a deterministic ISO-8601 slice (`YYYY-MM-DD HH:mm`), not a localized formatter.
