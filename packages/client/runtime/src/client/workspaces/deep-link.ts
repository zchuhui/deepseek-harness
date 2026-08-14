/**
 * Deep-link query parsing for the browser client. The desktop shell navigates
 * the main window to `/?session=<sessionId>`; this module extracts that
 * target from the raw `location.search` string so the runtime can open it at
 * startup.
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
