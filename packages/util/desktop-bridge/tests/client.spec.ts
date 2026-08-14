import { describe, expect, it } from 'vitest'
import { DesktopBridge, resolveBridgeOptions, TOKEN_HEADER } from '../src/index.ts'

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
      responder = (status, json) => { resolve(new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })) }
    })
  })
  return { calls, fetchFn, respond: (status, json) => { responder(status, json) } }
}

describe('resolveBridgeOptions', () => {
  it('defaults the timeout and strips a trailing slash', () => {
    const resolved = resolveBridgeOptions({ url: 'http://127.0.0.1:3901/', token: 't' })
    expect(resolved.url).toBe('http://127.0.0.1:3901')
    expect(resolved.timeoutMs).toBe(5000)
  })
})

describe('DesktopBridge', () => {
  it('sends a token-guarded toast request', async () => {
    const stub = stubFetch()
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn: stub.fetchFn })
    const done = bridge.toast('任务完成', 'bash: pnpm test')
    expect(stub.calls[0]).toMatchObject({ method: 'POST', url: 'http://127.0.0.1:3901/api/desktop/toast', token: 'secret' })
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ title: '任务完成', body: 'bash: pnpm test' })
    stub.respond(200, { shown: true })
    await done
  })

  it('includes the session deep link when provided and omits it otherwise', async () => {
    const stub = stubFetch()
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn: stub.fetchFn })
    const linked = bridge.toast('t', 'b', 'sess-1')
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ title: 't', body: 'b', sessionId: 'sess-1' })
    stub.respond(200, { shown: true })
    await linked
    const plain = bridge.toast('t', 'b')
    expect(JSON.parse(stub.calls[1]!.body!)).toEqual({ title: 't', body: 'b' })
    stub.respond(200, { shown: true })
    await plain
  })

  it('maps a 404 keychain read to undefined and other statuses to errors', async () => {
    const stub = stubFetch()
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn: stub.fetchFn })
    const miss = bridge.keychainGet('missing')
    stub.respond(404, { error: 'not found' })
    expect(await miss).toBeUndefined()

    const hit = bridge.keychainGet('present')
    stub.respond(200, { value: 'v' })
    expect(await hit).toBe('v')

    const refused = bridge.keychainGet('forbidden')
    stub.respond(401, { error: 'unauthorized' })
    await expect(refused).rejects.toMatchObject({ status: 401 })
  })

  it('stores and deletes keychain secrets through the bridge', async () => {
    const stub = stubFetch()
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn: stub.fetchFn })
    const set = bridge.keychainSet('K', 'v')
    expect(stub.calls[0]).toMatchObject({ method: 'POST', url: 'http://127.0.0.1:3901/api/desktop/keychain/K' })
    expect(JSON.parse(stub.calls[0]!.body!)).toEqual({ value: 'v' })
    stub.respond(200, { stored: true })
    await set
    const del = bridge.keychainDelete('K')
    expect(stub.calls[1]).toMatchObject({ method: 'DELETE' })
    stub.respond(200, { deleted: true })
    await del
  })

  it('rejects non-2xx answers with the shell-provided error', async () => {
    const stub = stubFetch()
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn: stub.fetchFn })
    const apply = bridge.updateApply('2.0.0')
    stub.respond(501, { error: 'apply is not implemented in the skeleton milestone' })
    await expect(apply).rejects.toThrow('apply is not implemented in the skeleton milestone')
  })

  it('falls back to a status-derived message for non-JSON error bodies', async () => {
    const stub = stubFetch()
    const fetchFn = (async () => new Response('plain text', { status: 500 })) as typeof fetch
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn })
    await expect(bridge.updateState()).rejects.toMatchObject({ status: 500, message: 'bridge answered HTTP 500' })
    expect(stub.calls).toHaveLength(0)
  })

  it('wraps fetch timeouts as a 504 bridge error', async () => {
    const fetchFn = (async () => { throw new DOMException('timed out', 'TimeoutError') }) as typeof fetch
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn })
    await expect(bridge.updateState()).rejects.toMatchObject({ status: 504 })
  })

  it('propagates transport failures unchanged', async () => {
    const fetchFn = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn })
    await expect(bridge.updateState()).rejects.toThrow('fetch failed')
  })

  it('propagates non-Error transport failures unchanged', async () => {
    const fetchFn = async () => { throw 'plain-string' }
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn })
    await expect(bridge.updateState()).rejects.toBe('plain-string')
  })

  it('combines a caller signal with the request timeout', async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const fetchFn = async (_input: string | URL | Request, init?: RequestInit) => {
      seen = init?.signal ?? undefined
      return new Response(JSON.stringify({ channel: 'manual', currentVersion: null, checkedAt: null, available: null, lastFailure: null }), { status: 200 })
    }
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn })
    await bridge.updateState(controller.signal)
    expect(seen).toBeInstanceOf(AbortSignal)
    expect(seen).not.toBe(controller.signal)
  })

  it('returns the picked path or null on cancel', async () => {
    const stub = stubFetch()
    const bridge = new DesktopBridge({ url: 'http://127.0.0.1:3901', token: 'secret', fetchFn: stub.fetchFn })
    const picked = bridge.pickDirectory()
    stub.respond(200, { path: 'C:\\work' })
    expect(await picked).toBe('C:\\work')
    const canceled = bridge.pickDirectory()
    stub.respond(200, { canceled: true })
    expect(await canceled).toBeNull()
  })
})
