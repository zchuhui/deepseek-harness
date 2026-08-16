/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-file-attachment-local`.
 * @module @deepseek-ai/dsh-file-attachment-local/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-file-attachment-local'
/** Cordis companion plugin name. */
export const name = 'file-attachment-local-invariant'
/** Services required before package ownership can be reserved. */
export const inject = ['invariants', 'fileAttachments']
/** No runtime invariant: the provider owns no observable events or mutable data beyond its verified storage operations. */
const install: InvariantInstaller = () => {}
/**
 * Register the package invariant companion.
 * @param ctx - context providing the invariant registry.
 * @returns disposal of the package registration.
 */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
