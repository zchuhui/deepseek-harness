/** Validated configuration for the PowerShell PTY backend. */

import z from '@deepseek-ai/schemastery'
import { resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local'

/** Public plugin configuration. */
export interface Config {
  /** Backend registry type (default: `shell`). */
  backendType?: string
  /** Interactive PowerShell executable (default: {@link resolvePwshPath}). */
  shellPath?: string
  /** Shell arguments (default: `-NoLogo -NoProfile -NoExit` plus the controlled prompt command). */
  shellArgs?: string[]
  /** Terminal rows. */
  rows?: number
  /** Terminal columns. */
  cols?: number
  /** Maximum retained logical lines. */
  scrollbackLines?: number
  /** Maximum retained UTF-8 bytes. */
  scrollbackMaxBytes?: number
  /** Maximum bytes returned by one read or settled viewport. */
  maxReadBytes?: number
  /** Readiness polling interval. */
  pollIntervalMs?: number
  /** Delay before Linux exact syscall probes. */
  exactProbeAfterMs?: number
  /** Silence duration that yields `inferred_idle`. */
  idleSilenceMs?: number
  /**
   * Extra wait beyond `idleSilenceMs`, once a prompt marker was seen, for the shell to
   * regain the foreground before `inferred_idle` settles; at least one `pollIntervalMs`.
   */
  handoffGraceMs?: number
  /** Absolute send wait bound. */
  timeoutMs?: number
  /** Grace before teardown escalates to `SIGKILL`. */
  disposeGraceMs?: number
}

/** Configuration after Schemastery defaults. */
export type ResolvedConfig = Required<Config>

/**
 * PowerShell `prompt` function that prints the same private OSC marker and
 * printable `dsh> ` tail as the bash backend.
 */
export const CONTROLLED_PROMPT_COMMAND
  = "function prompt { $code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }; [console]::Out.Write(([char]27) + ']133;D;' + $code + ([char]7)); 'dsh> ' }"

/** Schemastery config exposed by the plugin. */
export const Config: z<Config> = z.object({
  backendType: z.string().default('shell'),
  shellPath: z.string().default(resolvePwshPath()),
  shellArgs: z.array(z.string()).default(['-NoLogo', '-NoProfile', '-NoExit', '-Command', CONTROLLED_PROMPT_COMMAND]),
  rows: z.number().default(40),
  cols: z.number().default(160),
  scrollbackLines: z.number().default(10_000),
  scrollbackMaxBytes: z.number().default(4 * 1024 * 1024),
  maxReadBytes: z.number().default(256 * 1024),
  pollIntervalMs: z.number().default(50),
  exactProbeAfterMs: z.number().default(150),
  idleSilenceMs: z.number().default(3_000),
  handoffGraceMs: z.number().default(500),
  timeoutMs: z.number().default(30_000),
  disposeGraceMs: z.number().default(3_000),
})

/**
 * Assert every numeric config field is a positive safe integer and bounds compose.
 * @param config - Schemastery-resolved plugin configuration.
 * @returns Narrows the input to the fully resolved configuration.
 */
export function validateConfig(config: Config): asserts config is ResolvedConfig {
  const resolved = config as ResolvedConfig
  if (resolved.backendType.length === 0) throw new Error('terminal-pwsh: backendType must be non-empty')
  if (resolved.shellPath.length === 0) throw new Error('terminal-pwsh: shellPath must be non-empty')
  for (const [name, value] of Object.entries(resolved)) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(`terminal-pwsh: ${name} must be a positive safe integer`)
    }
  }
  if (resolved.maxReadBytes > resolved.scrollbackMaxBytes) {
    throw new Error('terminal-pwsh: maxReadBytes must not exceed scrollbackMaxBytes')
  }
  if (resolved.handoffGraceMs < resolved.pollIntervalMs) {
    throw new Error('terminal-pwsh: handoffGraceMs must be at least pollIntervalMs so one readiness poll runs inside the grace window')
  }
}
