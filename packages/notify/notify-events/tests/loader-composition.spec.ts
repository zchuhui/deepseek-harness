import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import TerminalNotifications from '@deepseek-ai/dsh-notifications-terminal'
import * as bridge from '../src/index.ts'

let root: string | undefined
let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('notify-events through a real Loader composition', () => {
  it('bridges a settled job to the terminal provider', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-notify-events-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-notifications-terminal'",
      "- name: '@deepseek-ai/dsh-jobs-local'",
      "- name: '@deepseek-ai/dsh-notify-events'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier === '@deepseek-ai/dsh-notifications-terminal') return TerminalNotifications
        if (specifier === '@deepseek-ai/dsh-jobs-local') return LocalJobRegistry
        if (specifier === '@deepseek-ai/dsh-notify-events') return bridge
        throw new Error('unexpected Loader import: ' + specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    expect(context.notifications).toBeInstanceOf(TerminalNotifications)
    const info = vi.spyOn(context.logger, 'info')
    context.jobs.attachController('loader-test')
    let settle!: (outcome: { status: 'completed' }) => void
    context.jobs.start({
      kind: 'bash',
      label: 'bash: pnpm test',
      run: () => ({
        cancel: () => {},
        done: new Promise((resolve) => { settle = resolve }),
      }),
    })
    settle({ status: 'completed' })
    await vi.waitFor(() => { expect(info).toHaveBeenCalledWith('[dsh] %s: %s', '后台任务完成', 'bash: pnpm test') })
  })
})
