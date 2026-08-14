/**
 * Desktop keychain provider for the credential seam: resolves references
 * through the desktop shell bridge. Layering is process environment
 * (read-only, wins) over the keychain (provider-managed, writable): a
 * non-empty environment value shadows the keychain, and set/unset reject
 * while it shadows — the seam-wide fail-loud rule. Fails loud at load when
 * the bridge environment is missing.
 * @module @deepseek-ai/dsh-credentials-desktop
 */

import type { Context } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { DesktopBridge, ENV_BRIDGE_TOKEN, ENV_BRIDGE_URL } from '@deepseek-ai/dsh-desktop-bridge'

/** Plugin config: bridge connection overrides and timeout. */
export interface Config {
  /** Bridge URL override; defaults to the shell-exported environment. */
  bridgeUrl?: string
  /** Bridge token override; defaults to the shell-exported environment. */
  bridgeToken?: string
  /** Per-request timeout in milliseconds; defaults to 5000. */
  timeoutMs?: number
}

/** Fully resolved connection parameters; defaulting happens here, never inline. */
export interface ResolvedSpec {
  url: string
  token: string
  timeoutMs: number
}

/**
 * Resolve the connection spec from plugin config and the process
 * environment. Missing bridge facts throw at load.
 * @param config - raw plugin config.
 * @param env - process environment; tests inject a stub.
 * @returns the resolved bridge connection.
 */
export function resolveSpec(config: Config, env: NodeJS.ProcessEnv = process.env): ResolvedSpec {
  const url = config.bridgeUrl ?? env[ENV_BRIDGE_URL]
  const token = config.bridgeToken ?? env[ENV_BRIDGE_TOKEN]
  if (url === undefined || url === '' || token === undefined || token === '') {
    throw new Error('credentials-desktop requires the desktop bridge environment (DSH_DESKTOP_BRIDGE_URL and DSH_DESKTOP_BRIDGE_TOKEN); compose it only under the desktop shell')
  }
  return { url, token, timeoutMs: config.timeoutMs ?? 5000 }
}

/** The ctx.credentials desktop-keychain implementation. */
export default class DesktopCredentials extends CredentialProvider {
  private readonly bridge: DesktopBridge

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const spec = resolveSpec(config)
    this.bridge = new DesktopBridge({ url: spec.url, token: spec.token, timeoutMs: spec.timeoutMs })
  }

  override async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const fromEnv = this.shadowing(ref)
    if (fromEnv !== undefined) return { value: fromEnv, source: 'env' }
    const stored = await this.bridge.keychainGet(ref)
    if (stored === undefined || stored === '') return undefined
    return { value: stored, source: 'keychain' }
  }

  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const fromEnv = this.shadowing(ref)
    if (fromEnv !== undefined) return { configured: true, source: 'env', writable: false }
    try {
      const stored = await this.bridge.keychainGet(ref)
      if (stored !== undefined && stored !== '') return { configured: true, source: 'keychain', writable: true }
      return { configured: false, writable: true }
    } catch {
      // The bridge is unreachable; a set would fail the same way.
      return { configured: false, writable: false }
    }
  }

  override async set(ref: CredentialRef, value: string): Promise<void> {
    if (value === '') throw new Error('credentials-desktop: set rejects an empty value; use unset to remove a credential')
    this.assertNotShadowed(ref)
    await this.bridge.keychainSet(ref, value)
    this.notifyUpdated(ref)
  }

  override async unset(ref: CredentialRef): Promise<void> {
    this.assertNotShadowed(ref)
    await this.bridge.keychainDelete(ref)
    this.notifyUpdated(ref)
  }

  /**
   * The non-empty process-environment value shadowing ref, if any.
   * @param ref - the reference to check.
   * @returns the shadowing value, or undefined.
   */
  private shadowing(ref: CredentialRef): string | undefined {
    const value = process.env[ref]
    if (value === undefined || value === '') return undefined
    return value
  }

  /**
   * Reject writes while the read-only environment layer supplies ref.
   * @param ref - the reference to write.
   */
  private assertNotShadowed(ref: CredentialRef): void {
    if (this.shadowing(ref) !== undefined) {
      throw new Error('credentials-desktop: reference ' + ref + ' is supplied by the read-only process environment; unset the environment variable first')
    }
  }
}
