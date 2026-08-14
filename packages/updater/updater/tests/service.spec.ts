import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { UpdateService, updateChannel } from '../src/index.ts'
import type { UpdateState } from '../src/index.ts'

/** Minimal concrete updater: one canned snapshot. The seam owns the contract only. */
class StubUpdater extends UpdateService {
  override state(): UpdateState {
    return { channel: updateChannel('stub'), currentVersion: '1.0.0' }
  }

  override check(_signal?: AbortSignal): Promise<UpdateState> {
    return Promise.resolve(this.state())
  }

  override apply(_version: string, _signal?: AbortSignal): Promise<void> {
    return Promise.resolve()
  }
}

describe('updateChannel', () => {
  it('brands non-empty, single-line, whitespace-free names', () => {
    expect(updateChannel('manual')).toBe('manual')
    expect(updateChannel('stable-channel')).toBe('stable-channel')
    expect(updateChannel('v1.2.3')).toBe('v1.2.3')
  })

  it('rejects empty, multi-line, and whitespace-bearing names', () => {
    for (const invalid of ['', 'with space', 'with\ttab', 'line\nbreak', 'line\rreturn']) {
      expect(() => updateChannel(invalid)).toThrow(TypeError)
    }
  })
})

describe('UpdateService seam', () => {
  it('a concrete subclass registers as ctx.updater and serves the abstract API', async () => {
    const ctx = new Context()
    await ctx.plugin(StubUpdater)

    expect(ctx.updater.state()).toEqual({ channel: 'stub', currentVersion: '1.0.0' })
    await expect(ctx.updater.check()).resolves.toEqual({ channel: 'stub', currentVersion: '1.0.0' })
    await expect(ctx.updater.apply('2.0.0')).resolves.toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('loading a second implementation throws (one updater service per context)', async () => {
    const ctx = new Context()
    await ctx.plugin(StubUpdater)
    class SecondUpdater extends StubUpdater {}
    await expect(ctx.plugin(SecondUpdater)).rejects.toThrow(/service "updater" has been registered/)
    await ctx.fiber.dispose()
  })

  it('mounting the abstract seam directly fails loudly at load', async () => {
    const ctx = new Context()
    await expect(ctx.plugin(UpdateService as unknown as typeof StubUpdater))
      .rejects.toThrow(/abstract update seam; load an implementation such as @deepseek-ai\/dsh-updater-manual/)
    await ctx.fiber.dispose()
  })
})
