import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import DesktopCredentials, { resolveSpec } from '../src/index.ts'

let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

interface WireEntry { get: number; set: number; del: number; value: string | undefined; failNext?: boolean; refuseStatus?: number }

function stubFetch(wire: WireEntry) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    if (wire.failNext === true) {
      wire.failNext = false
      throw new TypeError('fetch failed')
    }
    const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
    const method = init?.method ?? 'GET'
    if (url.endsWith('/api/desktop/keychain/' + encodeURIComponent('TEST_KEY')) && method === 'GET') {
      wire.get += 1
      if (wire.refuseStatus !== undefined) return new Response(JSON.stringify({ error: 'refused' }), { status: wire.refuseStatus })
      if (wire.value === undefined) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      return new Response(JSON.stringify({ value: wire.value }), { status: 200 })
    }
    if (method === 'POST') {
      wire.set += 1
      return new Response(JSON.stringify({ stored: true }), { status: 200 })
    }
    if (method === 'DELETE') {
      wire.del += 1
      return new Response(JSON.stringify({ deleted: true }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: 'unexpected request' }), { status: 500 })
  })
}

async function harness(): Promise<{ credentials: DesktopCredentials; wire: WireEntry }> {
  vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
  vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
  const wire: WireEntry = { get: 0, set: 0, del: 0, value: undefined }
  vi.stubGlobal('fetch', stubFetch(wire))
  context = new Context()
  await context.plugin(DesktopCredentials)
  return { credentials: context.credentials as DesktopCredentials, wire }
}

const REF = credentialRef('TEST_KEY')

describe('resolveSpec', () => {
  it('reads the shell-exported environment and throws when it is missing', () => {
    expect(resolveSpec({}, { DSH_DESKTOP_BRIDGE_URL: 'u', DSH_DESKTOP_BRIDGE_TOKEN: 't' })).toEqual({ url: 'u', token: 't', timeoutMs: 5000 })
    expect(() => resolveSpec({}, {})).toThrow('requires the desktop bridge environment')
  })
})

describe('DesktopCredentials', () => {
  it('resolves the keychain and reports the keychain source', async () => {
    const { credentials, wire } = await harness()
    wire.value = 'stored-secret'
    expect(await credentials.resolve(REF)).toEqual({ value: 'stored-secret', source: 'keychain' })
    wire.value = undefined
    expect(await credentials.resolve(REF)).toBeUndefined()
    wire.value = ''
    expect(await credentials.resolve(REF)).toBeUndefined()
  })

  it('lets a non-empty environment value shadow the keychain', async () => {
    const { credentials, wire } = await harness()
    wire.value = 'stored-secret'
    vi.stubEnv('TEST_KEY', 'env-secret')
    expect(await credentials.resolve(REF)).toEqual({ value: 'env-secret', source: 'env' })
    expect(wire.get).toBe(0)
  })

  it('treats an empty environment value as absent and falls through', async () => {
    const { credentials, wire } = await harness()
    wire.value = 'stored-secret'
    vi.stubEnv('TEST_KEY', '')
    expect(await credentials.resolve(REF)).toEqual({ value: 'stored-secret', source: 'keychain' })
  })

  it('propagates bridge transport failures from resolve', async () => {
    const { credentials, wire } = await harness()
    wire.failNext = true
    await expect(credentials.resolve(REF)).rejects.toThrow('fetch failed')
  })

  it('describes every state: env, keychain, absent, unreachable bridge', async () => {
    const { credentials, wire } = await harness()
    vi.stubEnv('TEST_KEY', 'env-secret')
    expect(await credentials.describe(REF)).toEqual({ configured: true, source: 'env', writable: false })
    vi.stubEnv('TEST_KEY', '')
    wire.value = 'stored-secret'
    expect(await credentials.describe(REF)).toEqual({ configured: true, source: 'keychain', writable: true })
    wire.value = undefined
    expect(await credentials.describe(REF)).toEqual({ configured: false, writable: true })
    wire.failNext = true
    expect(await credentials.describe(REF)).toEqual({ configured: false, writable: false })
  })

  it('set stores through the bridge and emits credentials/updated', async () => {
    const { credentials, wire } = await harness()
    const updated: string[] = []
    context!.on('credentials/updated', (ref: string) => { updated.push(ref) })
    await credentials.set(REF, 'new-secret')
    expect(wire.set).toBe(1)
    expect(updated).toEqual(['TEST_KEY'])
  })

  it('set rejects empty values and shadowed references', async () => {
    const { credentials, wire } = await harness()
    await expect(credentials.set(REF, '')).rejects.toThrow('rejects an empty value')
    vi.stubEnv('TEST_KEY', 'env-secret')
    await expect(credentials.set(REF, 'new-secret')).rejects.toThrow('read-only process environment')
    expect(wire.set).toBe(0)
  })

  it('unset deletes through the bridge, emits credentials/updated, and rejects while shadowed', async () => {
    const { credentials, wire } = await harness()
    const updated: string[] = []
    context!.on('credentials/updated', (ref: string) => { updated.push(ref) })
    await credentials.unset(REF)
    expect(wire.del).toBe(1)
    expect(updated).toEqual(['TEST_KEY'])
    vi.stubEnv('TEST_KEY', 'env-secret')
    await expect(credentials.unset(REF)).rejects.toThrow('read-only process environment')
  })
})
