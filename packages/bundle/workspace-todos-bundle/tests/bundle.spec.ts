/** Optional workspace-todos bundle declaration. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('workspace-todos bundle', () => {
  it('declares an opt-in patch with durable, Agent, and browser rows', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'), {
      schema: entryListSchema,
    }) as { insert?: Array<{ id: string; name: string; config?: Record<string, unknown> }> }[]
    const rows = parsed.flatMap(patch => patch.insert ?? [])
    expect(rows).toEqual([
      {
        id: 'workspace-todos',
        name: '@deepseek-ai/dsh-workspace-todos',
        config: { maxContentBytes: 4096 },
      },
      {
        id: 'workspace-todos-agent',
        name: '@deepseek-ai/dsh-workspace-todos-agent',
        config: { statusUpdateApproval: 'ask' },
      },
      { id: 'ui-workspace-todos', name: '@deepseek-ai/dsh-client-ui-workspace-todos' },
    ])
  })
})
