/**
 * Package-owned invariant companion for @deepseek-ai/dsh-credentials-desktop.
 * @module @deepseek-ai/dsh-credentials-desktop/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-credentials-desktop'

/** Cordis companion plugin name. */
export const name = 'credentials-desktop-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider owns no durable state of its own;
 * the seam's credentials/updated lifecycle belongs to the Service
 * Definition companion, and the keychain layering is pinned by its unit
 * suite.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
