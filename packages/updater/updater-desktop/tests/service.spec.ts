import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import DesktopUpdater, { resolveSpec } from '../src/index.ts'

let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function stubFetch(respond: (input: string | URL | Request, init?: RequestInit) => Response) {
  return async (input: string | URL | Request, init?: RequestInit) => respond(input, init)
}

function bridgeEnv(): void {
  vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
  vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
}

async function harness(config: { channel?: string } = {}, fetchFn?: typeof fetch): Promise<{ updater: DesktopUpdater }> {
  bridgeEnv()
  if (fetchFn !== undefined) vi.stubGlobal('fetch', fetchFn)
  context = new Context()
  await context.plugin(DesktopUpdater, config)
  return { updater: context.updater as DesktopUpdater }
}

describe('resolveSpec', () => {
  it('reads the shell-exported environment and brands the channel', () => {
    const env = { DSH_DESKTOP_BRIDGE_URL: 'http://127.0.0.1:3901', DSH_DESKTOP_BRIDGE_TOKEN: 't' }
    expect(resolveSpec({}, env)).toEqual({ url: 'http://127.0.0.1:3901', token: 't', timeoutMs: 5000, channel: 'manual' })
  })

  it('throws at load on missing bridge facts or an invalid channel', () => {
    expect(() => resolveSpec({}, {})).toThrow('requires the desktop bridge environment')
    expect(() => resolveSpec({ channel: 'two words' }, { DSH_DESKTOP_BRIDGE_URL: 'u', DSH_DESKTOP_BRIDGE_TOKEN: 't' })).toThrow('whitespace')
  })
})

describe('DesktopUpdater', () => {
  it('reports the configured channel before the first check', async () => {
    const { updater } = await harness({ channel: 'stable' })
    expect(updater.state()).toEqual({ channel: 'stable', currentVersion: null })
  })

  it('check maps a full wire state and replaces the cache', async () => {
    let call = 0
    const fetchFn = stubFetch(() => {
      call += 1
      if (call === 1) {
        return new Response(JSON.stringify({ channel: 'stable', currentVersion: '1.0.0', checkedAt: 100, available: { version: '1.1.0', publishedAt: 200 }, lastFailure: { message: 'previous check failed', at: 50 } }), { status: 200 })
      }
      return new Response(JSON.stringify({ channel: 'stable', currentVersion: '1.0.0', checkedAt: 300, available: null, lastFailure: null }), { status: 200 })
    })
    const { updater } = await harness({}, fetchFn)
    expect(await updater.check()).toEqual({
      channel: 'stable',
      currentVersion: '1.0.0',
      checkedAt: 100,
      available: { version: '1.1.0', publishedAt: 200 },
      lastFailure: { message: 'previous check failed', at: 50 },
    })
    expect(await updater.check()).toEqual({
      channel: 'stable',
      currentVersion: '1.0.0',
      checkedAt: 300,
      available: null,
    })
    expect(updater.state()).toEqual({
      channel: 'stable',
      currentVersion: '1.0.0',
      checkedAt: 300,
      available: null,
    })
  })

  it('rejects an invalid channel reported by the shell', async () => {
    const fetchFn = stubFetch(() => new Response(JSON.stringify({ channel: 'two words', currentVersion: null, checkedAt: null, available: null, lastFailure: null }), { status: 200 }))
    const { updater } = await harness({}, fetchFn)
    await expect(updater.check()).rejects.toThrow('whitespace')
  })

  it('apply forwards the shell refusal', async () => {
    const fetchFn = stubFetch(() => new Response(JSON.stringify({ error: 'apply is not implemented in the skeleton milestone' }), { status: 501 }))
    const { updater } = await harness({}, fetchFn)
    await expect(updater.apply('2.0.0')).rejects.toThrow('not implemented in the skeleton milestone')
  })
})
