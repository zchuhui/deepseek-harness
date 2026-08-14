import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ManualUpdater, resolveSpec } from '../src/index.ts'

describe('resolveSpec', () => {
  it('defaults the channel to manual and the version to not installed', () => {
    expect(resolveSpec({})).toEqual({ channel: 'manual', currentVersion: null })
  })

  it('prefers explicit config over the defaults', () => {
    expect(resolveSpec({ channel: 'stable', currentVersion: '1.2.3' }))
      .toEqual({ channel: 'stable', currentVersion: '1.2.3' })
  })

  it('rejects an invalid channel at resolution', () => {
    expect(() => resolveSpec({ channel: 'bad channel' })).toThrow(TypeError)
  })
})

describe('ManualUpdater provider', () => {
  it('reports a not-installed snapshot before any check', async () => {
    const ctx = new Context()
    await ctx.plugin(ManualUpdater)

    expect(ctx.updater.state()).toEqual({ channel: 'manual', currentVersion: null })
    await ctx.fiber.dispose()
  })

  it('reports configured channel and version, and check marks it already-latest', async () => {
    const ctx = new Context()
    await ctx.plugin(ManualUpdater, { channel: 'stable', currentVersion: '1.2.3' })

    expect(ctx.updater.state()).toEqual({ channel: 'stable', currentVersion: '1.2.3' })
    const checked = await ctx.updater.check()
    expect(checked).toMatchObject({
      channel: 'stable',
      currentVersion: '1.2.3',
      available: null,
    })
    expect(checked.checkedAt).toBeTypeOf('number')
    expect(ctx.updater.state()).toMatchObject({
      channel: 'stable',
      currentVersion: '1.2.3',
      available: null,
    })
    expect(ctx.updater.state().checkedAt).toBeTypeOf('number')
    await ctx.fiber.dispose()
  })

  it('refuses to apply any update with a clear error', async () => {
    const ctx = new Context()
    await ctx.plugin(ManualUpdater)

    await expect(ctx.updater.apply('2.0.0')).rejects.toThrow('manual updater cannot apply updates; compose a real updater provider')
    await ctx.fiber.dispose()
  })

  it('removes the service with its fiber', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ManualUpdater)
    expect(ctx.get('updater')).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('updater')).toBeUndefined()
  })
})
