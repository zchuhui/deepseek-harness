/**
 * Zero-dependency typed client for the desktop shell's native bridge: a
 * token-guarded loopback HTTP API through which dsh host providers reach
 * toast, directory-picker, keychain, and updater primitives. The contract
 * is owned by desktop-app/README.md; this package only types the client.
 * A library, not a plugin: no ctx, no state beyond the connection options.
 * @module @deepseek-ai/dsh-desktop-bridge
 */

/** Environment name of the bridge URL the desktop shell exports to the spawned dsh child. */
export const ENV_BRIDGE_URL = 'DSH_DESKTOP_BRIDGE_URL'
/** Environment name of the run-scoped token the desktop shell exports to the spawned dsh child. */
export const ENV_BRIDGE_TOKEN = 'DSH_DESKTOP_BRIDGE_TOKEN'
/** Auth header every bridge request carries. */
export const TOKEN_HEADER = 'x-dsh-bridge-token'

/** Connection options; defaulting is the explicit resolve step, never hidden in calls. */
export interface DesktopBridgeOptions {
  /** Loopback URL the shell serves, e.g. http://127.0.0.1:3901. */
  url: string
  /** Run-scoped token the shell generated. */
  token: string
  /** Fetch boundary; tests inject a stub instead of the global fetch. */
  fetchFn?: typeof fetch
  /** Per-request timeout in milliseconds; defaults to 5000. */
  timeoutMs?: number
}

/** Fully resolved connection parameters; defaulting happens here, never inline. */
export interface ResolvedBridgeOptions {
  url: string
  token: string
  fetchFn: typeof fetch
  timeoutMs: number
}

/**
 * Resolve the connection parameters from raw options.
 * @param options - raw client options.
 * @returns the resolved URL, token, fetch boundary, and timeout.
 */
export function resolveBridgeOptions(options: DesktopBridgeOptions): ResolvedBridgeOptions {
  return {
    url: options.url.replace(/\/+$/, ''),
    token: options.token,
    fetchFn: options.fetchFn ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? 5000,
  }
}

/**
 * A bridge request failed with an HTTP status. Network failures reject with
 * the fetch error itself, so callers can tell a down shell from a refusal.
 */
export class DesktopBridgeError extends Error {
  /**
   * @param status - HTTP status the shell answered with.
   * @param message - shell-provided or derived error message.
   */
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'DesktopBridgeError'
  }
}

/**
 * One shell-reported update state. absent fields are null in the wire JSON;
 * providers map this onto their own UpdateState vocabulary.
 */
export interface DesktopUpdateState {
  channel: string
  currentVersion: string | null
  checkedAt: number | null
  available: { version: string; publishedAt: number } | null
  lastFailure: { message: string; at: number } | null
}

/**
 * The typed client. Every method rejects with {@link DesktopBridgeError}
 * for a non-2xx answer and with the fetch error for transport failures.
 */
export class DesktopBridge {
  private readonly options: ResolvedBridgeOptions

  constructor(options: DesktopBridgeOptions) {
    this.options = resolveBridgeOptions(options)
  }

  /**
   * Show one native notification.
   * @param title - toast title.
   * @param body - toast body.
   * @param sessionId - optional session the shell deep-links to when the notification is opened.
   */
  async toast(title: string, body: string, sessionId?: string): Promise<void> {
    const payload: { title: string; body: string; sessionId?: string } = { title, body }
    if (sessionId !== undefined) payload.sessionId = sessionId
    await this.request('POST', '/api/desktop/toast', payload)
  }

  /**
   * Open the native directory chooser.
   * @returns the chosen absolute path, or null when the operator cancels.
   */
  async pickDirectory(): Promise<string | null> {
    const payload = await this.request('POST', '/api/desktop/pick-directory') as { path?: string; canceled?: boolean }
    if (payload.path !== undefined) return payload.path
    return null
  }

  /**
   * Read one keychain secret.
   * @param name - secret name.
   * @returns the stored value, or undefined when absent.
   */
  async keychainGet(name: string): Promise<string | undefined> {
    try {
      const payload = await this.request('GET', '/api/desktop/keychain/' + encodeURIComponent(name)) as { value?: string }
      return payload.value
    } catch (error) {
      if (error instanceof DesktopBridgeError && error.status === 404) return undefined
      throw error
    }
  }

  /**
   * Store one keychain secret.
   * @param name - secret name.
   * @param value - non-empty secret value.
   */
  async keychainSet(name: string, value: string): Promise<void> {
    await this.request('POST', '/api/desktop/keychain/' + encodeURIComponent(name), { value })
  }

  /**
   * Remove one keychain secret; removing an absent secret is a no-op.
   * @param name - secret name.
   */
  async keychainDelete(name: string): Promise<void> {
    await this.request('DELETE', '/api/desktop/keychain/' + encodeURIComponent(name))
  }

  /**
   * Fetch the shell's update state.
   * @returns the wire state.
   */
  /**
   * Fetch the shell's update state.
   * @param signal - optional caller cancellation, combined with the request timeout.
   * @returns the wire state.
   */
  async updateState(signal?: AbortSignal): Promise<DesktopUpdateState> {
    return await this.request('GET', '/api/desktop/update', undefined, signal) as DesktopUpdateState
  }

  /**
   * Ask the shell to apply an offered update.
   * @param version - the version to apply.
   */
  /**
   * Ask the shell to apply an offered update.
   * @param version - the version to apply.
   * @param signal - optional caller cancellation, combined with the request timeout.
   */
  async updateApply(version: string, signal?: AbortSignal): Promise<void> {
    await this.request('POST', '/api/desktop/update/apply', { version }, signal)
  }

  /**
   * Send one token-guarded JSON request and unwrap a 2xx JSON body.
   * @param method - HTTP method.
   * @param path - bridge path.
   * @param body - JSON body; omitted for GET/DELETE.
   * @returns the parsed JSON body.
   * @throws {DesktopBridgeError} for non-2xx answers, fetch errors otherwise.
   */
  private async request(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const headers: Record<string, string> = { [TOKEN_HEADER]: this.options.token }
    const timeout = AbortSignal.timeout(this.options.timeoutMs)
    const requestSignal = signal === undefined ? timeout : AbortSignal.any([timeout, signal])
    const init: RequestInit = {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      signal: requestSignal,
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    let response: Response
    try {
      response = await this.options.fetchFn(this.options.url + path, init)
    } catch (error) {
      throw error instanceof Error && error.name === 'TimeoutError'
        ? new DesktopBridgeError(504, 'bridge request timed out')
        : error
    }
    if (response.status < 200 || response.status >= 300) {
      const text = await response.text()
      let message = 'bridge answered HTTP ' + String(response.status)
      try {
        const parsed = JSON.parse(text) as { error?: string }
        if (parsed.error !== undefined) message = parsed.error
      } catch {
        // Non-JSON error body; the status-derived message stands.
      }
      throw new DesktopBridgeError(response.status, message)
    }
    return await response.json()
  }
}
