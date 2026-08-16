# @deepseek-ai/dsh-file-attachment-local

English | [中文](README.zh.md)

Private, content-addressed storage for `@deepseek-ai/dsh-file-attachment`. Objects live below `$DSH_HOME/file-attachments/v1`, use SHA-256 ids, and are published only after the file and directory entries are synchronized. A durable session event records only a `TextFileAttachmentRef`.

The provider accepts UTF-8 text only. It validates each file against configured media types and per-file, per-message, and decoded-text byte limits. Source filenames are reduced to a leaf display name, so local directory paths never enter storage or session logs.

## Configuration

```yaml
- id: file-attachment-local
  name: '@deepseek-ai/dsh-file-attachment-local'
  config:
    maxFileBytes: 524288
    maxFilesPerMessage: 10
    maxMessageFileBytes: 2097152
    maxDecodedTextBytes: 2097152
    mediaTypes: [text/plain, text/markdown, application/json, application/yaml, text/yaml]
```

## Known Limitations and Deferred Work

- **UTF-8 text only** — binary documents require a dedicated extraction pipeline.
- **No download endpoint** — chat history displays file metadata while providers read verified content server-side.
