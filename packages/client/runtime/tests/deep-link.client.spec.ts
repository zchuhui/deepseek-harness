import { describe, expect, it } from 'vitest'
import { deepLinkSessionId, windowLabel } from '../src/client/workspaces/deep-link.ts'

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

describe('windowLabel', () => {
  it('returns the win value when present and non-empty', () => {
    expect(windowLabel('?win=main')).toBe('main')
    expect(windowLabel('?win=win-0')).toBe('win-0')
  })

  it('returns undefined when the win parameter is absent or empty', () => {
    expect(windowLabel('?')).toBeUndefined()
    expect(windowLabel('?foo=bar')).toBeUndefined()
    expect(windowLabel('?win=')).toBeUndefined()
  })

  it('extracts win among other parameters', () => {
    expect(windowLabel('?session=abc&win=main')).toBe('main')
    expect(windowLabel('?win=win-1&foo=2')).toBe('win-1')
  })

  it('returns undefined when the input has no leading question mark', () => {
    expect(windowLabel('')).toBeUndefined()
    expect(windowLabel('win=main')).toBeUndefined()
  })
})
