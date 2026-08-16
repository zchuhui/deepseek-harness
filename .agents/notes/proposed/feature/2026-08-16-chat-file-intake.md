# Agent Note: Chat file intake from host directories

Status: proposed

English | [中文](2026-08-16-chat-file-intake.zh.md)

## Problem

The Web composer accepts browser-supplied images, but a user cannot inspect a host directory and attach a file already present in the session workspace. The existing workspace directory picker selects one workspace directory; it lists directories only, publishes absolute paths to its GUI consumer, and grants no right to expose file content to a model. The image attachment store accepts immutable rasters only. Reusing either mechanism as a generic file reader would let a model-visible message depend on a mutable host path, bypass the attachment lifecycle, or accidentally turn directory navigation into durable authority.

The feature must let a user select relevant files without granting the model discovery or read access to a directory. A selected file must remain replayable after its source changes or disappears, must obey deployment-controlled limits, and must render consistently in every built-in theme while a picker or composer is open.

## Proposal

Ship a vertical chat-file-intake capability for the Web profile. It adds an explicit “Add files” action to the composer, a host-backed directory browser, and durable file content blocks. The first release accepts configured UTF-8 text and source formats plus the image formats already accepted by the image attachment capability. It supports selecting individual files from a directory, not attaching a directory or recursively expanding one.

The user flow is:

1. The composer opens a file picker rooted at the session workspace. A deployment may expose an explicitly confirmed “Other directory” route.
2. The browser displays bounded, name-sorted directory and file rows. The user selects one or more files and sees their sanitized display names, kinds, sizes, and any confirmation requirement.
3. The host returns short-lived selection grants, not host paths or file bytes. The composer renders those grants as removable file cards beside existing image drafts.
4. On send, the host revalidates each grant, reads the exact selected target, validates the whole batch, commits immutable objects, and only then appends the user message.
5. Text files become durable `file` content blocks. Image files use the existing durable `image` blocks. Provider adapters receive every resulting block or reject the message explicitly; none may silently omit a file.

### Scope and exclusions

| Included in the first release | Excluded from the first release |
| --- | --- |
| Browse a session workspace and configured external roots | Recursive directory attachment, directory archives, and glob selection |
| Multiple UTF-8 text/source files and PNG/JPEG/WebP/GIF images | PDF, Office, audio, video, archives, executables, and arbitrary binary files |
| File cards, remove/retry states, keyboard navigation, and localized copy | Dragging host-directory files into the browser, full-text file search, and content editing in the picker |
| Durable replay, resume, fork, export, and explicit provider handling | A model tool that lists or reads unselected host files |

### Package topology

| Package or surface | Responsibility |
| --- | --- |
| `packages/attachment/file-attachment` | Defines `ctx.fileAttachments`, opaque file ids, verified text-file reads, limits, and stable failures. |
| `packages/attachment/file-attachment-local` | Stores accepted UTF-8 file bytes as content-addressed immutable objects below the Harness home and verifies metadata on read. |
| `packages/host/file-picker` | Defines the host file-picker capability: bounded directory/file listings, selection grants, and a native-or-browse interaction union. |
| `packages/host/file-picker-native` and `packages/host/file-picker-browse` | Implement OS file selection and in-app browsing without exposing raw paths to the model or client message content. |
| `packages/host/apiproxy` and `packages/client/connection` | Add session-scoped picker RPCs, typed grant payloads, prompt intake parts, and host-side admission. |
| `packages/llm/llm` and each provider adapter | Add the role-neutral `file` content block and render its verified text to the provider request or reject it explicitly. |
| `packages/client/ui-attachment` | Adds reusable text-file cards beside image cards; it remains a presentation-only atoms package. |
| `packages/client/ui-conversation` | Owns composer state, picker launch, locale labels, send/retry behavior, and history rendering. |

`file-attachment` is a separate capability seam from the image attachment store. A text-file object's media validation, extraction, and provider projection differ from raster decoding; keeping those rules separate avoids widening image-only methods into a loosely typed binary store. The file picker is likewise separate from the workspace directory picker: its selection grant is user authorization for a file snapshot, not workspace creation or general filesystem authority.

### Selection grants and host RPC

The file picker returns a `FileSelectionGrant` containing an opaque id, a sanitized basename, a workspace-relative display path when one exists, a declared kind, byte count, and a version fingerprint. It never returns the canonical host path. The grant is bound to one session, one connected client, the exact canonical target, and the picker configuration that authorized it. It expires on removal, successful publication, session disposal, client disconnect, or its configured lifetime.

The gateway exposes three session-scoped operations: one opens or lists a picker level, one changes the current directory or requests an external-root confirmation, and one creates grants for selected file rows. The prompt intake union gains `{ type: 'host-file', selectionId }`; it does not carry a filesystem path, base64 string, or browser `File`. The gateway rejects a grant from another session or client, an expired or already-consumed grant, a target whose fingerprint changed, a directory, a symlink escaping its configured root, and a target that no longer matches the selected kind.

The browse provider must use the configured file-access policy and canonical targets. It lists direct children in stable name order with a configurable entry bound and `truncated` truthfully marked. Its rows carry only data needed for navigation and selection. The native provider can receive an OS-selected target, but it issues the same grant and applies the same root, type, fingerprint, and confirmation rules before the target becomes selectable. Neither provider publishes a path to model-visible content.

### Durable content and model projection

The file attachment store accepts only configured UTF-8 file kinds. It validates byte limits before decoding, rejects invalid UTF-8 and NUL-bearing binary content, records a sanitized display name plus media type and byte count, and stores the original accepted bytes under a content-addressed id. `readText(ref)` rechecks the digest and stored metadata, then returns the exact decoded text. It does not reapply admission limits on historical reads, so a later policy reduction does not make a valid session unreplayable.

`dsh-llm` gains a provider-neutral `FileBlock` with a `file` tag and a durable file reference. The event log records the block, never the selected path or temporary grant. Every adapter receives the block in its declared content conversion path: the first release emits a deterministic labeled text section from the verified stored bytes. An adapter that cannot supply that text must return `UNSUPPORTED_CONTENT`; it must not flatten, skip, or replace a file with a path. Compaction supplies the same content to its chosen route and fails explicitly when that route cannot consume it. History, session export, fork, and ACP gain an explicit file representation before the block is enabled in a shipping bundle.

Images selected from a directory do not create a file attachment. After grant validation they enter the existing image batch validation and `ctx.attachments.saveImage` flow from the [image attachment decision](../../implemented/feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md), preserving its modality checks, image limits, durable references, and history viewer. A mixed prompt keeps the user-selected order across text, file, and image blocks.

### Admission, limits, and sensitive data

All deployment-varying rules are validated configuration, resolved before execution, and projected to the composer for local pre-checks. The file-attachment configuration owns maximum file count, per-file bytes, aggregate raw bytes, aggregate decoded text bytes, accepted text media types, and display-name length. The file-picker configuration owns browse entry bounds, allowed roots, external-root availability, grant lifetime, symlink policy, hidden-row policy, and patterns that require an additional confirmation. The base bundle supplies explicit defaults through Cordis configuration; consumer code does not hide fallback limits inside send or read methods.

Host admission is authoritative. It obtains every granted target, verifies freshness and authorization, reads and validates all members before writing any new durable object, then commits in submitted order. A malformed, too-large, unreadable, changed, unsupported, or unconfirmed member appends no user event. A later storage failure can leave a deduplicated, unreferenced object; reference-aware collection remains separate work and no rollback deletes an object that another accepted message may share. The grant is consumed only after the owning user event publishes, so a transient failure can be retried while it remains valid.

Filename rules are an aid to deliberate disclosure, not a secrets detector. A matching sensitive-name pattern asks for an explicit per-file confirmation and the host verifies that confirmation; normal selection is still the primary authorization. The picker states that accepted content is sent to the selected model provider. It never scans file content for secrets, claims that a filename is safe, or gives the model a path it can use to fetch more data.

### Composer, accessibility, locale, and themes

The composer adds one labeled “Add files” control while the file-picker capability is composed. The dialog has a focus trap, restores focus to its launcher on dismissal, exposes directory and file rows as keyboard-operable controls, announces selection-count and validation changes, and keeps the submit control disabled only while a required picker operation is pending. File cards show name, kind, size, remove action, and retryable admission failures; they are ordered with image cards by user selection order. Unsent grants are live session state only and do not survive reload, session change, or disposal.

`ui-conversation` owns English and Chinese messages and passes resolved labels to `ui-attachment` atoms. The presentation packages follow the [Web UI style reference](../../../../docs/web-styling.md): CSS Modules consume existing `--dsw-alias-*` semantic tokens, use no literal palette values, add no feature-level dark selectors, and keep focus and reduced-motion behavior intact. The picker modal, file cards, sensitive-data confirmation, hover/focus states, disabled rows, errors, and loading skeletons must therefore remain legible when the active preference changes between `light`, `dark`, `system`, and `glass-obsidian`; a live theme change preserves open-dialog state and selections because the component owns no color-scheme state.

### Delivery slices

1. Build `file-attachment` and its local provider, the `FileBlock`, adapter conversions, durable projection/history/export support, and focused conformance tests. No browser entry is enabled until every assembled consumer renders or rejects the new block explicitly.
2. Add the host file-picker seam, browse and native providers, opaque grant RPCs, and host batch admission. Compose it behind a bundle row and prove that direct RPC callers cannot substitute paths or grants.
3. Add the composer dialog, file cards, locale copy, theme-token styling, and state-machine integration. Include image grants in the same ordered rail while preserving existing paste/drop behavior.
4. Add a runnable Web snapshot scenario and real browser demonstration covering pick, remove, send, reload, and theme switching. Update package READMEs, the attachment subsystem reference, the capability graph, configuration catalog, and the active Agent Note when implementation moves from proposal to shipped decision.

## Alternatives considered

**Extend the workspace directory picker.** Rejected because it exists to choose a workspace directory and intentionally lists no files. Giving its path-oriented browse protocol file reads would combine workspace setup with model-data authorization and expose more path information than a chat message needs.

**Attach source paths and reread them for every model request.** Rejected because a later edit, deletion, symlink change, or resumed session would change what the model sees. Immutable content-addressed storage plus a logged file reference makes replay, fork, export, and model requests deterministic.

**Send selected files as browser base64 uploads.** Rejected for host-directory selection because the browser may be remote from the host filesystem and would need raw file bytes and paths that it does not otherwise own. A host grant keeps file I/O and authorization at the host while preserving the existing image upload route for browser-originated images.

**Make directory browsing a model tool.** Rejected because the task is user-directed context sharing, not agent filesystem discovery. A model-visible tool would create broader authority, repeated confirmation decisions, and an audit trail unrelated to one explicit user message.

**Store every file in the image attachment seam.** Rejected because image decoding, pixel policy, binary retrieval, and native vision conversion are not text-file semantics. A dedicated seam keeps each provider and storage contract exact while both stores can share content-addressed implementation techniques.

## Acceptance criteria

- A user can browse the session workspace, select configured text files and supported images, remove any selection, and send one mixed message without exposing an absolute host path in the transcript, RPC prompt payload, session event, or provider request.
- A file modified, deleted, replaced, moved, or made unreadable after selection is rejected before persistence; the user receives an actionable retry state and no partial message event exists.
- A successful file message remains identical after reload, resume, fork, compaction input, and export; deleting or changing the original host file cannot affect its model-visible content.
- Model adapters either receive the exact stored text projection or reject the request with a stable unsupported-content failure. No adapter, compaction path, history renderer, ACP client, or export path silently drops a `FileBlock`.
- Limits, file kinds, sensitive-name confirmation, grant lifetime, root scope, hidden rows, symlink handling, and browse bounds are configurable and checked authoritatively at the host.
- The dialog and cards are keyboard-operable, localized in English and Chinese, preserve focus correctly, and remain readable and functional across `light`, `dark`, `system`, and `glass-obsidian`, including a live preference change while the picker is open.
- Focused seam, gateway, adapter, client-state, and CSS/component tests cover success and every rejection class; a keyless assembled Web snapshot and real-server browser GIF cover the user-visible flow.

## Risks

Text files can consume substantial prompt context even when their byte size is modest. The decoded-text aggregate limit, visible pre-check, and provider-side labeled projection bound this cost, but context-window-aware truncation is intentionally not part of the first release; an over-budget request fails rather than silently clipping a file.

Directory browsing can disclose names and metadata to a remote browser. Configured roots, exact selection grants, optional external-root confirmation, and no model access reduce exposure, but deployments that cannot allow any host metadata to remote clients must omit the browse provider and use the native picker only.

Content-addressed retention creates unreferenced objects after a failed batch or abandoned session. The design does not delete them speculatively because deduplication and forked history make ownership non-local. Reference-aware collection is a later capability with its own durability design.

The first release deliberately leaves binary document extraction out. Adding PDF, Office, archive, audio, or video support requires a separate extraction policy, malware and resource limits, provider representation, and user disclosure; treating those formats as UTF-8 would be unsafe and misleading.
