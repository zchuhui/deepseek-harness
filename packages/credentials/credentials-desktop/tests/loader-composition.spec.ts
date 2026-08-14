import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { credentialRef as credentialRefOf } from '@deepseek-ai/dsh-credentials'
import DesktopCredentials from '../src/index.ts'

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

describe('credentials-desktop through a real Loader composition', () => {
  it('boots from a Cordis row and stores a credential through the bridge', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    let posted = false
    vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') posted = true
      return new Response(JSON.stringify({ stored: true }), { status: 200 })
    })

    root = await mkdtemp(join(tmpdir(), 'dsh-credentials-desktop-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, "- name: '@deepseek-ai/dsh-credentials-desktop'\n")

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier === '@deepseek-ai/dsh-credentials-desktop') return DesktopCredentials
        throw new Error('unexpected Loader import: ' + specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    expect(context.credentials).toBeInstanceOf(DesktopCredentials)
    await context.credentials.set(credentialRefOf('LOADER_KEY'), 'value')
    expect(posted).toBe(true)
  })
})
