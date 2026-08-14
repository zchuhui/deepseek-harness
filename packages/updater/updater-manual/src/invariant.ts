/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-updater-manual`.
 * @module @deepseek-ai/dsh-updater-manual/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-updater-manual'

/** Cordis companion plugin name. */
export const name = 'updater-manual-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this no-op provider owns no durable state or event
 * stream; its `apply` rejection and check-timestamp semantics are pinned by
 * the package's unit suite.
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
