/** Package-owned invariant companion for the desktop-host seam. @module @deepseek-ai/dsh-host-desktop/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-desktop'

/** Cordis companion plugin name. */
export const name = 'host-desktop-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this stateless Service Definition owns the desktop-host
 * capability contract, while the shell provider and its callers own observations.
 */
const install: InvariantInstaller = () => {}

/**
 * Register the desktop-host invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
