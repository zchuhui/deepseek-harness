import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { TOKEN_HEADER } from '@deepseek-ai/dsh-desktop-bridge'
import DesktopShellHost, { resolveSpec } from '../src/index.ts'

let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

interface StubCall { method: string; url: string; token: string | null; body: string | null }

function stubFetch(): { calls: StubCall[]; fetchFn: typeof fetch; respond: (status: number, json: unknown) => void } {
  const calls: StubCall[] = []
  let responder: (status: number, json: unknown) => void = () => {}
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({
      method: init?.method ?? 'GET',
      url: input instanceof URL ? input.href : input instanceof Request ? input.url : input,
      token: headers.get(TOKEN_HEADER),
      body: typeof init?.body === 'string' ? init.body : null,
    })
    return await new Promise<Response>((resolve) => {
      responder = (status, json) => { resolve(new Response(JSON.stringify(json), { status })) }
    })
  })
  return { calls, fetchFn, respond: (status, json) => { responder(status, json) } }
}

describe('resolveSpec', () => {
  it('reads the shell-exported environment', () => {
    expect(resolveSpec({}, { DSH_DESKTOP_BRIDGE_URL: 'http://127.0.0.1:3901', DSH_DESKTOP_BRIDGE_TOKEN: 't' })).toEqual({ url: 'http://127.0.0.1:3901', token: 't', timeoutMs: 5000 })
  })

  it('prefers explicit config over the environment', () => {
    const env = { DSH_DESKTOP_BRIDGE_URL: 'http://127.0.0.1:3901', DSH_DESKTOP_BRIDGE_TOKEN: 'env' }
    expect(resolveSpec({ bridgeToken: 'cfg', timeoutMs: 900 }, env)).toEqual({ url: 'http://127.0.0.1:3901', token: 'cfg', timeoutMs: 900 })
  })

  it('throws at load when the bridge environment is missing', () => {
    expect(() => resolveSpec({}, {})).toThrow('requires the desktop bridge environment')
    expect(() => resolveSpec({}, { DSH_DESKTOP_BRIDGE_URL: 'http://x', DSH_DESKTOP_BRIDGE_TOKEN: '' })).toThrow('requires the desktop bridge environment')
  })
})

describe('DesktopShellHost', () => {
  it('registers as ctx.desktopHost and reports a window through the bridge', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    const stub = stubFetch()
    vi.stubGlobal('fetch', stub.fetchFn)

    context = new Context()
    await context.plugin(DesktopShellHost)
    expect(context.desktopHost).toBeInstanceOf(DesktopShellHost)

    const done = context.desktopHost.reportWindow('main', 'sess-9')
    expect(stub.calls[0]).toMatchObject({ method: 'POST', url: 'http://127.0.0.1:3901/api/desktop/windows/assign', token: 'secret' })
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ label: 'main', sessionId: 'sess-9' })
    stub.respond(200, {})
    await done
  })

  it('forwards a null session through reportWindow', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    const stub = stubFetch()
    vi.stubGlobal('fetch', stub.fetchFn)

    context = new Context()
    await context.plugin(DesktopShellHost)

    const done = context.desktopHost.reportWindow('win-2', null)
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ label: 'win-2', sessionId: null })
    stub.respond(200, {})
    await done
  })

  it('reads the settings document through the bridge', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    const stub = stubFetch()
    vi.stubGlobal('fetch', stub.fetchFn)

    context = new Context()
    await context.plugin(DesktopShellHost)

    const done = context.desktopHost.getSettings()
    expect(stub.calls[0]).toMatchObject({ method: 'GET', url: 'http://127.0.0.1:3901/api/desktop/settings', token: 'secret' })
    expect(stub.calls[0]!.body).toBeNull()
    stub.respond(200, { closeToTray: true, launchAtLogin: false })
    await expect(done).resolves.toEqual({ closeToTray: true, launchAtLogin: false })
  })

  it('applies a partial settings document through the bridge', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    const stub = stubFetch()
    vi.stubGlobal('fetch', stub.fetchFn)

    context = new Context()
    await context.plugin(DesktopShellHost)

    const done = context.desktopHost.setSettings({ launchAtLogin: true })
    expect(stub.calls[0]).toMatchObject({ method: 'POST', url: 'http://127.0.0.1:3901/api/desktop/settings', token: 'secret' })
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ launchAtLogin: true })
    stub.respond(200, { closeToTray: false, launchAtLogin: true })
    await expect(done).resolves.toEqual({ closeToTray: false, launchAtLogin: true })
  })
})
