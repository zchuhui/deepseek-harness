/**
 * Plugin-level integration: the two agent-scoped tools and the
 * `todos_update` approval gate over the real storage/domain/registry/todos
 * composition.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  agentFor,
  attachedAgent,
  boundary,
  createUserTodo,
  execute,
  harness,
  moveUserTodo,
} from './helpers.ts'

describe('the workspace-todos agent integration', () => {
  it('commits approved creates and edits with agent provenance', async () => {
    const bench = await harness()
    try {
      bench.ctx.provide('approval', { request: async () => 'allowed-once' } as never)
      const agent = await attachedAgent(bench)
      // A real model call always follows a pre-step; the lazily resolved
      // workspace attaches there, before any tool of this integration runs.
      await boundary(bench.ctx, agent)

      const created = await execute(bench, agent, 'todos_update', { action: 'create', content: 'ship the release' })
      expect(created.isError).toBe(false)
      expect(created.value).toMatchObject({
        ok: true,
        created: true,
        todo: {
          revision: 1,
          content: 'ship the release',
          status: 'pending',
          createdBy: { kind: 'agent', sessionId: agent.id },
          assignedSessionId: null,
          completedAt: null,
        },
      })

      const todoId = (created.value as { todo: { todoId: string } }).todo.todoId
      const updated = await execute(bench, agent, 'todos_update', {
        action: 'edit-content', todoId, expectedRevision: 1, content: 'ship the release, refined',
      })
      expect(updated.value).toMatchObject({
        ok: true,
        created: false,
        todo: { revision: 2, content: 'ship the release, refined' },
      })
    } finally {
      await bench.dispose()
    }
  })

  it('moves status without an approval channel under the allow policy', async () => {
    const bench = await harness({ statusUpdateApproval: 'allow' })
    try {
      const todo = await createUserTodo(bench, 'review the spec')
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)

      const started = await execute(bench, agent, 'todos_update', {
        action: 'set-status', todoId: String(todo.todoId), expectedRevision: 1, status: 'in_progress',
      })
      expect(started.isError).toBe(false)
      expect(started.value).toMatchObject({ ok: true, todo: { revision: 2, status: 'in_progress', completedAt: null } })

      const done = await execute(bench, agent, 'todos_update', {
        action: 'set-status', todoId: String(todo.todoId), expectedRevision: 2, status: 'completed',
      })
      expect(done.value).toMatchObject({ ok: true, todo: { revision: 3, status: 'completed' } })
      expect((done.value as { todo: { completedAt: string | null } }).todo.completedAt).not.toBeNull()
    } finally {
      await bench.dispose()
    }
  })

  it('asks for set-status under the ask policy and denies without an approval channel', async () => {
    const bench = await harness({ statusUpdateApproval: 'ask' })
    try {
      const todo = await createUserTodo(bench, 'review the spec')
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)

      const denied = await execute(bench, agent, 'todos_update', {
        action: 'set-status', todoId: String(todo.todoId), expectedRevision: 1, status: 'in_progress',
      })
      expect(denied.isError).toBe(true)
      const block = denied.content[0]
      expect(block?.type).toBe('text')
      if (block?.type === 'text') expect(block.text).toContain('todos_update changes the status of a shared workspace todo')

      const listed = await bench.ctx.workspaceTodos.list({ workspaceId: bench.workspaceId })
      expect(listed).toMatchObject({ ok: true, value: { todos: [{ revision: 1, status: 'pending' }] } })
    } finally {
      await bench.dispose()
    }
  })

  it('denies create and edit-content without an approval channel even under the allow policy', async () => {
    const bench = await harness({ statusUpdateApproval: 'allow' })
    try {
      const todo = await createUserTodo(bench, 'user-owned')
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)

      const createDenied = await execute(bench, agent, 'todos_update', { action: 'create', content: 'unapproved' })
      expect(createDenied.isError).toBe(true)
      const createBlock = createDenied.content[0]
      if (createBlock?.type === 'text') expect(createBlock.text).toContain('todos_update creates a shared workspace todo')

      const editDenied = await execute(bench, agent, 'todos_update', {
        action: 'edit-content', todoId: String(todo.todoId), expectedRevision: 1, content: 'unapproved',
      })
      expect(editDenied.isError).toBe(true)
      const editBlock = editDenied.content[0]
      if (editBlock?.type === 'text') expect(editBlock.text).toContain('todos_update edits a shared workspace todo')

      const listed = await bench.ctx.workspaceTodos.list({ workspaceId: bench.workspaceId })
      expect(listed).toMatchObject({ ok: true, value: { todos: [{ content: 'user-owned', revision: 1 }] } })
    } finally {
      await bench.dispose()
    }
  })

  it('surfaces the domain failure branches as canonical tool values', async () => {
    const bench = await harness()
    try {
      bench.ctx.provide('approval', { request: async () => 'allowed-once' } as never)
      const todo = await createUserTodo(bench, 'shared todo')
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)

      const unknown = await execute(bench, agent, 'todos_update', {
        action: 'edit-content', todoId: 'missing-todo', expectedRevision: 1, content: 'nope',
      })
      expect(unknown.value).toEqual({ ok: false, error: { code: 'unknown-todo' } })

      const stale = await execute(bench, agent, 'todos_update', {
        action: 'edit-content', todoId: String(todo.todoId), expectedRevision: 99, content: 'nope',
      })
      expect(stale.value).toEqual({ ok: false, error: { code: 'revision-conflict', currentRevision: 1 } })

      const invalid = await execute(bench, agent, 'todos_update', {
        action: 'set-status', todoId: String(todo.todoId), expectedRevision: 1, status: 'completed',
      })
      expect(invalid.value).toEqual({
        ok: false,
        error: { code: 'invalid-transition', current: 'pending', requested: 'completed' },
      })

      const blank = await execute(bench, agent, 'todos_update', { action: 'create', content: '   ' })
      expect(blank.value).toEqual({ ok: false, error: { code: 'content-blank' } })

      const multiline = await execute(bench, agent, 'todos_update', { action: 'create', content: 'two\nlines' })
      expect(multiline.value).toEqual({ ok: false, error: { code: 'content-not-single-line' } })
    } finally {
      await bench.dispose()
    }
  })

  it('reads the committed ordered view', async () => {
    const bench = await harness()
    try {
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)
      const first = await createUserTodo(bench, 'first')
      await new Promise((resolve) => { setTimeout(resolve, 2) })
      const second = await createUserTodo(bench, 'second')
      await new Promise((resolve) => { setTimeout(resolve, 2) })
      const third = await createUserTodo(bench, 'third')
      await new Promise((resolve) => { setTimeout(resolve, 2) })
      const fourth = await createUserTodo(bench, 'fourth')
      expect(first.revision).toBe(1)
      expect(fourth.revision).toBe(1)
      const done = await moveUserTodo(bench, await moveUserTodo(bench, second, 'in_progress'), 'completed')
      expect(done.status).toBe('completed')
      const cancelled = await moveUserTodo(bench, third, 'cancelled')
      expect(cancelled.status).toBe('cancelled')

      const read = await execute(bench, agent, 'todos_read', {})
      expect(read.isError).toBe(false)
      const value = read.value as { ok: true; todos: { content: string; revision: number }[] }
      expect(value.ok).toBe(true)
      expect(value.todos.map(entry => entry.content)).toEqual(['first', 'fourth', 'second', 'third'])
      expect(value.todos.map(entry => entry.revision)).toEqual([1, 1, 3, 2])
    } finally {
      await bench.dispose()
    }
  })

  it('keeps mutations inside the owning workspace', async () => {
    const bench = await harness()
    const dir = await mkdtemp(join(tmpdir(), 'dsh-todos-agent-other-'))
    try {
      const other = await bench.ctx.workspaceRegistry.create(dir, 'harness-other')
      const foreign = await bench.ctx.workspaceTodos.create({
        workspaceId: other.id,
        content: 'other workspace todo',
        createdBy: { kind: 'user' },
      })
      if (!foreign.ok) throw new Error(`expected create success, got ${foreign.error.code}`)

      bench.ctx.provide('approval', { request: async () => 'allowed-once' } as never)
      const agent = await attachedAgent(bench)
      await boundary(bench.ctx, agent)

      const attempted = await execute(bench, agent, 'todos_update', {
        action: 'edit-content',
        todoId: String(foreign.value.todoId),
        expectedRevision: 1,
        content: 'cross-workspace edit',
      })
      expect(attempted.value).toEqual({ ok: false, error: { code: 'unknown-todo' } })

      const relisted = await bench.ctx.workspaceTodos.list({ workspaceId: other.id })
      expect(relisted).toMatchObject({ ok: true, value: { todos: [{ content: 'other workspace todo', revision: 1 }] } })
    } finally {
      await bench.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('attaches nothing to an agent whose session has no workspace', async () => {
    const bench = await harness()
    try {
      const strayDir = await mkdtemp(join(tmpdir(), 'dsh-todos-agent-stray-'))
      try {
        const agent = await agentFor(bench, strayDir)
        await boundary(bench.ctx, agent)

        const read = await execute(bench, agent, 'todos_read', {})
        expect(read.isError).toBe(true)
      } finally {
        await rm(strayDir, { recursive: true, force: true })
      }
    } finally {
      await bench.dispose()
    }
  })
})
