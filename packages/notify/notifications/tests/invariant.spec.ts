import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as companion from '../src/invariant.ts'

describe('notifications invariant companion', () => {
  it('registers the package companion and reserves the name against duplicates', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(companion)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-notifications', () => {})
    }).toThrow(/already registered/)
    await ctx.fiber.dispose()
  })
})
