/**
 * Operator-visible warnings for Windows ACL grant roots: unusually wide
 * directories and FAT-class volumes. Enforcement stays `partial`; these
 * strings do not change the mode vocabulary.
 * @module @deepseek-ai/dsh-sandbox-windows-acl/grant-warnings
 */

import { statfsSync } from 'node:fs'

/** One operator-visible grant-root warning. */
export interface GrantRootWarning {
  /** Stable warning id. */
  readonly kind: 'wide-directory' | 'fat-volume' | 'first-grant-latency'
  /** Complete sentence for logs or UI. */
  readonly message: string
}

const FAT_TYPES = new Set(['FAT', 'FAT32', 'exFAT', 'FAT16'])

const WIDE_BASENAMES = new Set(['users', 'windows', 'program files', 'program files (x86)'])

/**
 * True when `workspaceRoot` is a drive root or a well-known wide host directory.
 * @param workspaceRoot - the resolved grant root.
 * @returns whether the path is unusually wide for a standing ACE.
 */
export function isWideGrantRoot(workspaceRoot: string): boolean {
  const normalized = workspaceRoot.replaceAll('\\', '/').replace(/\/+$/, '')
  if (normalized === '' || normalized === '/' || /^[A-Za-z]:$/.test(normalized)) return true
  const base = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  return WIDE_BASENAMES.has(base)
}

/**
 * True when `fileSystem` names a FAT-class volume.
 * @param fileSystem - `statfs` type string, or undefined when unknown.
 * @returns whether the volume lacks NTFS ACLs.
 */
export function isFatFileSystem(fileSystem: string | undefined): boolean {
  return fileSystem !== undefined && FAT_TYPES.has(fileSystem)
}

/**
 * Describe grant-root warnings for logs and optional UI.
 * @param workspaceRoot - the resolved grant root.
 * @param fileSystem - optional filesystem type from `statfs` / volume information.
 * @param firstStandingGrant - true when this process will apply a new standing ACE.
 * @returns zero or more complete warning sentences.
 */
export function describeGrantRootWarnings(
  workspaceRoot: string,
  fileSystem?: string,
  firstStandingGrant = false,
): GrantRootWarning[] {
  const warnings: GrantRootWarning[] = []
  if (isWideGrantRoot(workspaceRoot)) {
    warnings.push({
      kind: 'wide-directory',
      message: `sandbox-windows-acl: standing write grant root "${workspaceRoot}" is unusually wide; the ACE applies to every descendant`,
    })
  }
  if (isFatFileSystem(fileSystem)) {
    warnings.push({
      kind: 'fat-volume',
      message: `sandbox-windows-acl: grant root "${workspaceRoot}" is on a FAT-class volume; NTFS ACLs are unavailable and writes outside granted roots on this volume stay permitted`,
    })
  }
  if (firstStandingGrant) {
    warnings.push({
      kind: 'first-grant-latency',
      message: 'sandbox-windows-acl: the first standing ACE grant for this workspace on this machine may block for tens of seconds while Windows propagates inheritable ACEs',
    })
  }
  return warnings
}

/**
 * Read the filesystem type for `workspaceRoot`. Failures yield `undefined`.
 * @param workspaceRoot - the resolved grant root.
 * @param statfs - injectable `statfsSync`; defaults to `node:fs.statfsSync`.
 * @returns the `statfs` type string, or undefined when unreadable.
 */
export function readFileSystemType(
  workspaceRoot: string,
  statfs: typeof statfsSync = statfsSync,
): string | undefined {
  try {
    const stats = statfs(workspaceRoot) as unknown as { type?: string | bigint | number }
    const type = stats.type
    return typeof type === 'string' ? type : undefined
  } catch (_unreadableVolume) {
    return undefined
  }
}
