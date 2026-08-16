# @deepseek-ai/dsh-file-attachment

English | [中文](README.zh.md)

The durable UTF-8 file-attachment seam. `ctx.fileAttachments` validates and atomically commits immutable text-file bytes, then returns a serializable `TextFileAttachmentRef`; consumers never persist host paths, browser object URLs, provider URLs, or base64 in session events.

`validateTextFile` runs the same admission policy without persisting. Batch writers validate every member before saving any member so a rejected file cannot publish a partial message. `saveTextFile` commits an accepted file before its owning session event is published. `readTextFile` verifies the stored bytes, reference metadata, and UTF-8 decode; callers may cancel the read.

## Model Experience

`FileBlock` is a role-neutral model input. The host writes it only after durable admission; a provider resolves its reference immediately before building the request. The standard pi-ai adapter renders a clearly delimited file header, media type, and verified UTF-8 text. Model code never receives a host path or directory grant.

#### KV Cache effect

File blocks are ordinary text context. Their effect follows the provider's normal text-context cache behavior.

## Known Limitations and Deferred Work

- **UTF-8 text only** — binary documents need format-specific extraction and provider representation.
- **No model filesystem access** — a selected directory contributes only explicitly chosen file bytes, not a tool or path capability.
