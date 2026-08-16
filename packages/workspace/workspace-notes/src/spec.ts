/**
 * Durable storage-domain declaration for workspace-scoped notes.
 * @module @deepseek-ai/dsh-workspace-notes/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { NoteId, WorkspaceNote, WorkspaceNoteSource } from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveRevision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for one opaque note identity stored as the record key. */
export const noteIdSchema = z.string().min(1).transform(value => value as NoteId)

/** Runtime schema for one opaque workspace identity stored on a record. */
export const workspaceIdSchema = z.string().min(1).transform(value => value as WorkspaceId)

/** Runtime schema for the closed creation-provenance discriminant. */
// Zod infers transformed branded fields structurally, so it cannot name the
// public union even though every branded output is created below.
export const workspaceNoteSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }),
  z.object({
    kind: z.literal('message'),
    sessionId: z.string().min(1).transform(value => value as SessionId),
    sourceEventSeq: positiveRevision,
  }),
  z.object({
    kind: z.literal('agent'),
    sessionId: z.string().min(1).transform(value => value as SessionId),
  }),
]) as unknown as z.ZodType<WorkspaceNoteSource>

/** Runtime schema for one current note record. */
export const workspaceNoteSchema = z.object({
  noteId: noteIdSchema,
  workspaceId: workspaceIdSchema,
  revision: positiveRevision,
  content: z.string().min(1),
  agentVisible: z.boolean(),
  source: workspaceNoteSourceSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).refine(note => note.updatedAt >= note.createdAt, {
  path: ['updatedAt'],
  message: 'workspace note updatedAt must not precede createdAt',
}) as unknown as z.ZodType<WorkspaceNote>

/** Persisted row of the `cleanupQueue` table: one workspace awaiting record deletion. */
export interface WorkspaceNotesCleanupRow {
  /** Host-assigned enqueue time in Unix epoch milliseconds. */
  readonly queuedAt: number
}

/** Runtime schema for one cleanup-queue row. */
export const workspaceNotesCleanupRowSchema = z.object({
  queuedAt: nonNegativeSafeInteger,
})

/**
 * Per-workspace monotone artifact-family revision counters, advanced after
 * every committed change and completed cleanup so push frames can order
 * invalidations.
 */
export interface WorkspaceNotesRevisions {
  readonly revisions: Readonly<Record<string, number>>
}

/** Runtime schema for the domain global. */
export const workspaceNotesRevisionsSchema = z.object({
  revisions: z.record(z.string(), positiveRevision),
})

/** The one workspace-notes domain: notes by id, cleanup queue by workspace id. */
export const workspaceNotesDomainSpec = defineDomain({
  name: 'workspace_notes',
  version: 0,
  global: {
    schema: workspaceNotesRevisionsSchema,
    initial: { revisions: {} } satisfies WorkspaceNotesRevisions,
  },
  tables: {
    notes: domainTable<NoteId, WorkspaceNote>(workspaceNoteSchema),
    cleanup_queue: domainTable<WorkspaceId, WorkspaceNotesCleanupRow>(workspaceNotesCleanupRowSchema),
  },
})
