/**
 * Public request, value, and failure vocabulary for workspace-scoped notes.
 * This module contains types only so generated Remote clients can consume it
 * without importing Host runtime code.
 * @module @deepseek-ai/dsh-workspace-notes/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Opaque identity of one note inside its workspace-notes domain. */
export type NoteId = Branded<'NoteId'>

/**
 * How one note came to exist. The discriminant is closed: `switch` on `kind`
 * and end in `assertNever`-style exhaustiveness.
 */
export type WorkspaceNoteSource =
  | WorkspaceNoteSourceManual
  | WorkspaceNoteSourceMessage
  | WorkspaceNoteSourceAgent

/** Created by hand in the notes workbench tab. */
export interface WorkspaceNoteSourceManual {
  readonly kind: 'manual'
}

/** Copied out of one persisted session message. */
export interface WorkspaceNoteSourceMessage {
  readonly kind: 'message'
  /** Session whose log holds the addressed message. */
  readonly sessionId: SessionId
  /** `seq` of the persisted surface event that carries the addressed message. */
  readonly sourceEventSeq: number
}

/** Written by an Agent through the approved notes_write tool. */
export interface WorkspaceNoteSourceAgent {
  readonly kind: 'agent'
  /** Session whose Agent created this note. */
  readonly sessionId: SessionId
}

/** One committed note and its compare-and-set revision. */
export interface WorkspaceNote {
  /** Stable identity within the workspace-notes domain. */
  readonly noteId: NoteId
  /** Owning registered workspace. */
  readonly workspaceId: WorkspaceId
  /** Positive integer incremented by every material update. */
  readonly revision: number
  /** Markdown body, preserved verbatim after validation. */
  readonly content: string
  /** Whether Agent integrations may read this note. */
  readonly agentVisible: boolean
  /** Immutable creation provenance. */
  readonly source: WorkspaceNoteSource
  /** Host-assigned creation time, ISO-8601 with milliseconds. */
  readonly createdAt: string
  /** Host-assigned time of the most recent material update, ISO-8601 with milliseconds. */
  readonly updatedAt: string
}

/** Read the ordered note view of one registered workspace. */
export interface WorkspaceNotesListRequest {
  /** Workspace whose notes should be read. */
  readonly workspaceId: WorkspaceId
}

/** Ordered note view: `updatedAt` descending, then `noteId` ascending. */
export interface WorkspaceNotesListValue {
  /** Fresh immutable note snapshots. */
  readonly notes: readonly WorkspaceNote[]
  /**
   * Current artifact-family revision of this workspace's notes — the same
   * counter `workspace-notes/changed` frames carry. A caller that recorded it
   * can skip re-deriving its view while a later `list` reports the same
   * number: the family only advances on committed changes.
   */
  readonly familyRevision: number
}

/** Create one note in a registered workspace. */
export interface WorkspaceNotesCreateRequest {
  /** Owning registered workspace. */
  readonly workspaceId: WorkspaceId
  /** Markdown body; non-blank and within the configured byte limit. */
  readonly content: string
  /** Whether Agent integrations may read this note. */
  readonly agentVisible: boolean
  /** Immutable creation provenance. */
  readonly source: WorkspaceNoteSource
}

/** Edit one note's content and/or Agent visibility against an observed revision. */
export interface WorkspaceNotesUpdateRequest {
  /** Target note identity. */
  readonly noteId: NoteId
  /** Revision the caller observed; must equal the stored revision. */
  readonly expectedRevision: number
  /** Replacement Markdown body; omitted keeps the stored content. */
  readonly content?: string
  /** Replacement Agent visibility; omitted keeps the stored value. */
  readonly agentVisible?: boolean
}

/** Delete one note against an observed revision. */
export interface WorkspaceNotesDeleteRequest {
  /** Target note identity. */
  readonly noteId: NoteId
  /** Revision the caller observed; ignored when the note is already absent. */
  readonly expectedRevision: number
}

/** Idempotent deletion acknowledgement. */
export interface WorkspaceNotesDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}

/** The addressed workspace is not registered. */
export interface WorkspaceNotesUnknownWorkspace {
  readonly code: 'unknown-workspace'
  readonly workspaceId: WorkspaceId
}

/** The addressed note does not exist. */
export interface WorkspaceNotesUnknownNote {
  readonly code: 'unknown-note'
  readonly noteId: NoteId
}

/** A material mutation did not match the addressed note's current revision. */
export interface WorkspaceNotesRevisionConflict {
  readonly code: 'revision-conflict'
  /** Authoritative current note, or `null` when it does not exist. */
  readonly current: WorkspaceNote | null
}

/** A supplied content contains no non-whitespace character. */
export interface WorkspaceNotesContentBlank {
  readonly code: 'content-blank'
}

/** A supplied content exceeds the configured UTF-8 byte limit. */
export interface WorkspaceNotesContentTooLarge {
  readonly code: 'content-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}

/** Failures shared by the public workspace-notes operations. */
export type WorkspaceNotesFailure =
  | WorkspaceNotesUnknownWorkspace
  | WorkspaceNotesUnknownNote
  | WorkspaceNotesRevisionConflict
  | WorkspaceNotesContentBlank
  | WorkspaceNotesContentTooLarge

/** Successful public operation result. */
export interface WorkspaceNotesSuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Rejected public operation result with a stable business failure. */
export interface WorkspaceNotesRejected<E extends WorkspaceNotesFailure> {
  readonly ok: false
  readonly error: E
}

/** Result returned by the workspace-notes `list` operation. */
export type WorkspaceNotesListResult =
  | WorkspaceNotesSuccess<WorkspaceNotesListValue>
  | WorkspaceNotesRejected<WorkspaceNotesUnknownWorkspace>

/** Result returned by the workspace-notes `create` operation. */
export type WorkspaceNotesCreateResult =
  | WorkspaceNotesSuccess<WorkspaceNote>
  | WorkspaceNotesRejected<
    | WorkspaceNotesUnknownWorkspace
    | WorkspaceNotesContentBlank
    | WorkspaceNotesContentTooLarge
  >

/** Result returned by the workspace-notes `update` operation. */
export type WorkspaceNotesUpdateResult =
  | WorkspaceNotesSuccess<WorkspaceNote>
  | WorkspaceNotesRejected<
    | WorkspaceNotesUnknownWorkspace
    | WorkspaceNotesUnknownNote
    | WorkspaceNotesRevisionConflict
    | WorkspaceNotesContentBlank
    | WorkspaceNotesContentTooLarge
  >

/** Result returned by the workspace-notes `delete` operation. */
export type WorkspaceNotesDeleteResult =
  | WorkspaceNotesSuccess<WorkspaceNotesDeleteValue>
  | WorkspaceNotesRejected<
    | WorkspaceNotesUnknownWorkspace
    | WorkspaceNotesRevisionConflict
  >

/** One committed change or recovered cleanup of a workspace's notes. */
export interface WorkspaceNotesChanged {
  /** Workspace whose notes view changed. */
  readonly workspaceId: WorkspaceId
  /** New monotone artifact-family revision of that workspace's notes. */
  readonly revision: number
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A workspace's notes view changed after a committed create, update,
     * delete, or completed cleanup recovery. Emitted after the storage domain
     * acknowledges durability and the per-workspace artifact-family revision
     * advances; forwarded to consumers as the push invalidation signal.
     * @param change - owning workspace and its new notes-family revision.
     * @mode emit
     */
    'workspace-notes/changed'(change: WorkspaceNotesChanged): void
  }
}
