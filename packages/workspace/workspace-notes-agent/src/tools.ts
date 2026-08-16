/**
 * Agent-scoped `notes_read` and `notes_write` tools over the workspace-notes
 * service. The owning workspace is fixed at registration; model arguments
 * never choose one.
 * @module @deepseek-ai/dsh-workspace-notes-agent/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
// Type-only: brings the `ctx.workspaceNotes` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-workspace-notes'
import type { NoteId, WorkspaceNote, WorkspaceNotesFailure } from '@deepseek-ai/dsh-workspace-notes/types'
import type { NotesReadResult, NotesWriteResult, WorkspaceNotesToolNote } from './types.ts'
import { selectAgentVisibleNotes, WorkspaceNoteTooLargeError, type NotesRenderConfig } from './render.ts'

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

const READ_ERROR_SCHEMA = errorSchema(['no-workspace', 'unknown-workspace', 'content-too-large'])

const WRITE_ERROR_SCHEMA = errorSchema(
  ['no-workspace', 'unknown-workspace', 'unknown-note', 'not-agent-visible', 'revision-conflict', 'content-blank', 'content-too-large'],
  { currentRevision: { type: 'integer' } },
)

const NOTE_PROPERTIES = {
  noteId: { type: 'string', required: true },
  revision: { type: 'integer', required: true },
  agentVisible: { type: 'boolean', required: true },
  updatedAt: { type: 'string', required: true },
} as const

const READ_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: true },
        notes: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              noteId: { type: 'string', required: true },
              revision: { type: 'integer', required: true },
              content: { type: 'string', required: true },
              updatedAt: { type: 'string', required: true },
            },
          },
        },
        omitted: { type: 'integer', required: true },
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

const WRITE_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: true },
        note: { type: 'object', required: true, additionalProperties: false, properties: NOTE_PROPERTIES },
        created: { type: 'boolean', required: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true, const: false },
        error: { ...WRITE_ERROR_SCHEMA, required: true },
      },
    },
  ],
} as const

const READ_DESCRIPTION
  = 'Read the agent-visible project-memory notes of the current workspace, newest first. '
    + 'Returns each note with its committed revision. Older notes may be omitted by the '
    + 'configured render limits; the omitted count says how many.'

const WRITE_DESCRIPTION
  = 'Create or edit one agent-visible project-memory note of the current workspace. '
    + 'Omit `noteId` to create; pass `noteId` with the `expectedRevision` you read to edit. '
    + 'Every call requires human approval before it commits. Use notes for durable facts the '
    + 'whole workspace should keep (conventions, decisions, gotchas); keep session-specific '
    + 'plans in your own todo list instead.'

/** Failure code a write call surfaces when no owning agent session exists. */
function noWorkspace(): { ok: false; error: { code: 'no-workspace' } } {
  return { ok: false, error: { code: 'no-workspace' } }
}

/** Project one committed domain note onto the tool-facing shape. */
function toToolNote(note: WorkspaceNote): WorkspaceNotesToolNote {
  return {
    noteId: note.noteId,
    revision: note.revision,
    agentVisible: note.agentVisible,
    updatedAt: note.updatedAt,
  }
}

/**
 * Register `notes_read`, `notes_write`, and the `notes_write` approval gate
 * in one exact agent scope.
 * @param rootCtx - global context carrying the workspace-notes service.
 * @param toolCtx - agent-scoped context receiving the registrations.
 * @param workspaceId - workspace resolved from the owning session.
 * @param limits - render caps shared with the snapshot flow.
 * @returns the aggregate disposer.
 */
export function registerNotesTools(
  rootCtx: Context,
  toolCtx: Context,
  workspaceId: WorkspaceId,
  limits: NotesRenderConfig,
): () => void {
  const disposers: Array<() => void> = []
  try {
    disposers.push(toolCtx.tools.register(defineTool({
      name: 'notes_read',
      description: READ_DESCRIPTION,
      parameters: {},
      output: {
        schema: READ_OUTPUT_SCHEMA,
        render: (_args, value) => [{
          type: 'text',
          text: value.ok
            ? `Read ${value.notes.length} agent-visible note${value.notes.length === 1 ? '' : 's'}`
              + `${value.omitted > 0 ? ` (${value.omitted} older omitted)` : ''}.`
            : `notes_read failed: ${value.error.code}.`,
        }],
      },
      presentCall: () => ({ card: 'generic', title: 'Read workspace notes', kind: 'read' }),
      async execute(): Promise<NotesReadResult> {
        const listed = await rootCtx.workspaceNotes.list({ workspaceId })
        if (!listed.ok) return { ok: false, error: { code: 'unknown-workspace' } }
        try {
          const selection = selectAgentVisibleNotes(listed.value.notes, limits)
          return {
            ok: true,
            notes: selection.notes.map(note => ({
              noteId: note.noteId,
              revision: note.revision,
              content: note.content,
              updatedAt: note.updatedAt,
            })),
            omitted: selection.omitted,
          }
        } catch (error: unknown) {
          if (error instanceof WorkspaceNoteTooLargeError) {
            return { ok: false, error: { code: 'content-too-large' } }
          }
          throw error
        }
      },
    })))

    disposers.push(toolCtx.tools.register(defineTool({
      name: 'notes_write',
      description: WRITE_DESCRIPTION,
      parameters: {
        content: {
          type: 'string',
          required: true,
          description: 'Replacement Markdown body for the note.',
        },
        noteId: {
          type: 'string',
          description: 'Note to edit; omit to create a new agent-visible note.',
        },
        expectedRevision: {
          type: 'number',
          description: 'Revision you last read for `noteId`; required with `noteId`.',
        },
      },
      output: {
        schema: WRITE_OUTPUT_SCHEMA,
        render: (_args, value) => [{
          type: 'text',
          text: value.ok
            ? `${value.created ? 'Created' : 'Updated'} workspace note '${value.note.noteId}' at revision ${value.note.revision}.`
            : `notes_write failed: ${value.error.code}.`,
        }],
      },
      presentCall: args => ({
        card: 'generic',
        title: args.noteId === undefined ? 'Create workspace note' : 'Edit workspace note',
        kind: 'edit',
        rawInput: args.content,
      }),
      async execute(args, exec): Promise<NotesWriteResult> {
        const owner = exec.agent
        if (owner === undefined) return noWorkspace()
        if (args.noteId !== undefined && args.expectedRevision === undefined) {
          throw new Error('notes_write: `expectedRevision` is required when `noteId` is present')
        }
        if (args.expectedRevision !== undefined && !Number.isSafeInteger(args.expectedRevision)) {
          throw new Error('notes_write: `expectedRevision` must be a safe integer')
        }
        const failure = (error: WorkspaceNotesFailure): NotesWriteResult => {
          switch (error.code) {
            case 'unknown-workspace': return { ok: false, error: { code: 'unknown-workspace' } }
            case 'content-blank': return { ok: false, error: { code: 'content-blank' } }
            case 'content-too-large': return { ok: false, error: { code: 'content-too-large' } }
            case 'unknown-note': return { ok: false, error: { code: 'unknown-note' } }
            case 'revision-conflict': return error.current === null
              ? { ok: false, error: { code: 'unknown-note' } }
              : { ok: false, error: { code: 'revision-conflict', currentRevision: error.current.revision } }
          }
        }
        if (args.noteId === undefined) {
          const created = await rootCtx.workspaceNotes.create({
            workspaceId,
            content: args.content,
            agentVisible: true,
            source: { kind: 'agent', sessionId: owner.id },
          })
          return created.ok
            ? { ok: true, note: toToolNote(created.value), created: true }
            : failure(created.error)
        }
        // Edits stay inside this workspace and on agent-visible notes; the
        // observed view decides both before the compare-and-set runs.
        const listed = await rootCtx.workspaceNotes.list({ workspaceId })
        if (!listed.ok) return { ok: false, error: { code: 'unknown-workspace' } }
        const observed = listed.value.notes.find(note => note.noteId === (args.noteId as NoteId))
        if (observed === undefined) return { ok: false, error: { code: 'unknown-note' } }
        if (!observed.agentVisible) return { ok: false, error: { code: 'not-agent-visible' } }
        if (observed.revision !== args.expectedRevision) {
          return { ok: false, error: { code: 'revision-conflict', currentRevision: observed.revision } }
        }
        const updated = await rootCtx.workspaceNotes.update({
          noteId: observed.noteId,
          expectedRevision: args.expectedRevision,
          content: args.content,
        })
        return updated.ok
          ? { ok: true, note: toToolNote(updated.value), created: false }
          : failure(updated.error)
      },
    })))

    // Every write asks a human before it commits; reads and every other tool
    // pass through the waterfall untouched.
    disposers.push(toolCtx.on('tools/pre-execute', (exec, next): Promise<PreToolDecision> => {
      if (exec.name !== 'notes_write') return next()
      return Promise.resolve({
        kind: 'ask',
        reason: 'notes_write commits a shared workspace note that becomes part of every session\'s project memory',
      })
    }))

    return () => {
      for (const dispose of disposers.reverse()) dispose()
    }
  } catch (error: unknown) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
}
