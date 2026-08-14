import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { buildToastScript, DEFAULT_APP_ID } from '../src/toast.ts'
import WindowsNotifications, { notifyWindows, resolveSpec } from '../src/index.ts'

describe('resolveSpec', () => {
  it('defaults the AppUserModelID and executable', () => {
    expect(resolveSpec({})).toEqual({ appId: DEFAULT_APP_ID, powershell: 'powershell.exe' })
  })

  it('honors explicit values', () => {
    expect(resolveSpec({ appId: 'custom', powershell: 'pwsh' })).toEqual({ appId: 'custom', powershell: 'pwsh' })
  })
})

describe('notifyWindows', () => {
  it('spawns PowerShell with the encoded toast script', async () => {
    const calls: [string, string[]][] = []
    const runner = vi.fn(async (command: string, args: string[]) => { calls.push([command, args]) }) as unknown as NativeCommandRunner
    await notifyWindows(runner, resolveSpec({}), { kind: 'turn-failed', title: '回合失败', body: 'LLM 请求失败' })
    expect(calls).toHaveLength(1)
    const [command, args] = calls[0]!
    expect(command).toBe('powershell.exe')
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    const script = Buffer.from(args[3]!, 'base64').toString('utf16le')
    expect(script).toBe(buildToastScript('回合失败', 'LLM 请求失败', DEFAULT_APP_ID))
  })

  it('rejects on a non-win32 platform', async () => {
    const runner = vi.fn() as unknown as NativeCommandRunner
    await expect(notifyWindows(runner, resolveSpec({}), { kind: 'job-settled', title: 't', body: 'b' }, 'linux')).rejects.toThrow('win32')
    expect(runner).not.toHaveBeenCalled()
  })

  it('propagates runner failure', async () => {
    const runner = vi.fn(async () => { throw new Error('spawn failed') }) as unknown as NativeCommandRunner
    await expect(notifyWindows(runner, resolveSpec({}), { kind: 'job-settled', title: 't', body: 'b' })).rejects.toThrow('spawn failed')
  })
})

describe('WindowsNotifications', () => {
  it('registers as ctx.notifications', async () => {
    const ctx = new Context()
    await ctx.plugin(WindowsNotifications, { appId: 'custom' })
    expect(ctx.notifications).toBeInstanceOf(WindowsNotifications)
    await ctx.fiber.dispose()
  })
})
