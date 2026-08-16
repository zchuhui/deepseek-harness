# @deepseek-ai/dsh-file-attachment-local

[English](README.md) | 中文

`@deepseek-ai/dsh-file-attachment` 的私有内容寻址存储。对象位于 `$DSH_HOME/file-attachments/v1` 下，使用 SHA-256 标识，且只有在文件和目录条目同步后才会发布。持久会话事件只记录 `TextFileAttachmentRef`。

该提供方仅接收 UTF-8 文本。它会根据已配置的媒体类型、单文件、单消息和解码文本字节上限校验每个文件。源文件名会缩减为叶子展示名，因此本地目录路径不会进入存储或会话日志。

## 配置

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

## 已知限制与待完成工作

- **仅 UTF-8 文本** — 二进制文档需要专用提取管线。
- **无下载端点** — 聊天历史展示文件元数据，提供方在服务端读取已校验内容。
