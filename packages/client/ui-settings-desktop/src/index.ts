/** Host registration for the desktop-shell settings browser plugin. */

import type { Context } from '@deepseek-ai/cordis'

/**
 * Node-half apply: no host-side contribution — the desktop shell owns its
 * settings and window behavior; this package contributes only the browser
 * General-section rows.
 * @param _ctx - Host context (unused).
 */
export function apply(_ctx: Context): void {}
