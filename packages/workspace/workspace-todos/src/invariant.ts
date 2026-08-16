/** Package-owned invariant companion. @module @deepseek-ai/dsh-workspace-todos/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-workspace-todos'

/** Cordis companion plugin name. */
export const name = 'workspace-todos-invariant'
/** Services required before the companion can reserve and check package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the private typed writer owns current todo mutations,
 * the domain schema validates records on reopen, and no second authority
 * exists.
 */
const install: InvariantInstaller = Object.assign(() => {}, { inject: ['workspaceTodos'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
