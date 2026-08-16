# @deepseek-ai/dsh-client-ui-workspace-todos

English | [中文](README.zh.md)

Workspace todos surface plugin, browser half: the `todos` entry (order 20) of the root-scoped `conversation.workbench.tab` strip. The tab addresses the selected workspace, not a session — with no workspace selected it renders its unavailable state — and joins the details column's tab ring, which stays hidden until a second tab exists; registering this optional tab opens that column so it is discoverable.

One `WorkspaceTodosManager` per workspace backs the tab, created lazily on first address with its baseline `workspaceTodos.list` read starting at creation. Every committed Host mutation — this client's or another client's — emits a `workspace-todos/changed` frame; the plugin routes each frame to the addressed workspace's manager only, which refetches the baseline (out-of-order revisions are dropped, and a frame landing during an in-flight read replays over it). A dead connection generation (`connection/reconnecting`) marks every live manager's list stale — the tab shows the stale banner — and the next established generation (`connection/reset`) repulls each baseline.

Mutations go through `ctx.remote.workspaceTodos`; the Host owns per-todo revision compare-and-set. Every mutation carries the revision the view observed, and a `revision-conflict` reply carries the authoritative todo, so the content editor rebases onto the latest content and the retry starts from it instead of discarding the edit. The card offers only the domain's allowed status transitions (`pending → in_progress | cancelled`, `in_progress → pending | completed | cancelled`, `completed | cancelled → pending`). Assignment is two-step: preparing records a browser-local exact intent and puts that text in the target session's composer without mutating the todo; the explicit send action sends that stored text, then commits `pending → in_progress` plus the addressed session in one atomic Host claim. Cancelling, ordinary composer edits, and failed sends leave the todo unchanged. Delete sits behind an inline confirmation.

Styling uses the `--dsw-*` semantic tokens only, so the tab follows the active light, dark, system, or obsidian-glass theme with no package-local colors. The `/client` exports are the plugin body (`apply`/`inject`), the `TodosPane` component, the `WorkspaceTodosActions` verb wrapper, and the injected face types.

## Model Experience

None, as this browser-side layer only reads and edits the workspace todos sidecar; todo content never enters the Session log or model context.

#### KV Cache effect

None; no todos mutation touches the history tail.

## Known Limitations and Deferred Work

- **Assignment delivery is not transactional across the Host and target session** — the target prompt is accepted before the compare-and-set claim. A concurrent revision conflict leaves the todo unassigned but does not retract the already delivered task message; the UI clears the one-use intent and requires an explicit reprepare.
- **Content size is a Host policy** — the deployment configures the content byte limit, and the Host rejects oversized content with `content-too-large`. The editor does not pre-check the limit, so an oversized todo fails on save rather than while typing.
- **Stamps are locale-free** — the updated-time display is a deterministic ISO-8601 slice (`YYYY-MM-DD HH:mm`), not a localized formatter.
