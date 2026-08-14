import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import DesktopNotifications from '../src/index.ts'

let root: string | undefined
let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('notifications-desktop through a real Loader composition', () => {
  it('registers ctx.notifications from a Cordis row and fails loud without the bridge env', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-notifications-desktop-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, "- name: '@deepseek-ai/dsh-notifications-desktop'\n")

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier === '@deepseek-ai/dsh-notifications-desktop') return DesktopNotifications
        throw new Error('unexpected Loader import: ' + specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    const ctx = context
    await expect(() => ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })).rejects.toThrow('requires the desktop bridge environment')
  })

  it('delivers a toast when the bridge environment is present', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    let captured: { title: string; body: string } | undefined
    vi.stubGlobal('fetch', (async (_input: string | URL | Request, init?: RequestInit) => {
      captured = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { title: string; body: string }
      return new Response(JSON.stringify({ shown: true }), { status: 200 })
    }))

    root = await mkdtemp(join(tmpdir(), 'dsh-notifications-desktop-loader-ok-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, "- name: '@deepseek-ai/dsh-notifications-desktop'\n")

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier === '@deepseek-ai/dsh-notifications-desktop') return DesktopNotifications
        throw new Error('unexpected Loader import: ' + specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    await context.notifications.notify({ kind: 'job-settled', title: '后台任务完成', body: 'bash: pnpm test' })
    expect(captured).toEqual({ title: '后台任务完成', body: 'bash: pnpm test' })
  })
})
