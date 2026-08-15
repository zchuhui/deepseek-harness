import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import DesktopShellHost from '../src/index.ts'

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

describe('desktop-shell through a real Loader composition', () => {
  it('registers ctx.desktopHost from a Cordis row and fails loud without the bridge env', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-host-desktop-shell-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, "- name: '@deepseek-ai/dsh-host-desktop-shell'\n")

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier === '@deepseek-ai/dsh-host-desktop-shell') return DesktopShellHost
        throw new Error('unexpected Loader import: ' + specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    const ctx = context
    await expect(() => ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })).rejects.toThrow('requires the desktop bridge environment')
  })

  it('reports a window when the bridge environment is present', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    let captured: { label: string; sessionId: string | null } | undefined
    vi.stubGlobal('fetch', (async (_input: string | URL | Request, init?: RequestInit) => {
      captured = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { label: string; sessionId: string | null }
      return new Response(JSON.stringify({}), { status: 200 })
    }))

    root = await mkdtemp(join(tmpdir(), 'dsh-host-desktop-shell-loader-ok-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, "- name: '@deepseek-ai/dsh-host-desktop-shell'\n")

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier === '@deepseek-ai/dsh-host-desktop-shell') return DesktopShellHost
        throw new Error('unexpected Loader import: ' + specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    await context.desktopHost.reportWindow('win-2', 'sess-1')
    expect(captured).toEqual({ label: 'win-2', sessionId: 'sess-1' })
  })
})
