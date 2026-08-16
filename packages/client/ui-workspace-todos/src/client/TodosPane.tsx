/**
 * The todos workbench tab pane: create, single-line content edit, validated
 * status transitions, assignment to a workspace session, delete-with-confirm,
 * and conflict recovery over one workspace's todos read model. Root-scope —
 * no session is assumed; without a selected workspace the pane renders its
 * unavailable state. Mutations ride the injected verbs; the committed
 * `workspace-todos/changed` frame (plus the post-mutation refresh) repaints
 * the list.
 * @module @deepseek-ai/dsh-client-ui-workspace-todos/client/TodosPane
 */

import { useCallback, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SharedTodo, SharedTodoStatus } from '@deepseek-ai/dsh-workspace-todos/types'
import type { TodosDeleteOutcome, TodosSetStatusOutcome, TodosUpdateContentOutcome } from './controller.ts'
import type { AssignmentIntent } from './assignment.ts'
import type { TodosPaneProps } from './slots.ts'
import css from './TodosPane.module.css'

/** Full props composed by reference from the contract (owner + inject + locale). */
export type TodosPaneViewProps = TodosPaneProps

/** One settled mutation outcome: success, or a failure code to localize. */
type MutationResult = { ok: true } | { ok: false; code: string }

/** Allowed status moves out of each status (the domain's transition table). */
const TRANSITIONS: Record<SharedTodoStatus, readonly SharedTodoStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['pending', 'completed', 'cancelled'],
  completed: ['pending'],
  cancelled: ['pending'],
}

/** Locale key of one status's own label. */
function statusKey(status: SharedTodoStatus): 'status.pending' | 'status.in_progress' | 'status.completed' | 'status.cancelled' {
  switch (status) {
    case 'pending': return 'status.pending'
    case 'in_progress': return 'status.in_progress'
    case 'completed': return 'status.completed'
    case 'cancelled': return 'status.cancelled'
  }
}

/** Locale key of one transition's commit button. */
function transitionKey(to: SharedTodoStatus): 'action.start' | 'action.complete' | 'action.reopen' | 'action.cancelTodo' {
  switch (to) {
    case 'in_progress': return 'action.start'
    case 'completed': return 'action.complete'
    case 'pending': return 'action.reopen'
    case 'cancelled': return 'action.cancelTodo'
  }
}

/** Deterministic ISO-8601 → "YYYY-MM-DD HH:mm" display (no locale dependency). */
function formatStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/** Localize one business/transport failure code onto this pane's copy. */
function failureText(code: string, t: TodosPaneProps['t']): string {
  switch (code) {
    case 'transport': return t('error.transport')
    case 'content-blank': return t('error.contentBlank')
    case 'content-not-single-line': return t('error.contentNotSingleLine')
    case 'content-too-large': return t('error.contentTooLarge')
    case 'unknown-workspace': return t('error.unknownWorkspace')
    case 'unknown-todo': return t('error.unknownTodo')
    case 'revision-conflict': return t('error.conflict')
    case 'invalid-transition': return t('error.invalidTransition')
    default: return t('error.generic')
  }
}

/** One workspace session as the assignment selector lists it. */
export interface AssignableSession {
  /** Session id (the assignment address). */
  id: SessionId
  /** Human-facing label from the sessions feed. */
  title: string
}

/** Local edit session: which todo (or a new one) the editor addresses. */
interface DraftState {
  /** Addressed todo; `null` = creating. */
  todo: SharedTodo | null
  /** Editor text (starts from the todo's content when editing). */
  text: string
  /** Revision the editor observed — the compare-and-set operand on save. */
  revision: number
}

/**
 * The todos tab pane.
 * @param props - owner workspace identity plus the injected read model, verbs,
 * session feeds, and copy.
 * @returns the pane body for the active todos tab.
 */
export function TodosPane(props: TodosPaneViewProps) {
  const { workspaceId } = props
  if (workspaceId === undefined) {
    return <div className={css.state}>{props.t('state.unavailable')}</div>
  }
  // Keyed remount per workspace: the inner pane binds one manager's store.
  return <WorkspaceTodos {...props} workspaceId={workspaceId} />
}

/** Per-workspace body: the read model drives the list; local state drives the editor. */
function WorkspaceTodos(
  { workspaceId, managerFor, actions, assignments, useSessions, useWorkspaces, t }: TodosPaneViewProps & { workspaceId: WorkspaceId },
) {
  const manager = managerFor(workspaceId)
  const view = useSyncExternalStore(manager.subscribe, manager.getSnapshot)

  // The assignment entry lists the workspace's own sessions; both feeds are
  // live reads (sessions can join or leave while the tab stays mounted).
  const sessionIds = useWorkspaces(
    list => list.items.find(item => item.workspaceId === workspaceId)?.sessionIds ?? [],
  )
  const assignable = useSessions(
    list => sessionIds.map(id => list.byId[id]).filter((session): session is NonNullable<typeof session> => session !== undefined)
      .map(session => ({ id: session.id, title: session.displayTitle })),
  )

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [assignmentIntent, setAssignmentIntent] = useState<AssignmentIntent | null>(null)

  /** Re-pull the baseline; collapses with the frame-triggered refresh when both run. */
  const refresh = useCallback(() => { void manager.refresh() }, [manager])
  const settle = useCallback((result: MutationResult) => {
    setPending(false)
    setFailure(result.ok ? null : failureText(result.code, t))
  }, [t])

  const openCreate = (): void => {
    setFailure(null)
    setDraft({ todo: null, text: '', revision: 0 })
  }

  const openEdit = (todo: SharedTodo): void => {
    setFailure(null)
    setDraft({ todo, text: todo.content, revision: todo.revision })
  }

  /**
   * Save the editor draft: create while addressing no todo, compare-and-set
   * content edit otherwise. A revision conflict rebases the draft onto the
   * authoritative todo the failure carries, so the retry starts from the
   * latest content (the refreshed list below carries the same revision).
   */
  const saveDraft = async (): Promise<void> => {
    if (draft === null) return
    const text = draft.text.trim()
    if (text === '') return
    setPending(true)
    setFailure(null)
    if (draft.todo === null) {
      const outcome = await actions.create({
        workspaceId,
        content: text,
        createdBy: { kind: 'user' },
      })
      if (outcome.ok) setDraft(null)
      settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    } else {
      const outcome: TodosUpdateContentOutcome = await actions.updateContent({
        todoId: draft.todo.todoId,
        expectedRevision: draft.revision,
        content: text,
      })
      if (outcome.ok) {
        setDraft(null)
      } else if (outcome.error.code === 'revision-conflict' && outcome.error.current !== null) {
        const current = outcome.error.current
        setDraft({ todo: current, text: current.content, revision: current.revision })
      }
      settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    }
    refresh()
  }

  /**
   * Commit one allowed transition. A revision conflict or a rejected
   * transition surfaces its copy; the refreshed list restores the
   * authoritative status either way.
   */
  const moveStatus = async (todo: SharedTodo, status: SharedTodoStatus): Promise<void> => {
    setPending(true)
    setFailure(null)
    const outcome: TodosSetStatusOutcome = await actions.setStatus({
      todoId: todo.todoId,
      expectedRevision: todo.revision,
      status,
    })
    settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    refresh()
  }

  /** Prepare, but do not yet persist, an assignment to a workspace session. */
  const prepareAssignment = (todo: SharedTodo, sessionId: SessionId): void => {
    try {
      setFailure(null)
      setAssignmentIntent(assignments.prepare(todo, sessionId))
    } catch {
      setFailure(t('error.generic'))
    }
  }

  /** Send the exact prepared task, then commit the Host assignment only on acceptance. */
  const sendAssignment = async (intent: AssignmentIntent): Promise<void> => {
    setPending(true)
    setFailure(null)
    try {
      await assignments.send(intent)
      const outcome = await actions.assign({
        todoId: intent.todoId,
        expectedRevision: intent.expectedRevision,
        sessionId: intent.sessionId,
      })
      settle(outcome.ok ? { ok: true } : { ok: false, code: outcome.error.code })
    } catch {
      settle({ ok: false, code: 'transport' })
    } finally {
      // A send action is single-use. Reprepare after a transport or CAS failure
      // so a retry cannot deliver the same task prompt twice.
      setAssignmentIntent(null)
    }
    refresh()
  }

  /** Delete one todo after its inline confirmation. */
  const deleteTodo = async (todo: SharedTodo): Promise<void> => {
    setPending(true)
    setFailure(null)
    const outcome: TodosDeleteOutcome = await actions.delete({
      todoId: todo.todoId,
      expectedRevision: todo.revision,
    })
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
            : view.todos.length === 0 && draft === null
              ? (
                <div className={css.state}>
                  <div>{t('state.empty')}</div>
                  <div className={css.hint}>{t('state.emptyHint')}</div>
                </div>
              )
              : (
                <>
                  {draft !== null && (
                    <TodoEditor
                      draft={draft}
                      pending={pending}
                      onChange={setDraft}
                      onSave={() => { void saveDraft() }}
                      onCancel={() => { setDraft(null); setFailure(null) }}
                      t={t}
                    />
                  )}
                  {view.todos.map(todo => (
                    <TodoCard
                      key={todo.todoId}
                      todo={todo}
                      pending={pending}
                      assignable={assignable}
                      onEdit={() => { openEdit(todo) }}
                      onMove={(status) => { void moveStatus(todo, status) }}
                      assignmentIntent={assignmentIntent?.todoId === todo.todoId ? assignmentIntent : null}
                      onPrepareAssignment={(sessionId) => { prepareAssignment(todo, sessionId) }}
                      onSendAssignment={(intent) => { void sendAssignment(intent) }}
                      onCancelAssignment={() => { setAssignmentIntent(null); setFailure(null) }}
                      onDelete={() => { void deleteTodo(todo) }}
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
interface TodoEditorProps {
  draft: DraftState
  pending: boolean
  onChange: (next: DraftState) => void
  onSave: () => void
  onCancel: () => void
  t: TodosPaneProps['t']
}

/** The create/edit form: single-line input, save/cancel. */
function TodoEditor({ draft, pending, onChange, onSave, onCancel, t }: TodoEditorProps) {
  const label = draft.todo === null ? t('editor.createTitle') : t('editor.editTitle')
  return (
    <section className={css.editor}>
      <input
        type="text"
        className={css.editorInput}
        aria-label={label}
        placeholder={t('editor.placeholder')}
        value={draft.text}
        disabled={pending}
        onChange={(event) => { onChange({ ...draft, text: event.target.value }) }}
      />
      <div className={css.editorRow}>
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

/** Props of one committed todo card. */
interface TodoCardProps {
  todo: SharedTodo
  pending: boolean
  assignable: readonly AssignableSession[]
  onEdit: () => void
  onMove: (status: SharedTodoStatus) => void
  assignmentIntent: AssignmentIntent | null
  onPrepareAssignment: (sessionId: SessionId) => void
  onSendAssignment: (intent: AssignmentIntent) => void
  onCancelAssignment: () => void
  onDelete: () => void
  t: TodosPaneProps['t']
}

/** One committed todo: status glyph, provenance, assignment, content, actions. */
function TodoCard({
  todo, pending, assignable, assignmentIntent, onEdit, onMove, onPrepareAssignment,
  onSendAssignment, onCancelAssignment, onDelete, t,
}: TodoCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [target, setTarget] = useState(() => assignable[0]?.id ?? ('' as SessionId))
  const assignedTitle = assignable.find(session => session.id === todo.assignedSessionId)?.title
    ?? todo.assignedSessionId

  return (
    <section className={css.todo}>
      <div className={css.todoHead}>
        <span className={clsx(css.status, css[`status_${todo.status}`])}>{t(statusKey(todo.status))}</span>
        <span className={css.source}>{todo.createdBy.kind === 'user' ? t('source.user') : t('source.agent')}</span>
        <span className={css.stamp}>{formatStamp(todo.updatedAt)}</span>
        {todo.assignedSessionId !== null && (
          <span className={clsx(css.source, css.assigned)} title={t('assign.assigned')}>
            {`@${assignedTitle}`}
          </span>
        )}
        <button type="button" className={css.chip} disabled={pending} onClick={onEdit}>
          {t('action.edit')}
        </button>
        <button type="button" className={clsx(css.chip, css.chipDanger)} disabled={pending} onClick={() => { setConfirming(true) }}>
          {t('action.delete')}
        </button>
      </div>
      <div className={clsx(css.content, todo.status === 'cancelled' && css.contentCancelled)}>{todo.content}</div>
      <div className={css.row}>
        {TRANSITIONS[todo.status].map(status => (
          <button
            key={status}
            type="button"
            className={clsx(css.chip, status === 'completed' && css.chipSuccess, status === 'cancelled' && css.chipDanger)}
            disabled={pending}
            onClick={() => { onMove(status) }}
          >
            {t(transitionKey(status))}
          </button>
        ))}
        {todo.status === 'pending' && todo.assignedSessionId === null && (
          assignable.length > 0
            ? (
              <span className={css.assign}>
                <label>
                  {t('assign.to')}
                  <select
                    aria-label={t('assign.to')}
                    value={target}
                    disabled={pending}
                    onChange={(event) => { setTarget(event.target.value as SessionId) }}
                  >
                    {assignable.map(session => (
                      <option key={session.id} value={session.id}>{session.title}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={css.chip}
                  disabled={pending || target === ('' as SessionId)}
                  onClick={() => { onPrepareAssignment(target) }}
                >
                  {t('action.assign')}
                </button>
                {assignmentIntent !== null && (
                  <span className={css.assign}>
                    <span className={css.stamp}>{t('assign.prepared')}</span>
                    <button type="button" className={css.chip} disabled={pending} onClick={() => { onSendAssignment(assignmentIntent) }}>
                      {t('action.sendAssignment')}
                    </button>
                    <button type="button" className={css.chip} disabled={pending} onClick={onCancelAssignment}>
                      {t('action.cancelAssignment')}
                    </button>
                  </span>
                )}
              </span>
            )
            : <span className={css.stamp}>{t('assign.noSessions')}</span>
        )}
      </div>
      {confirming && (
        <div className={css.confirm} role="alertdialog" aria-label={t('action.deleteConfirm')}>
          <span>{t('action.deleteConfirm')}</span>
          <button type="button" className={clsx(css.chip, css.chipDanger)} disabled={pending} onClick={onDelete}>
            {t('action.delete')}
          </button>
          <button type="button" className={css.chip} disabled={pending} onClick={() => { setConfirming(false) }}>
            {t('action.cancel')}
          </button>
        </div>
      )}
    </section>
  )
}
