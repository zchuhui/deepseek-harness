/**
 * Deep-link query parsing for the browser client. The desktop shell navigates
 * each window to `/?win=<label>` (and `/?session=<sessionId>&win=<label>`
 * for a session target); this module extracts those targets from the raw
 * `location.search` string so the runtime can open the session at startup
 * and report its window's current session back to the shell.
 */

/**
 * Extract the `session` deep-link target from a raw query string using
 * standard URLSearchParams semantics.
 * @param search - the raw query string, typically `window.location.search`
 *   including its leading `?`.
 * @returns the non-empty `session` value, or undefined when the parameter is
 *   absent or empty, or when the input is not a `?`-prefixed query string.
 */
export function deepLinkSessionId(search: string): string | undefined {
  if (!search.startsWith('?')) return undefined
  const value = new URLSearchParams(search).get('session')
  return value === null || value === '' ? undefined : value
}

/**
 * Extract the `win` window label from a raw query string using standard
 * URLSearchParams semantics. The desktop shell names every window it opens
 * ("main" or "win-<n>"); a browser tab without the parameter is not a shell
 * window and never reports navigation.
 * @param search - the raw query string, typically `window.location.search`
 *   including its leading `?`.
 * @returns the non-empty `win` value, or undefined when the parameter is
 *   absent or empty, or when the input is not a `?`-prefixed query string.
 */
export function windowLabel(search: string): string | undefined {
  if (!search.startsWith('?')) return undefined
  const value = new URLSearchParams(search).get('win')
  return value === null || value === '' ? undefined : value
}
