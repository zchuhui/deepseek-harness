import { describe, expect, it } from 'vitest'
import { deepLinkSessionId } from '../src/client/workspaces/deep-link.ts'

describe('deepLinkSessionId', () => {
  it('returns the session value when present and non-empty', () => {
    expect(deepLinkSessionId('?session=abc')).toBe('abc')
  })

  it('returns undefined when the session parameter is absent', () => {
    expect(deepLinkSessionId('?')).toBeUndefined()
    expect(deepLinkSessionId('?foo=bar')).toBeUndefined()
  })

  it('returns undefined when the session value is empty', () => {
    expect(deepLinkSessionId('?session=')).toBeUndefined()
  })

  it('extracts session among other parameters', () => {
    expect(deepLinkSessionId('?foo=1&session=abc&bar=2')).toBe('abc')
  })

  it('returns undefined when the input has no leading question mark', () => {
    expect(deepLinkSessionId('')).toBeUndefined()
    expect(deepLinkSessionId('session=abc')).toBeUndefined()
  })

  it('keeps standard URLSearchParams semantics for repeated and encoded values', () => {
    expect(deepLinkSessionId('?session=abc&session=def')).toBe('abc')
    expect(deepLinkSessionId('?session=%61bc')).toBe('abc')
  })
})
