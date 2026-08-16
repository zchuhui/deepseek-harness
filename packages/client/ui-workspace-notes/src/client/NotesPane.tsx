/**
 * The notes workbench tab pane: create, edit, visibility, delete-with-confirm,
 * and conflict recovery over one workspace's notes read model. Root-scope —
 * no session is assumed; without a selected workspace the pane renders its
 * unavailable state. Mutations ride the injected verbs; the committed
 * `workspace-notes/changed` frame (plus the post-mutation refresh) repaints
 * the list.
 * @module @deepseek-ai/dsh-client-ui-workspace-notes/client/NotesPane
 */

import { useCallback, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { NoteId, WorkspaceNote } from '@deepseek-ai/dsh-workspace-notes/types'
import type { NotesCreateOutcome, NotesDeleteOutcome, NotesUpdateOutcome } from './controller.ts'
import type { NotesPaneProps } from './slots.ts'
import css from './NotesPane.module.css'

/** Full props composed by reference from the contract (owner + inject + locale). */
export type NotesPaneViewProps = NotesPaneProps

/** One settled mutation outcome: success, or a failure code to localize. */
type MutationResult = { ok: true } | { ok: false; code: string }

/** Local edit session: which note (or a new one) the editor addresses. */
interface DraftState {
  /** Addressed note; `null` = creating. */
  note: WorkspaceNote | null
  /** Editor text (starts from the note's content when editing). */
  text: string
  /** Draft Agent visibility. */
  agentVisible: boolean
  /** Revision the editor observed — the compare-and-set operand on save. */
  revision: number
}

/** Deterministic ISO-8601 → "YYYY-MM-DD HH:mm" display (no locale dependency). */
function formatStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/** Localize one business/transport failure code onto this pane's copy. */
function failureText(code: string, t: NotesPaneProps['t']): string {
  switch (code) {
    case 'transport': return t('error.transport')
    case 'content-blank': return t('error.contentBlank')
    case 'content-too-large': return t('error.contentTooLarge')
    case 'unknown-workspace': return t('error.unknownWorkspace')
    case 'unknown-note': return t('error.unknownNote')
    case 'revision-conflict': return t('error.conflict')
    default: return t('error.generic')
  }
}

/** Source badge copy key for one note's provenance discriminant. */
function sourceKey(note: WorkspaceNote): 'source.manual' | 'source.message' | 'source.agent' {
  switch (note.source.kind) {
    case 'manual': return 'source.manual'
    case 'message': return 'source.message'
    case 'agent': return 'source.agent'
  }
}

/**
 * The notes tab pane.
 * @param props - owner workspace identity plus the injected read model and verbs.
 * @returns the pane body for the active notes tab.
 */
export function NotesPane(props: NotesPaneViewProps) {
  const { workspaceId } = props
  if (workspaceId === undefined) {
    return <div className={css.state}>{props.t('state.unavailable')}</div>
  }
  // Keyed remount per workspace: the inner pane binds one manager's store.
  return <WorkspaceNotes {...props} workspaceId={workspaceId} />
}

/** Per-workspace body: the read model drives the list; local state drives the editor. */
function WorkspaceNotes({ workspaceId, managerFor, actions, t }: NotesPaneViewProps & { workspaceId: WorkspaceId }) {
  const manager = managerFor(workspaceId)
  const view = useSyncExternalStore(manager.subscribe, manager.getSnapshot)

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<NoteId | null>(null)

  /** Re-pull the baseline; collapses with the frame-triggered refresh when both run. */
  const refresh = useCallback(() => { void manager.refresh() }, [manager])
  const settle = useCallback((result: MutationResult) => {
    setPending(false)
    setFailure(result.ok ? null : failureText(result.code, t))
  }, [t])

  const openCreate = (): void => {
    setConfirming(null)
    setFailure(null)
    setDraft({ note: null, text: '', agentVisible: false, revision: 0 })
  }

  const openEdit = (note: WorkspaceNote): void => {
    setConfirming(null)
    setFailure(null)
    setDraft({ note, text: note.content, agentVisible: note.agentVisible, revision: note.revision })
  }

  /**
   * Save the editor draft: create while addressing no note, compare-and-set
   * update otherwise. A revision conflict rebases the draft onto the
   * authoritative note the failure carries, so the retry starts from the
   * latest content (the refreshed list below carries the same revision).
   */
  const saveDraft = async (): Promise<void> => {
    if (draft === null) return
    const text = draft.text.trim()
    if (text === '') return
    setPending(true)
    setFailure(null)
    if (draft.note === null) {
      const outcome: NotesCreateOutcome = await actions.create({
        workspaceId,
        content: text,
        agentVisible: draft.agentVisible,
        source: { kind: 'manual' },
      })
      if (outcome.ok) setDraft(null)
      settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    } else {
      const outcome: NotesUpdateOutcome = await actions.update({
        noteId: draft.note.noteId,
        expectedRevision: draft.revision,
        content: text,
        agentVisible: draft.agentVisible,
      })
      if (outcome.ok) {
        setDraft(null)
      } else if (outcome.error.code === 'revision-conflict' && outcome.error.current !== null) {
        const current = outcome.error.current
        setDraft({ note: current, text: current.content, agentVisible: current.agentVisible, revision: current.revision })
      }
      settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    }
    refresh()
  }

  /** Toggle one note's Agent visibility without touching its content. */
  const toggleVisibility = async (note: WorkspaceNote): Promise<void> => {
    setPending(true)
    setFailure(null)
    const outcome: NotesUpdateOutcome = await actions.update({
      noteId: note.noteId,
      expectedRevision: note.revision,
      agentVisible: !note.agentVisible,
    })
    settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    refresh()
  }

  /** Delete one note after its inline confirmation. */
  const deleteNote = async (note: WorkspaceNote): Promise<void> => {
    setPending(true)
    setFailure(null)
    const outcome: NotesDeleteOutcome = await actions.delete({
      noteId: note.noteId,
      expectedRevision: note.revision,
    })
    if (outcome.ok) setConfirming(null)
    settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    refresh()
  }

  return (
    <div className={css.root}>
      <div className={css.toolbar}>
        <button type="button" className={css.primary} onClick={openCreate}>
          {t('action.create')}
        </button>
        <button
          type="button"
          className={css.ghost}
          disabled={view.status === 'loading'}
          onClick={refresh}
        >
          {t('action.refresh')}
        </button>
        {view.stale && view.status === 'ready' && <span className={css.stale}>{t('state.stale')}</span>}
      </div>
      {failure !== null && <div className={css.failure} role="alert">{failure}</div>}
      <div className={css.body}>
        {view.status === 'error'
          ? (
            <div className={css.state}>
              {t('state.error')}
              <button type="button" className={css.ghost} onClick={refresh}>
                {t('state.retry')}
              </button>
            </div>
          )
          : view.status !== 'ready'
            ? <div className={css.state}>{t('state.loading')}</div>
            : view.notes.length === 0 && draft === null
              ? (
                <div className={css.state}>
                  <div>{t('state.empty')}</div>
                  <div className={css.hint}>{t('state.emptyHint')}</div>
                </div>
              )
              : (
                <>
                  {draft !== null && (
                    <NoteEditor
                      draft={draft}
                      pending={pending}
                      onChange={setDraft}
                      onSave={() => { void saveDraft() }}
                      onCancel={() => { setDraft(null); setFailure(null) }}
                      t={t}
                    />
                  )}
                  {view.notes.map(note => (
                    <NoteCard
                      key={note.noteId}
                      note={note}
                      pending={pending}
                      confirming={confirming === note.noteId}
                      onEdit={() => { openEdit(note) }}
                      onToggle={() => { void toggleVisibility(note) }}
                      onAskDelete={() => { setConfirming(note.noteId); setFailure(null) }}
                      onCancelDelete={() => { setConfirming(null) }}
                      onDelete={() => { void deleteNote(note) }}
                      t={t}
                    />
                  ))}
                </>
              )}
      </div>
    </div>
  )
}

/** Props of the create/edit editor block. */
interface NoteEditorProps {
  draft: DraftState
  pending: boolean
  onChange: (next: DraftState) => void
  onSave: () => void
  onCancel: () => void
  t: NotesPaneProps['t']
}

/** The create/edit form: textarea, visibility checkbox, save/cancel. */
function NoteEditor({ draft, pending, onChange, onSave, onCancel, t }: NoteEditorProps) {
  const label = draft.note === null ? t('editor.createTitle') : t('editor.editTitle')
  return (
    <section className={css.editor}>
      <textarea
        className={css.editorInput}
        aria-label={label}
        placeholder={t('editor.placeholder')}
        value={draft.text}
        rows={5}
        disabled={pending}
        onChange={(event) => { onChange({ ...draft, text: event.target.value }) }}
      />
      <div className={css.editorRow}>
        <label className={css.visRow}>
          <input
            type="checkbox"
            checked={draft.agentVisible}
            disabled={pending}
            onChange={(event) => { onChange({ ...draft, agentVisible: event.target.checked }) }}
          />
          {t('editor.agentVisible')}
        </label>
        <button
          type="button"
          className={css.primary}
          disabled={pending || draft.text.trim() === ''}
          onClick={onSave}
        >
          {t('action.save')}
        </button>
        <button type="button" className={css.ghost} disabled={pending} onClick={onCancel}>
          {t('action.cancel')}
        </button>
      </div>
    </section>
  )
}

/** Props of one committed note card. */
interface NoteCardProps {
  note: WorkspaceNote
  pending: boolean
  confirming: boolean
  onEdit: () => void
  onToggle: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  t: NotesPaneProps['t']
}

/** One committed note: provenance, visibility, content, and its actions. */
function NoteCard({ note, pending, confirming, onEdit, onToggle, onAskDelete, onCancelDelete, onDelete, t }: NoteCardProps) {
  const visLabel = note.agentVisible ? t('action.visibilityOn') : t('action.visibilityOff')
  return (
    <section className={css.note}>
      <div className={css.noteHead}>
        <span className={css.source}>{t(sourceKey(note))}</span>
        <span className={css.stamp}>{formatStamp(note.updatedAt)}</span>
        <button
          type="button"
          className={clsx(css.chip, note.agentVisible && css.chipActive)}
          aria-pressed={note.agentVisible}
          title={visLabel}
          aria-label={visLabel}
          disabled={pending}
          onClick={onToggle}
        >
          {t('editor.agentVisible')}
        </button>
        <button type="button" className={css.chip} disabled={pending} onClick={onEdit}>
          {t('action.edit')}
        </button>
        <button type="button" className={clsx(css.chip, css.chipDanger)} disabled={pending} onClick={onAskDelete}>
          {t('action.delete')}
        </button>
      </div>
      <div className={css.content}>{note.content}</div>
      {confirming && (
        <div className={css.confirm} role="alertdialog" aria-label={t('action.deleteConfirm')}>
          <span>{t('action.deleteConfirm')}</span>
          <button type="button" className={clsx(css.chip, css.chipDanger)} disabled={pending} onClick={onDelete}>
            {t('action.delete')}
          </button>
          <button type="button" className={css.chip} disabled={pending} onClick={onCancelDelete}>
            {t('action.cancel')}
          </button>
        </div>
      )}
    </section>
  )
}
