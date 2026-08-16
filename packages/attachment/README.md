# attachment/ - durable attachment capability family

English | [中文](README.zh.md)

The durable binary attachment seam and its local filesystem implementation. Both are product packages.

| Package | Role | ctx key |
|---|---|---|
| `attachment/` | Immutable attachment references, image limits, and storage service | `ctx.attachments` |
| `attachment-local/` | Content-addressed private storage below `DSH_HOME` | (registers on `ctx.attachments`) |
| `file-attachment/` | Immutable UTF-8 file references, limits, and storage service | `ctx.fileAttachments` |
| `file-attachment-local/` | Content-addressed private UTF-8 storage below `DSH_HOME` | (registers on `ctx.fileAttachments`) |

Unsent browser drafts are intentionally outside this capability. Bytes enter durable storage only when a user prompt is submitted or when a provider adapter commits structured model output.
