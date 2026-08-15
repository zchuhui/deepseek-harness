/** invariant companion: registers under the package name; node-half apply is a no-op. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply as nodeApply } from '@deepseek-ai/dsh-client-ui-settings-desktop'
import * as DesktopInvariant from '@deepseek-ai/dsh-client-ui-settings-desktop/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(DesktopInvariant).await()).resolves.toBeDefined()
  })

  it('node-half apply tolerates any host context', () => {
    nodeApply(new Context())
  })
})
