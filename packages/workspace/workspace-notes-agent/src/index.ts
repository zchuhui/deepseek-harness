/**
 * Agent-facing workspace-notes integration: per-agent `notes_read` /
 * approval-gated `notes_write` tools, the deduplicated log-only
 * `workspace-notes/snapshot` event, and the scoped project-memory prompt
 * segment built from that event.
 * @module @deepseek-ai/dsh-workspace-notes-agent
 */

import type { Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
// Type-only: brings the `ctx.workspaceNotes` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-workspace-notes'
import { registerNotesTools } from './tools.ts'
import {
  notesConfigFingerprint,
  renderNoteBlocks,
  renderProjectMemorySegment,
  selectAgentVisibleNotes,
  WorkspaceNoteTooLargeError,
  type NotesRenderConfig,
} from './render.ts'
import type { WorkspaceNotesSnapshotData } from './types.ts'

// Projects the SessionEventMap merge onto the package root and keeps the
// module edge in the emitted index.d.ts for aggregate declaration programs.
export type * from './types.ts'
export {
  notesConfigFingerprint,
  renderNoteBlocks,
  renderProjectMemorySegment,
  selectAgentVisibleNotes,
  snapshotTextEncodingError,
  WorkspaceNoteTooLargeError,
} from './render.ts'
export type { NotesRenderConfig, NotesSelection } from './render.ts'
export { registerNotesTools } from './tools.ts'

/** Cordis function-plugin name. */
export const name = 'workspace-notes-agent'
/** Services the integration composes over. */
export const inject = ['tools', 'systemPrompt', 'workspaceNotes', 'workspaceRegistry']

/** Deployment policy for the notes agent integration. */
export interface Config extends NotesRenderConfig {}

/** Schemastery configuration for the notes agent integration. */
export const Config: s<Config> = s.object({
  maxRenderBytes: s.number().step(1).min(1).required(),
  maxNotes: s.number().step(1).min(1).required(),
})

/** Prompt-context order of the project-memory segment. */
const PROJECT_MEMORY_ORDER = 40

/**
 * The latest `workspace-notes/snapshot` at or before now — exactly what
 * request assembly reads, so replay rebuilds the segment the request used.
 * @param events - the session's immutable event log snapshot.
 * @returns the latest snapshot event, or `undefined` before the first one.
 */
export function latestNotesSnapshot(
  events: readonly SessionEvent[],
): SessionEvent<'workspace-notes/snapshot'> | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index] as SessionEvent
    if (event.type === 'workspace-notes/snapshot') {
      return event
    }
  }
  return undefined
}

/**
 * Attach the notes integration to one agent whose session a registered
 * workspace accounts for: the project-memory context and the tools with
 * their approval gate. The snapshot append stays in the caller's pre-step
 * listener, which also owns this lazy resolution.
 * @param ctx - global context carrying the workspace-notes service.
 * @param agent - the owning agent.
 * @param workspaceId - workspace resolved from the agent's session.
 * @param config - render caps in force.
 * @returns the integration disposer for the calling effect to nest.
 */
function attachIntegration(ctx: Context, agent: Agent, workspaceId: WorkspaceId, config: Config): () => void {
  const disposeContext = agent.ctx.systemPrompt.context({
    name: 'workspace-notes:project-memory',
    order: PROJECT_MEMORY_ORDER,
    text: (assemble: AssembleContext) => {
      if (assemble.agent !== agent) return ''
      const latest = latestNotesSnapshot(agent.session.events)
      return latest === undefined ? '' : renderProjectMemorySegment(latest.data)
    },
  })
  const disposeTools = registerNotesTools(ctx, agent.ctx, workspaceId, config)
  return () => {
    disposeTools()
    disposeContext()
  }
}

/**
 * Fetch the visible-notes view and append one `workspace-notes/snapshot`
 * when the dedup key — owning workspace, family revision, render-config
 * fingerprint — moved since the session's last snapshot. Appends happen
 * before request assembly, which then builds the project-memory segment from
 * the latest event.
 * @param ctx - global context carrying the workspace-notes service.
 * @param agent - the agent whose session receives the snapshot.
 * @param workspaceId - workspace resolved from the agent's session.
 * @param config - render caps in force.
 */
async function appendSnapshotIfNeeded(
  ctx: Context,
  agent: Agent,
  workspaceId: WorkspaceId,
  config: Config,
): Promise<void> {
  const listed = await ctx.workspaceNotes.list({ workspaceId })
  if (!listed.ok) {
    // Deregistered mid-flight: the durable snapshots already in the log stay
    // authoritative for replay; assembly keeps reading the last one.
    ctx.logger.warn(
      `workspace-notes-agent: skipping snapshot for session '${String(agent.id)}': `
      + `workspace '${String(workspaceId)}' is no longer registered`,
    )
    return
  }
  const fingerprint = notesConfigFingerprint(config)
  const last = latestNotesSnapshot(agent.session.events)
  if (last !== undefined
    && last.data.workspaceId === workspaceId
    && last.data.familyRevision === listed.value.familyRevision
    && last.data.configFingerprint === fingerprint) {
    return
  }
  let selection
  try {
    selection = selectAgentVisibleNotes(listed.value.notes, config)
  } catch (error: unknown) {
    if (error instanceof WorkspaceNoteTooLargeError) {
      // One note can never fit the budget: fail loud out-of-band instead of
      // rejecting the step or silently rendering a different memory view.
      ctx.logger.error(`workspace-notes-agent: ${error.message}`)
      return
    }
    throw error
  }
  const data: WorkspaceNotesSnapshotData = {
    workspaceId,
    familyRevision: listed.value.familyRevision,
    configFingerprint: fingerprint,
    notes: selection.notes.map(note => ({ noteId: note.noteId, revision: note.revision })),
    text: renderNoteBlocks(selection.notes),
    omitted: selection.omitted,
  }
  agent.session.append('workspace-notes/snapshot', data, { ignorable: true })
}

/**
 * Compose the integration onto every future agent. Attachment is resolved
 * lazily at each pre-step: the product create flow announces an agent before
 * its session joins a workspace, so a session may gain (or never gain) a
 * workspace after `agent/created`. Once a registered workspace accounts for
 * the session, the project-memory context, the tools with their approval
 * gate, and the deduplicated snapshot append go live on the agent's scope;
 * sessions without a workspace expose none of them.
 * @param ctx - registrant context.
 * @param config - deployment render caps.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.effect(() => {
      let integration: (() => void) | undefined
      let workspaceId: WorkspaceId | undefined
      const disposePreStep = agent.ctx.on('agent/pre-step', async (_step, next) => {
        if (workspaceId === undefined) {
          const workspace = ctx.workspaceRegistry.resolveBySession(agent.id)
          if (workspace === undefined) return await next()
          workspaceId = workspace.id
          integration = attachIntegration(ctx, agent, workspaceId, config)
        }
        await appendSnapshotIfNeeded(ctx, agent, workspaceId, config)
        return await next()
      })
      return () => {
        integration?.()
        disposePreStep()
      }
    }, 'workspace-notes-agent.attach()')
  })
}
