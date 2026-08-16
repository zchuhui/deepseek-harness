/** Invariant companion contracts: candidate dispatch, durable prefix, HMR disposal. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import type { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import type { NoteId } from '@deepseek-ai/dsh-workspace-notes/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import * as NotesAgentInvariant from '../src/invariant.ts'
import type { WorkspaceNotesSnapshotData } from '../src/types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-workspace-notes-agent'

/** One canonical snapshot payload, overridable per violation case. */
function snapshotData(partial: Partial<WorkspaceNotesSnapshotData> = {}): WorkspaceNotesSnapshotData {
  return {
    workspaceId: 'ws-1' as WorkspaceId,
    familyRevision: 3,
    configFingerprint: 'v1:1024:5',
    notes: [{ noteId: 'n1' as NoteId, revision: 2 }],
    text: '<workspace-note id="n1" revision="2">\nbody\n</workspace-note>',
    omitted: 0,
    ...partial,
  }
}

async function mount(sessionFirst = false): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(SessionId('notes-agent-invariant'))
  if (!sessionFirst) {
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(NotesAgentInvariant)
  }
  return { ctx, session }
}

describe('the workspace-notes-agent snapshot invariant companion', () => {
  it('accepts a canonical snapshot and ignores unrelated event types', async () => {
    const { session } = await mount()
    expect(() => {
      session.append('workspace-notes/snapshot', snapshotData(), { ignorable: true })
    }).not.toThrow()
  })

  it('rejects a snapshot without the ignorable envelope', async () => {
    const { session } = await mount()
    expect(() => {
      session.append('workspace-notes/snapshot', snapshotData())
    }).toThrow(expect.objectContaining<Partial<InvariantError>>({
      code: 'INVARIANT',
      packageName: PACKAGE_NAME,
    }))
  })

  it('rejects every structural payload violation', async () => {
    const cases: readonly WorkspaceNotesSnapshotData[] = [
      snapshotData({ workspaceId: '' as WorkspaceId }),
      snapshotData({ familyRevision: -1 }),
      snapshotData({ familyRevision: 1.5 }),
      snapshotData({ configFingerprint: 'x1:1024:5' }),
      snapshotData({
        notes: [{ noteId: 'n1' as NoteId, revision: 2 }, { noteId: 'n1' as NoteId, revision: 2 }],
        text: '<workspace-note id="n1" revision="2">\nbody\n</workspace-note>'
          + '\n\n<workspace-note id="n1" revision="2">\nbody\n</workspace-note>',
      }),
      snapshotData({
        notes: [{ noteId: 'n1' as NoteId, revision: 9 }],
        text: '<workspace-note id="n1" revision="9">\nbody\n</workspace-note>',
      }),
      snapshotData({ text: 'not an encoding of any note' }),
      snapshotData({ omitted: -2 }),
    ]
    for (const data of cases) {
      const { session } = await mount()
      expect(() => {
        session.append('workspace-notes/snapshot', data, { ignorable: true })
      }).toThrow(expect.objectContaining<Partial<InvariantError>>({
        code: 'INVARIANT',
        packageName: PACKAGE_NAME,
      }))
    }
  })

  it('attributes an invalid durable prefix during late loading', async () => {
    const { ctx, session } = await mount(true)
    session.append('workspace-notes/snapshot', snapshotData({ omitted: -1 }), { ignorable: true })
    await ctx.plugin(InvariantRegistry)

    await expect(ctx.plugin(NotesAgentInvariant)).rejects.toMatchObject({
      code: 'INVARIANT',
      packageName: PACKAGE_NAME,
    })
  })

  it('removes its registry contribution when its fiber is disposed (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(NotesAgentInvariant)

    expect(() => {
      ctx.invariants.register(PACKAGE_NAME, () => {})
    }).toThrow(/already registered/u)

    await fiber.dispose()
    await expect(ctx.plugin(NotesAgentInvariant).await()).resolves.toBeDefined()
  })
})
