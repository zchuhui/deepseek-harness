/**
 * Agent-scoped `todos_read` and `todos_update` tools over the workspace-todos
 * service. The owning workspace is fixed at registration; model arguments
 * never choose one.
 * @module @deepseek-ai/dsh-workspace-todos-agent/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
// Type-only: brings the `ctx.workspaceTodos` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-workspace-todos'
import type { SharedTodoId, SharedTodosFailure } from '@deepseek-ai/dsh-workspace-todos/types'
import type { TodosReadResult, TodosStatusApprovalPolicy, TodosUpdateResult } from './types.ts'

/** The single operation one `todos_update` call performs. */
const ACTIONS = ['create', 'edit-content', 'set-status'] as const

/** The four lifecycle statuses of a shared todo. */
const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const

/* jscpd:ignore-start -- sibling agent packages share this exact error-branch helper */
/** Build one exact error-branch schema while preserving its literal codes. */
function errorSchema<const C extends readonly string[]>(codes: C, extra?: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      code: { type: 'string', required: true, enum: [...codes] },
      ...(extra ?? {}),
    },
  } as const
}
/* jscpd:ignore-end */

const READ_ERROR_SCHEMA = errorSchema(['no-workspace', 'unknown-workspace'])

const UPDATE_ERROR_SCHEMA = errorSchema(
  [
    'no-workspace', 'unknown-workspace', 'unknown-todo', 'revision-conflict',
    'invalid-transition', 'content-blank', 'content-not-single-line', 'content-too-large',
  ],
  {
    currentRevision: { type: 'integer' },
    current: { type: 'string', enum: [...STATUSES] },
    requested: { type: 'string', enum: [...STATUSES] },
  },
)

const TODO_PROPERTIES = {
  todoId: { type: 'string', required: true },
  workspaceId: { type: 'string', required: true },
  revision: { type: 'integer', required: true },
  content: { type: 'string', required: true },
  status: { type: 'string', required: true, enum: [...STATUSES] },
  createdBy: {
    type: 'object',
    required: true,
    additionalProperties: false,
    properties: {
      kind: { type: 'string', required: true, enum: ['user', 'agent'] },
      sessionId: { type: 'string' },
    },
  },
  assignedSessionId: {
    required: true,
    oneOf: [{ type: 'string' }, { type: 'null' }],
  },
  createdAt: { type: 'string', required: true },
  updatedAt: { type: 'string', required: true },
  completedAt: {
    required: true,
    oneOf: [{ type: 'string' }, { type: 'null' }],
  },
} as const

const READ_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: true },
        todos: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: TODO_PROPERTIES,
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: false },
        error: { ...READ_ERROR_SCHEMA, required: true },
      },
    },
  ],
} as const

const UPDATE_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: true },
        todo: { type: 'object', required: true, additionalProperties: false, properties: TODO_PROPERTIES },
        created: { type: 'boolean', required: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: false },
        error: { ...UPDATE_ERROR_SCHEMA, required: true },
      },
    },
  ],
} as const

const READ_DESCRIPTION
  = 'Read the shared todos of the current workspace in committed order: pending, '
    + 'then in_progress, then completed, then cancelled. Each todo carries the '
    + 'revision to pass back as expectedRevision when updating it.'

const UPDATE_DESCRIPTION
  = 'Perform exactly one operation on the current workspace\'s shared todos: '
    + 'create (`content`), edit content (`todoId` + `expectedRevision` + `content`), '
    + 'or change status (`todoId` + `expectedRevision` + `status`). Creating and '
    + 'content edits always require human approval; status changes follow the '
    + 'deployment policy. This tool cannot delete todos or assign them to a '
    + 'session — those stay explicit user actions. Results name the committed '
    + 'revision; after a revision-conflict, re-read and retry.'

/** Failure code a call surfaces when no owning agent session exists. */
function noWorkspace(): { ok: false; error: { code: 'no-workspace' } } {
  return { ok: false, error: { code: 'no-workspace' } }
}

/** Approval reason naming the operation class a `todos_update` call commits. */
function askReason(action: unknown): string {
  if (action === 'create') {
    return 'todos_update creates a shared workspace todo every session in the workspace will see'
  }
  if (action === 'edit-content') {
    return 'todos_update edits a shared workspace todo other sessions may rely on'
  }
  if (action === 'set-status') {
    return 'todos_update changes the status of a shared workspace todo other sessions may rely on'
  }
  return 'todos_update commits a shared workspace todo change'
}

/**
 * Project one domain failure onto the tool-facing shape.
 * @param error - the workspace-todos service failure.
 * @returns the canonical `todos_update` failure value.
 */
function toUpdateFailure(error: SharedTodosFailure): TodosUpdateResult {
  switch (error.code) {
    case 'unknown-workspace': return { ok: false, error: { code: 'unknown-workspace' } }
    case 'unknown-todo': return { ok: false, error: { code: 'unknown-todo' } }
    case 'content-blank': return { ok: false, error: { code: 'content-blank' } }
    case 'content-not-single-line': return { ok: false, error: { code: 'content-not-single-line' } }
    case 'content-too-large': return { ok: false, error: { code: 'content-too-large' } }
    case 'invalid-transition': return {
      ok: false,
      error: { code: 'invalid-transition', current: error.current, requested: error.requested },
    }
    case 'revision-conflict': return error.current === null
      ? { ok: false, error: { code: 'unknown-todo' } }
      : { ok: false, error: { code: 'revision-conflict', currentRevision: error.current.revision } }
  }
}

/**
 * Register `todos_read`, `todos_update`, and the `todos_update` approval gate
 * in one exact agent scope.
 * @param rootCtx - global context carrying the workspace-todos service.
 * @param toolCtx - agent-scoped context receiving the registrations.
 * @param workspaceId - workspace resolved from the owning session.
 * @param statusApproval - whether set-status calls ask a human before committing.
 * @returns the aggregate disposer.
 */
export function registerTodosTools(
  rootCtx: Context,
  toolCtx: Context,
  workspaceId: WorkspaceId,
  statusApproval: TodosStatusApprovalPolicy,
): () => void {
  const disposers: Array<() => void> = []
  try {
    disposers.push(toolCtx.tools.register(defineTool({
      name: 'todos_read',
      description: READ_DESCRIPTION,
      parameters: {},
      output: {
        schema: READ_OUTPUT_SCHEMA,
        render: (_args, value) => [{
          type: 'text',
          text: value.ok
            ? `Read ${value.todos.length} shared todo${value.todos.length === 1 ? '' : 's'}.`
            : `todos_read failed: ${value.error.code}.`,
        }],
      },
      presentCall: () => ({ card: 'generic', title: 'Read shared todos', kind: 'read' }),
      async execute(): Promise<TodosReadResult> {
        const listed = await rootCtx.workspaceTodos.list({ workspaceId })
        if (!listed.ok) return { ok: false, error: { code: 'unknown-workspace' } }
        return { ok: true, todos: [...listed.value.todos] }
      },
    })))

    disposers.push(toolCtx.tools.register(defineTool({
      name: 'todos_update',
      description: UPDATE_DESCRIPTION,
      parameters: {
        action: {
          type: 'string',
          required: true,
          enum: [...ACTIONS],
          description: 'The single operation this call performs.',
        },
        content: {
          type: 'string',
          description: 'Replacement single-line body; required for `create` and `edit-content`.',
        },
        todoId: {
          type: 'string',
          description: 'Target todo; required for `edit-content` and `set-status`.',
        },
        expectedRevision: {
          type: 'number',
          description: 'Revision you last read for `todoId`; required with `todoId`.',
        },
        status: {
          type: 'string',
          enum: [...STATUSES],
          description: 'Requested status; required for `set-status`.',
        },
      },
      output: {
        schema: UPDATE_OUTPUT_SCHEMA,
        render: (args, value) => [{
          type: 'text',
          text: value.ok
            ? args.action === 'create'
              ? `Created shared todo '${value.todo.todoId}' at revision ${value.todo.revision}.`
              : args.action === 'set-status'
                ? `Moved shared todo '${value.todo.todoId}' to '${value.todo.status}' at revision ${value.todo.revision}.`
                : `Updated shared todo '${value.todo.todoId}' at revision ${value.todo.revision}.`
            : `todos_update failed: ${value.error.code}.`,
        }],
      },
      presentCall: (args) => {
        switch (args.action) {
          case 'create': return {
            card: 'generic',
            title: 'Create shared todo',
            kind: 'edit',
            rawInput: args.content,
          }
          case 'edit-content': return {
            card: 'generic',
            title: 'Edit shared todo',
            kind: 'edit',
            rawInput: args.content,
          }
          case 'set-status': return {
            card: 'generic',
            title: 'Change shared todo status',
            kind: 'edit',
            rawInput: args.status,
          }
        }
      },
      async execute(args, exec): Promise<TodosUpdateResult> {
        const owner = exec.agent
        if (owner === undefined) return noWorkspace()
        if (args.todoId !== undefined && args.expectedRevision === undefined) {
          throw new Error('todos_update: `expectedRevision` is required when `todoId` is present')
        }
        if (args.expectedRevision !== undefined && !Number.isSafeInteger(args.expectedRevision)) {
          throw new Error('todos_update: `expectedRevision` must be a safe integer')
        }
        if (args.action === 'create') {
          if (args.content === undefined) {
            throw new Error('todos_update: `content` is required when `action` is "create"')
          }
          const created = await rootCtx.workspaceTodos.create({
            workspaceId,
            content: args.content,
            createdBy: { kind: 'agent', sessionId: owner.id },
          })
          return created.ok
            ? { ok: true, todo: created.value, created: true }
            : toUpdateFailure(created.error)
        }
        if (args.todoId === undefined || args.expectedRevision === undefined) {
          throw new Error(
            `todos_update: \`todoId\` and \`expectedRevision\` are required when \`action\` is "${args.action}"`,
          )
        }
        // Mutations stay inside this workspace: the observed view decides the
        // addressed todo still belongs to it before the compare-and-set runs.
        const listed = await rootCtx.workspaceTodos.list({ workspaceId })
        if (!listed.ok) return { ok: false, error: { code: 'unknown-workspace' } }
        const observed = listed.value.todos.find(todo => todo.todoId === (args.todoId as SharedTodoId))
        if (observed === undefined) return { ok: false, error: { code: 'unknown-todo' } }
        if (observed.revision !== args.expectedRevision) {
          return { ok: false, error: { code: 'revision-conflict', currentRevision: observed.revision } }
        }
        if (args.action === 'edit-content') {
          if (args.content === undefined) {
            throw new Error('todos_update: `content` is required when `action` is "edit-content"')
          }
          const updated = await rootCtx.workspaceTodos.updateContent({
            todoId: observed.todoId,
            expectedRevision: args.expectedRevision,
            content: args.content,
          })
          return updated.ok
            ? { ok: true, todo: updated.value, created: false }
            : toUpdateFailure(updated.error)
        }
        if (args.status === undefined) {
          throw new Error('todos_update: `status` is required when `action` is "set-status"')
        }
        const moved = await rootCtx.workspaceTodos.setStatus({
          todoId: observed.todoId,
          expectedRevision: args.expectedRevision,
          status: args.status,
        })
        return moved.ok
          ? { ok: true, todo: moved.value, created: false }
          : toUpdateFailure(moved.error)
      },
    })))

    // Create and content-edit calls always ask a human before they commit;
    // set-status asks only under the 'ask' policy. Reads and every other tool
    // pass through the waterfall untouched.
    disposers.push(toolCtx.on('tools/pre-execute', (exec, next): Promise<PreToolDecision> => {
      if (exec.name !== 'todos_update') return next()
      const args = exec.arguments as { action?: unknown } | undefined
      const action = typeof args === 'object' && args !== null ? args.action : undefined
      if (action === 'set-status' && statusApproval === 'allow') return next()
      return Promise.resolve({ kind: 'ask', reason: askReason(action) })
    }))

    return () => {
      for (const dispose of disposers.reverse()) dispose()
    }
  } catch (error: unknown) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
}
