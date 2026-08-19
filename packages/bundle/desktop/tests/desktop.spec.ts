/**
 * The bundle's substance is its patch file: the `dsh.bundle.patch` manifest
 * field must name a real, parseable patch list that mounts the notification
 * rows as declared dependencies.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'

describe('dsh-desktop bundle', () => {
  it('declares a parseable patch list through the dsh.bundle.patch manifest field', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
    )
    expect(Array.isArray(parsed)).toBe(true)
    const rows = (parsed as { insert?: { id?: string; config?: Record<string, unknown> }[] }[]).flatMap(
      patch => patch.insert ?? [],
    )
    expect(rows.some(row => row.id === 'notify-events')).toBe(true)
    expect(rows.some(row => row.id === 'notifications-desktop')).toBe(true)
    expect(rows.find(row => row.id === 'notify-events')?.config?.['turnCompleted']).toBe(true)
    // The mounted plugins are declared dependencies (verify-cordis-config contract).
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-notify-events')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-notifications-desktop')
  })
})
