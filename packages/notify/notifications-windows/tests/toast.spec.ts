import { describe, expect, it } from 'vitest'
import { buildToastScript, DEFAULT_APP_ID, encodePowerShellCommand, escapePowerShellLiteral } from '../src/toast.ts'

describe('PowerShell toast construction', () => {
  it('doubles single quotes for literal embedding', () => {
    expect(escapePowerShellLiteral("it's")).toBe("it''s")
    expect(escapePowerShellLiteral('plain')).toBe('plain')
  })

  it('embeds title, body, and appId as escaped literals', () => {
    const script = buildToastScript("任务完成 it's", 'bash: pnpm test', DEFAULT_APP_ID)
    expect(script).toContain('[Windows.UI.Notifications.ToastTemplateType]::ToastText02')
    expect(script).toContain("CreateTextNode('任务完成 it''s')")
    expect(script).toContain("CreateTextNode('bash: pnpm test')")
    expect(script).toContain("CreateToastNotifier('" + DEFAULT_APP_ID + "')")
  })

  it('encodes a script as UTF-16LE base64 for -EncodedCommand', () => {
    const script = "Write-Output 'ok'"
    const encoded = encodePowerShellCommand(script)
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe(script)
  })
})
