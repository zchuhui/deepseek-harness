/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-settings-desktop`.
 * @module @deepseek-ai/dsh-client-ui-settings-desktop/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-settings-desktop'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-desktop-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the two General-section rows read the desktop shell
 * settings through the loopback-only desktop RPC domain and own no host
 * events or cross-plugin mutable relation; their registration/disposal
 * lifecycle is proven by the apply spec.
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
