# `@deepseek-ai/dsh-workspace-notes-bundle`

English | [中文](README.zh.md)

An optional layer for the Web profile. Its [`cordis.patch.yml`](cordis.patch.yml) inserts the durable [`dsh-workspace-notes`](../../workspace/workspace-notes/README.md) Host service, the per-workspace [`dsh-workspace-notes-agent`](../../workspace/workspace-notes-agent/README.md) project-memory and tool Consumer, and the browser [`dsh-client-ui-workspace-notes`](../../client/ui-workspace-notes/README.md) workbench surface. Neither `dsh-base` nor `dsh-web-app` references this bundle, so a new profile has no notes data, routes, model context, or tab until it is installed.

From this source checkout, install it into a Web profile with `pnpm dsh plugin --profile web add .\packages\bundle\workspace-notes-bundle`. The plugin command anchors that relative path to the invoking directory, then appends the bundle after `dsh-web-app`; its dependencies give the profile loader the complete Host and browser package closure. After the package is published, the equivalent release command is `dsh plugin --profile web add @deepseek-ai/dsh-workspace-notes-bundle`. A profile may install this bundle without the shared-todos bundle. The patch's explicit policies are a 65,536-byte note limit and at most ten agent-visible notes within an 8,192-byte project-memory render. A later profile patch may replace either complete configuration row.

## Model Experience

### Workspace note integrations

#### What the model sees

Through the inserted notes-agent row, workspace notes marked agent-visible become the documented project-memory segment and the `notes_read` and `notes_write` tools for agents whose sessions belong to a workspace.

#### Token effect

Conditional: the project-memory content is capped by the bundle's note and byte policies, while the tool schemas appear only for agents in a workspace.

#### KV Cache effect

The notes-agent package owns this effect: a changed snapshot can replace its project-memory segment before a request; this patch carrier itself contributes no request text.

## Known Limitations and Deferred Work

- **Web-profile dependency** — this layer expects the workspace registry, storage, Host remotes, and workbench slots that `dsh-web-app` inserts; it is not a headless profile bundle.
- **Configuration replacement is whole-row** — a profile override of `workspace-notes` or `workspace-notes-agent` must restate all required fields.
