/**
 * Public vocabulary of the workspace-notes agent integration: the
 * `workspace-notes/snapshot` session event and the notes tool result unions.
 * Types only, so generated faces can consume them without Host runtime code.
 * @module @deepseek-ai/dsh-workspace-notes-agent/types
 */

import type { NoteId } from '@deepseek-ai/dsh-workspace-notes/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** One included note as encoded in a snapshot: identity plus committed revision. */
export interface WorkspaceNotesSnapshotNoteRef {
  readonly noteId: NoteId
  /** The note's committed revision at snapshot time; a positive integer. */
  readonly revision: number
}

/**
 * Payload of the log-only `workspace-notes/snapshot` session event.
 *
 * The event is the durable record of the exact agent-visible project-memory
 * view one model request used. It is appended (with the envelope's
 * `ignorable: true`) before a request assembles its project-memory prompt
 * segment, and only when the dedup key — owning workspace, artifact-family
 * revision, and render-config fingerprint — changed since the session's last
 * snapshot; request assembly always builds the segment from the latest
 * snapshot at or before that moment, so replay reads exactly what the request
 * read. Builds without this plugin family skip the event without affecting
 * reconstruction.
 */
export interface WorkspaceNotesSnapshotData {
  /** Workspace whose notes were rendered. */
  readonly workspaceId: WorkspaceId
  /** Artifact-family revision of the notes view at snapshot time. */
  readonly familyRevision: number
  /** Fingerprint of the render-affecting configuration (`v1:…`). */
  readonly configFingerprint: string
  /** Included notes in render order; no duplicates. */
  readonly notes: readonly WorkspaceNotesSnapshotNoteRef[]
  /** Joined note blocks; block headers encode the `notes` sequence exactly. */
  readonly text: string
  /** Older visible notes the deterministic truncation rule omitted. */
  readonly omitted: number
}

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /**
     * Model-visible project-memory snapshot of the session workspace's
     * agent-visible notes. Log-only: it joins no surface and derives no
     * message; the project-memory prompt segment is built from the latest
     * snapshot's payload at request-assembly time. Writers stamp the
     * envelope's `ignorable: true` so builds without this plugin family can
     * load and replay sessions that contain snapshots.
     */
    'workspace-notes/snapshot': WorkspaceNotesSnapshotData
  }
}

/** Business failure codes shared by the notes tools. */
export type WorkspaceNotesToolFailure =
  | { readonly code: 'no-workspace' }
  | { readonly code: 'unknown-workspace' }
  | { readonly code: 'unknown-note' }
  | { readonly code: 'not-agent-visible' }
  | { readonly code: 'revision-conflict'; readonly currentRevision: number }
  | { readonly code: 'content-blank' }
  | { readonly code: 'content-too-large' }

/** Failure codes `notes_read` can surface, matching its output schema. */
export type WorkspaceNotesReadFailure =
  | { readonly code: 'no-workspace' }
  | { readonly code: 'unknown-workspace' }
  | { readonly code: 'content-too-large' }

/** One committed note as returned by the notes tools. */
export interface WorkspaceNotesToolNote {
  readonly noteId: NoteId
  readonly revision: number
  readonly agentVisible: boolean
  readonly updatedAt: string
}

/** Result of `notes_read`: the capped visible view, or a business failure. */
export type NotesReadResult =
  | {
    readonly ok: true
    readonly notes: { noteId: NoteId; revision: number; content: string; updatedAt: string }[]
    readonly omitted: number
  }
  | { readonly ok: false; readonly error: WorkspaceNotesReadFailure }

/** Result of `notes_write`: the committed note, or a business failure. */
export type NotesWriteResult =
  | { readonly ok: true; readonly note: WorkspaceNotesToolNote; readonly created: boolean }
  | { readonly ok: false; readonly error: WorkspaceNotesToolFailure }
