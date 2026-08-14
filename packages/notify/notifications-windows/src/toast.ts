/**
 * Pure PowerShell toast construction: the WinRT script text and the
 * -EncodedCommand payload. Title, body, and appId are embedded as escaped
 * single-quoted literals, so operator text never reaches a shell quoting
 * boundary.
 * @module @deepseek-ai/dsh-notifications-windows/toast
 */

/** Default AppUserModelID: Windows PowerShell's own, so toasts need no installed app identity. */
export const DEFAULT_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'

/**
 * Escape one value for embedding in a PowerShell single-quoted literal.
 * @param value - raw operator text.
 * @returns the literal-safe value with single quotes doubled.
 */
export function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Build the WinRT toast script: one two-line text toast shown under appId.
 * @param title - toast title.
 * @param body - toast body.
 * @param appId - AppUserModelID to show the toast under.
 * @returns the complete Windows PowerShell 5.1 script text.
 */
export function buildToastScript(title: string, body: string, appId: string): string {
  const t = escapePowerShellLiteral(title)
  const b = escapePowerShellLiteral(body)
  const a = escapePowerShellLiteral(appId)
  return [
    '$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
    '$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]',
    '$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02',
    '$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)',
    `$null = $xml.GetElementsByTagName('text').Item(0).AppendChild($xml.CreateTextNode('${t}'))`,
    `$null = $xml.GetElementsByTagName('text').Item(1).AppendChild($xml.CreateTextNode('${b}'))`,
    '$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)',
    `$null = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${a}').Show($toast)`,
  ].join('\n')
}

/**
 * Encode one script as a PowerShell -EncodedCommand payload.
 * @param script - the script text to encode.
 * @returns the UTF-16LE base64 payload PowerShell expects.
 */
export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}
