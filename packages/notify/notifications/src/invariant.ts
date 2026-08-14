/**
 * Package-owned invariant companion. The seam registers no runtime state, so
 * there is no event or data relation to validate.
 * @module @deepseek-ai/dsh-notifications/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-notifications'

/** Cordis invariant-companion plugin name. */
export const name = 'notifications-invariant'
/** Service required before reserving this package's invariant ownership. */
export const inject = ['invariants']

/**
 * Installer for the seam package's invariant ownership.
 * No runtime invariant: the abstract seam registers no services, state, or
 * event streams of its own; provider packages own every runtime relation.
 */
const install: InvariantInstaller = Object.assign((_ctx: Context) => {}, {})

/**
 * Register the package-owned invariant companion.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns Exact registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
