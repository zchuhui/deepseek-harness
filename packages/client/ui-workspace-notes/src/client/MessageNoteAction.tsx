/**
 * The save-message-as-note action inside one finalized assistant message's
 * IconActions row: copies the message text into a fresh private note in the
 * session's workspace, preserving the durable provenance (session id + the
 * persisted source event seq). Messages without text render nothing — a
 * content-blank create can never succeed.
 * @module @deepseek-ai/dsh-client-ui-workspace-notes/client/MessageNoteAction
 */

import { useState } from 'react'
import { IconListPenOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MessageNoteActionProps } from './slots.ts'
import css from './MessageNoteAction.module.css'

/** One save attempt settles into exactly one of these feedback states. */
type SaveState = 'idle' | 'pending' | 'saved'

/**
 * One message's save-as-note control.
 * @param props - the owner's message identity/text, the injected verbs, and copy.
 * @returns the icon button plus inline save feedback, or null for no text.
 */
export function MessageNoteAction({ seq, text, sessionId, useWorkspaces, actions, t }: MessageNoteActionProps) {
  // The workspaces feed carries the session→workspace accounting; the strip's
  // action stays mounted across session switches, so this is a live read.
  const workspaceId = useWorkspaces(
    list => list.items.find(item => item.sessionIds.includes(sessionId))?.workspaceId,
  )
  const [state, setState] = useState<SaveState>('idle')
  const [failure, setFailure] = useState<string | null>(null)

  if (text.trim() === '') return null

  const save = async (): Promise<void> => {
    if (workspaceId === undefined) {
      setFailure(t('msg.noWorkspace'))
      return
    }
    setState('pending')
    setFailure(null)
    const outcome = await actions.create({
      workspaceId,
      content: text,
      agentVisible: false,
      source: { kind: 'message', sessionId, sourceEventSeq: seq },
    })
    if (outcome.ok) setState('saved')
    else {
      setState('idle')
      setFailure(outcome.error.code === 'transport' ? t('error.transport') : t('msg.failed'))
    }
  }

  return (
    <>
      <Tooltip label={t('msg.save')} side="bottom">
        <button
          type="button"
          className={css.action}
          aria-label={t('msg.save')}
          data-active={state === 'saved' || undefined}
          disabled={state !== 'idle'}
          onClick={() => { void save() }}
        >
          <IconListPenOutline16 />
        </button>
      </Tooltip>
      {state === 'saved' && <span className={css.status} role="status">{t('msg.saved')}</span>}
      {failure !== null && <span className={css.status} role="status">{failure}</span>}
    </>
  )
}
