// @vitest-environment jsdom
/**
 * Four-theme coverage for the todos tab, in two halves. The CSS half reads
 * the component sheet and the ui-theme token sheets from disk: every
 * `var(--dsw-*)` the component references is defined by both the light base
 * palette and the dark palette (`system` resolves onto those two, and
 * glass-obsidian only overrides names the base also defines), and no literal
 * color survives in package CSS. The DOM half renders the pane and cycles
 * the four theme presentations: the markup is identical under each, and a
 * pending editor draft survives every switch because theming repaints
 * variables instead of remounting the workbench.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { WorkspaceTodosManager } from '@deepseek-ai/dsh-workspace-todos/client'
import type { SharedTodo, SharedTodoId } from '@deepseek-ai/dsh-workspace-todos/types'
import { TodosPane, type TodosPaneViewProps } from '../src/client/TodosPane.tsx'
import { WorkspaceTodosActions } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const WS = 'ws-1' as WorkspaceId
const t = makeTranslate(zh, commonZh)

function readSibling(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const componentSheets = ['../src/client/TodosPane.module.css'].map(readSibling)

const designPlatform = readSibling('../../ui-theme/src/styles/design-platform.css')

/**
 * Custom-property names defined across every block one selector owns in a
 * tidy sheet (closing brace on its own line). `body` owns two blocks — the
 * shared static palette plus the light alias layer.
 * @param css - stylesheet text.
 * @param selector - the block's selector, e.g. `body` or
 * `body[data-ds-dark-theme]`.
 * @returns every `--dsw-*` name those blocks assign.
 */
function blockTokens(css: string, selector: string): Set<string> {
  const names = new Set<string>()
  const marker = `${selector} {`
  for (let start = css.indexOf(marker); start >= 0; start = css.indexOf(marker, start + 1)) {
    const end = css.indexOf('\n}', start)
    expect(end, `block for "${selector}" closes`).toBeGreaterThan(start)
    for (const match of css.slice(start, end).matchAll(/^(  )(--dsw-[a-z0-9-]+):/gm)) {
      const name = match[2]
      if (name !== undefined) names.add(name)
    }
  }
  expect(names.size, `selector "${selector}" defines tokens`).toBeGreaterThan(0)
  return names
}

const lightTokens = blockTokens(designPlatform, 'body')
const darkTokens = blockTokens(designPlatform, 'body[data-ds-dark-theme]')

/** Every `--dsw-*` name a sheet references through `var()`. */
const referenced = (sheet: string): string[] =>
  [...sheet.matchAll(/var\((--dsw-[a-z0-9-]+)\)/g)].flatMap(match => (match[1] === undefined ? [] : [match[1]]))

describe('todos tab theme coverage (CSS contract)', () => {
  it('references only tokens both base palettes define', () => {
    // light and dark carry the full alias set; system resolves onto one of
    // them and glass-obsidian overrides a subset of the same names, so
    // presence in both palettes means every theme resolves every reference.
    expect(lightTokens.size).toBeGreaterThan(0)
    expect(darkTokens.size).toBeGreaterThan(0)
    for (const sheet of componentSheets) {
      const names = referenced(sheet)
      expect(names.length, 'each sheet uses semantic tokens').toBeGreaterThan(0)
      for (const name of names) {
        expect(lightTokens.has(name), `${name} defined in the light palette`).toBe(true)
        expect(darkTokens.has(name), `${name} defined in the dark palette`).toBe(true)
      }
    }
  })

  it('keeps no literal color in the component sheet', () => {
    for (const sheet of componentSheets) {
      expect(sheet, 'no hex literals').not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(sheet, 'no rgb()/rgba() literals').not.toMatch(/\brgba?\(/)
      expect(sheet, 'no hsl()/hsla() literals').not.toMatch(/\bhsla?\(/)
    }
  })
})

/** The four theme presentations as ui-layout's presenter writes them. */
const PRESENTATIONS = [
  { name: 'light', theme: 'light', dark: false },
  { name: 'dark', theme: 'dark', dark: true },
  // `system` is a preference, not a DOM state: the presenter writes the
  // OS-resolved palette, so it is covered by the light/dark rows above.
  { name: 'system resolved to dark', theme: 'dark', dark: true },
  { name: 'glass-obsidian', theme: 'glass-obsidian', dark: true },
] as const

function present(p: (typeof PRESENTATIONS)[number]): void {
  document.body.setAttribute('data-dsw-theme', p.theme)
  if (p.dark) document.body.setAttribute('data-ds-dark-theme', '')
  else document.body.removeAttribute('data-ds-dark-theme')
}

describe('todos tab theme coverage (DOM invariance)', () => {
  it('renders identical markup under every theme and keeps the draft across switches', async () => {
    const seeded: SharedTodo = {
      todoId: 'td-1' as SharedTodoId,
      workspaceId: WS,
      revision: 1,
      content: 'first todo',
      status: 'pending',
      createdBy: { kind: 'user' },
      assignedSessionId: null,
      createdAt: '2026-08-15T10:00:00.000Z',
      updatedAt: '2026-08-15T10:00:00.000Z',
      completedAt: null,
    }
    const carried = { ok: true as const, value: { ok: true as const, value: { todos: [seeded] } } }
    const remote = {
      list: () => Promise.resolve(carried),
      create: () => Promise.resolve(carried),
      updateContent: () => Promise.resolve(carried),
      setStatus: () => Promise.resolve(carried),
      assign: () => Promise.resolve(carried),
      delete: () => Promise.resolve(carried),
    }
    const manager = new WorkspaceTodosManager(remote, WS)
    const props = {
      workspaceId: WS,
      managerFor: () => manager,
      actions: new WorkspaceTodosActions(remote as never),
      useWorkspaces: (select: (state: unknown) => unknown) => select({ items: [] }),
      useSessions: (select: (state: unknown) => unknown) => select({ byId: {} }),
      t,
    } as unknown as TodosPaneViewProps

    const { container } = render(<TodosPane {...props} />)
    await act(async () => { await manager.refresh() })
    fireEvent.click(screen.getByRole('button', { name: zh['action.create'] }))
    const editor = screen.getByLabelText(zh['editor.createTitle']) as HTMLInputElement
    fireEvent.change(editor, { target: { value: 'unsaved draft' } })

    const baseline = container.innerHTML
    for (const presentation of PRESENTATIONS) {
      present(presentation)
      expect(container.innerHTML, `${presentation.name} renders the same markup`).toBe(baseline)
      expect(screen.getByLabelText(zh['editor.createTitle']), `${presentation.name} keeps the editor mounted`).toBe(editor)
      expect(editor.value, `${presentation.name} keeps the draft`).toBe('unsaved draft')
    }
  })
})
