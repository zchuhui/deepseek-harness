import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as UpdaterInvariant from '../src/invariant.ts'

describe('updater invariant companion', () => {
  it('registers the package companion and reserves the name against duplicates', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(UpdaterInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-updater', () => {})
    }).toThrow(/already registered/)
    await ctx.fiber.dispose()
  })
})
