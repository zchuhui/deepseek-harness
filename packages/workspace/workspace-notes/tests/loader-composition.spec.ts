import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import WorkspaceNotesService from '../src/index.ts'

let root: string | undefined
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadComposition(configPath: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root as string).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-persistence-jsonl', JsonlSessionPersistence],
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-workspace', WorkspaceRegistry],
    ['@deepseek-ai/dsh-workspace-notes', WorkspaceNotesService],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  return ctx
}

describe('workspace notes through a real Loader composition', () => {
  it('persists a committed note across a cold restart and cleans up on workspace deletion', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-workspace-notes-loader-'))
    const workspaceDir = await mkdtemp(join(root, 'workspace-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-session-persistence-jsonl'",
      '  config:',
      `    root: ${JSON.stringify(join(root, 'sessions'))}`,
      '    compression: none',
      '    writeBatchMaxDelayMs: 1',
      "- name: '@deepseek-ai/dsh-storage'",
      "- name: '@deepseek-ai/dsh-storage-json'",
      '  config:',
      `    root: ${JSON.stringify(join(root, 'storage'))}`,
      "- name: '@deepseek-ai/dsh-storage-domain'",
      '  config:',
      '    backend: json',
      "- name: '@deepseek-ai/dsh-workspace'",
      "- name: '@deepseek-ai/dsh-workspace-notes'",
      '  config:',
      '    maxContentBytes: 32',
      '',
    ].join('\n'))

    const first = await loadComposition(configPath)
    expect(first.workspaceNotes.typertRemote.namespace).toBe('workspaceNotes')
    expect(remoteMethods(first.workspaceNotes).map(marker => marker.method))
      .toEqual(['list', 'create', 'update', 'delete'])

    const workspace = await first.workspaceRegistry.create(workspaceDir, 'loader')
    const workspaceId = workspace.id
    const created = await first.workspaceNotes.create({
      workspaceId,
      content: 'survives restart',
      agentVisible: false,
      source: { kind: 'manual' },
    })
    if (!created.ok) throw new Error(`expected create success, got ${created.error.code}`)

    await first.fiber.dispose()
    contexts.splice(contexts.indexOf(first), 1)

    const second = await loadComposition(configPath)
    await expect(second.workspaceNotes.list({ workspaceId })).resolves.toEqual({
      ok: true,
      value: { notes: [created.value], familyRevision: 1 },
    })

    // The queued cleanup emits one `workspace-notes/changed` after the notes
    // are durably deleted, so that event is the completion evidence.
    const cleanupSettled = new Promise<void>((resolve) => {
      second.on('workspace-notes/changed', (change) => {
        if (change.workspaceId === workspaceId) resolve()
      })
    })
    await second.workspaceRegistry.delete(workspaceId)
    await cleanupSettled
    await expect(second.workspaceNotes.list({ workspaceId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'unknown-workspace' },
    })
  })
})
