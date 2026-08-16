# `@deepseek-ai/dsh-workspace-todos-bundle`

English | [中文](README.zh.md)

An optional layer for the Web profile. Its [`cordis.patch.yml`](cordis.patch.yml) inserts the durable [`dsh-workspace-todos`](../../workspace/workspace-todos/README.md) Host service, the per-workspace [`dsh-workspace-todos-agent`](../../workspace/workspace-todos-agent/README.md) tool Consumer, and the browser [`dsh-client-ui-workspace-todos`](../../client/ui-workspace-todos/README.md) workbench surface. Neither `dsh-base` nor `dsh-web-app` references this bundle, so a new profile has no shared-todo data, routes, tools, or tab until it is installed.

From this source checkout, install it into a Web profile with `pnpm dsh plugin --profile web add .\packages\bundle\workspace-todos-bundle`. The plugin command anchors that relative path to the invoking directory, then appends the bundle after `dsh-web-app`; its dependencies give the profile loader the complete Host and browser package closure. After the package is published, the equivalent release command is `dsh plugin --profile web add @deepseek-ai/dsh-workspace-todos-bundle`. A profile may install this bundle without the notes bundle. The patch's explicit policies are a 4,096-byte single-line todo limit and human approval for every Agent status change. A later profile patch may replace either complete configuration row.

## Model Experience

### Workspace todo tools

#### What the model sees

Through the inserted todos-agent row, agents whose sessions belong to a workspace receive the `todos_read` and `todos_update` tools for its shared todos.

#### Token effect

Conditional tool-schema tokens: the tools appear only for agents in a workspace.

#### KV Cache effect

None directly. The inserted tools appear in the Agent tool schema; this patch carrier adds no prompt text or session history.

## Known Limitations and Deferred Work

- **Web-profile dependency** — this layer expects the workspace registry, storage, Host remotes, and workbench slots that `dsh-web-app` inserts; it is not a headless profile bundle.
- **Configuration replacement is whole-row** — a profile override of `workspace-todos` or `workspace-todos-agent` must restate all required fields.
