/**
 * Persistent PowerShell PTY backend over the subprocess terminal primitive.
 * @module @deepseek-ai/dsh-terminal-pwsh
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { TerminalBackendCleanupError } from '@deepseek-ai/dsh-terminal'
import type { TerminalBackend, TerminalBackendSpawnSpec } from '@deepseek-ai/dsh-terminal'
import type { SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { effectiveSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { type Config, type ResolvedConfig, validateConfig } from './config.ts'
import { LocalPtySession } from './session.ts'

export { Config, CONTROLLED_PROMPT_COMMAND } from './config.ts'
export type { Config as TerminalPwshConfig } from './config.ts'

/** Cordis plugin name. */
export const name = 'terminal-pwsh'
/** Required services: PTY registry, shared confinement policy, and process substrate. */
export const inject = ['terminals', 'sandboxPolicy', 'subprocess']

interface SandboxModeFenceState {
  pty: Context['terminals']
  sandboxPolicy: Context['sandboxPolicy']
}

const sandboxModeFences = new WeakMap<Agent, SandboxModeFenceState>()

function ensureSandboxModeFence(ctx: Context, owner: Agent): void {
  const existing = sandboxModeFences.get(owner)
  if (existing !== undefined) {
    existing.pty = ctx.terminals
    existing.sandboxPolicy = ctx.sandboxPolicy
    return
  }
  const state: SandboxModeFenceState = { pty: ctx.terminals, sandboxPolicy: ctx.sandboxPolicy }
  sandboxModeFences.set(owner, state)
  owner.ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (session !== owner.session || event.type !== 'sandbox/mode') return
    const currentMode = effectiveSandboxMode(session.events) ?? state.sandboxPolicy.defaultMode
    if (event.data.mode === currentMode || !state.pty.hasOwnerActivity(owner)) return
    throw new Error(
      `cannot change sandbox mode from "${currentMode}" to "${event.data.mode}" while persistent terminal sessions are open or being created; wait for creation to settle and close them first`,
    )
  }, { global: true })
}

function childEnvironment(spec: TerminalBackendSpawnSpec): Record<string, string> {
  return {
    TERM: 'dumb',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
    DSH_SHELL: '1',
    DSH_SESSION_ID: spec.owner.id,
    DSH_PTY_SESSION_ID: spec.sessionId,
  }
}

/**
 * Build the argv for one PTY spawn. Windows confined modes refuse: the ACL
 * runner cannot isolate a new console, so ConPTY plus `sandbox.confine()` is
 * fail-closed until a native probe proves otherwise.
 * @param ctx - plugin context that may carry `ctx.sandbox`.
 * @param config - resolved backend configuration.
 * @param policy - session sandbox policy.
 * @param platform - host platform; tests inject `win32`.
 * @returns the executable argv, possibly wrapped by the sandbox provider.
 */
export function spawnArgv(
  ctx: Context,
  config: ResolvedConfig,
  policy: SandboxExecutionPolicy,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const argv = [config.shellPath, ...config.shellArgs]
  if (policy.mode === 'danger-full-access') return argv
  if (platform === 'win32') {
    throw new Error(
      'terminal-pwsh: confined persistent terminals are unavailable on Windows; open a PTY only under danger-full-access',
    )
  }
  const sandbox = ctx.get('sandbox')
  if (sandbox === undefined) {
    throw new Error(`terminal-pwsh: sandbox mode "${policy.mode}" requires a ctx.sandbox provider in the execution world`)
  }
  return sandbox.confine(argv, { ...policy, mode: policy.mode }).argv
}

async function initializeSession(session: LocalPtySession, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) {
    await session.initialize(signal)
    return
  }
  const aborted = Promise.withResolvers<never>()
  const onAbort = (): void => { aborted.reject(signal.reason) }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    signal.throwIfAborted()
    await Promise.race([session.initialize(signal), aborted.promise])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/** PowerShell backend registered under the configured type. */
export class PwshTerminalBackend implements TerminalBackend {
  readonly type: string

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
    private readonly spawnTerminal: (
      spec: SubprocessTerminalSpawnSpec,
    ) => Promise<SubprocessTerminalHandle> = spec => ctx.subprocess.spawnTerminal(spec),
    private readonly createSession: (
      terminal: SubprocessTerminalHandle,
      config: ResolvedConfig,
    ) => LocalPtySession = (terminal, config) => new LocalPtySession(terminal, config),
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.type = config.backendType
  }

  async spawn(spec: TerminalBackendSpawnSpec): Promise<LocalPtySession> {
    spec.signal?.throwIfAborted()
    ensureSandboxModeFence(this.ctx, spec.owner)
    const policy = this.ctx.sandboxPolicy.resolve({ session: spec.owner.session })
    const argv = spawnArgv(this.ctx, this.config, policy, this.platform)
    if (argv[0] === undefined) throw new Error('terminal-pwsh: sandbox returned empty argv')
    const terminal = await this.spawnTerminal({
      argv,
      cwd: spec.cwd ?? policy.workspaceRoot,
      env: childEnvironment(spec),
      rows: this.config.rows,
      cols: this.config.cols,
      graceMs: this.config.disposeGraceMs,
      signal: spec.signal,
    })
    const session = this.createSession(terminal, this.config)
    try {
      await initializeSession(session, spec.signal)
      return session
    } catch (error) {
      try {
        await session.close('PTY startup failed')
      } catch (closeError: unknown) {
        throw new TerminalBackendCleanupError(error, closeError)
      }
      throw error
    }
  }
}

/** Register the PowerShell PTY backend. */
export function apply(ctx: Context, config: Config): void {
  validateConfig(config)
  ctx.terminals.registerBackend(new PwshTerminalBackend(ctx, config))
}
