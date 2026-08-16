/**
 * Package-owned invariant companion for the workspace-todos bundle.
 * @module @deepseek-ai/dsh-workspace-todos-bundle/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-workspace-todos-bundle'

/** Cordis companion plugin name. */
export const name = 'workspace-todos-bundle-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// The package only declares a static patch list. Every inserted plugin owns
// its own service relation and invariant companion.
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
