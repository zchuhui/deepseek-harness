import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as WorkspaceTodosInvariant from '../src/invariant.ts'
import { harness } from './helpers.ts'

describe('workspace todos invariant companion', () => {
  it('removes its registry contribution when its fiber is disposed (HMR safety)', async () => {
    const bench = await harness()
    try {
      await bench.ctx.plugin(InvariantRegistry)
      const fiber = await bench.ctx.plugin(WorkspaceTodosInvariant)

      expect(() => {
        bench.ctx.invariants.register('@deepseek-ai/dsh-workspace-todos', () => {})
      }).toThrow(/already registered/u)

      await fiber.dispose()
      await expect(bench.ctx.plugin(WorkspaceTodosInvariant).await()).resolves.toBeDefined()
    } finally {
      await bench.dispose()
    }
  })
})
