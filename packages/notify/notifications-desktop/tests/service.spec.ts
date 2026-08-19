import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { TOKEN_HEADER } from '@deepseek-ai/dsh-desktop-bridge'
import DesktopNotifications, { resolveSpec } from '../src/index.ts'

let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

interface StubCall { method: string; url: string; token: string | null; body: string | null }

function stubFetch(): { calls: StubCall[]; fetchFn: typeof fetch; respond: (status: number, json: unknown) => void } {
  const calls: { method: string; url: string; token: string | null; body: string | null }[] = []
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
  it('reads the shell-exported environment and defaults backgroundOnlyKinds', () => {
    expect(resolveSpec({}, { DSH_DESKTOP_BRIDGE_URL: 'http://127.0.0.1:3901', DSH_DESKTOP_BRIDGE_TOKEN: 't' })).toEqual({ url: 'http://127.0.0.1:3901', token: 't', timeoutMs: 5000, backgroundOnlyKinds: ['turn-completed'] })
  })

  it('prefers explicit config over the environment', () => {
    const env = { DSH_DESKTOP_BRIDGE_URL: 'http://127.0.0.1:3901', DSH_DESKTOP_BRIDGE_TOKEN: 'env' }
    expect(resolveSpec({ bridgeToken: 'cfg', timeoutMs: 900, backgroundOnlyKinds: ['turn-completed', 'job-settled'] }, env)).toEqual({ url: 'http://127.0.0.1:3901', token: 'cfg', timeoutMs: 900, backgroundOnlyKinds: ['turn-completed', 'job-settled'] })
  })

  it('throws at load when the bridge environment is missing', () => {
    expect(() => resolveSpec({}, {})).toThrow('requires the desktop bridge environment')
    expect(() => resolveSpec({}, { DSH_DESKTOP_BRIDGE_URL: 'http://x', DSH_DESKTOP_BRIDGE_TOKEN: '' })).toThrow('requires the desktop bridge environment')
  })
})

describe('DesktopNotifications', () => {
  it('registers as ctx.notifications and delivers a toast', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    const stub = stubFetch()
    vi.stubGlobal('fetch', stub.fetchFn)

    context = new Context()
    await context.plugin(DesktopNotifications)
    expect(context.notifications).toBeInstanceOf(DesktopNotifications)

    const done = context.notifications.notify({ kind: 'turn-failed', title: '回合失败', body: '请求失败', sessionId: SessionId('sess-9') })
    expect(stub.calls[0]).toMatchObject({ method: 'POST', url: 'http://127.0.0.1:3901/api/desktop/toast', token: 'secret' })
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ title: '回合失败', body: '请求失败', sessionId: 'sess-9' })
    stub.respond(200, { shown: true })
    await done
  })

  it('marks a configured backgroundOnly kind and leaves other kinds plain', async () => {
    vi.stubEnv('DSH_DESKTOP_BRIDGE_URL', 'http://127.0.0.1:3901')
    vi.stubEnv('DSH_DESKTOP_BRIDGE_TOKEN', 'secret')
    const stub = stubFetch()
    vi.stubGlobal('fetch', stub.fetchFn)

    context = new Context()
    await context.plugin(DesktopNotifications, { backgroundOnlyKinds: ['turn-failed'] })

    const failed = context.notifications.notify({ kind: 'turn-failed', title: '回合失败', body: '请求失败', sessionId: SessionId('sess-9') })
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ title: '回合失败', body: '请求失败', sessionId: 'sess-9', backgroundOnly: true })
    stub.respond(200, { shown: false, suppressed: true })
    await failed

    const settled = context.notifications.notify({ kind: 'job-settled', title: '后台任务完成', body: 'bash: pnpm test' })
    expect(JSON.parse(stub.calls[1]!.body!)).toEqual({ title: '后台任务完成', body: 'bash: pnpm test' })
    stub.respond(200, { shown: true })
    await settled
  })
})
