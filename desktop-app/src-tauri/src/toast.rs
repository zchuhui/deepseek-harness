//! Windows toast with protocol activation: title and body render through
//! Windows PowerShell 5.1 WinRT interop, and an optional deep-link launch
//! makes a click activate `dsh://session/<id>` — which the protocol handler
//! routes back into the running shell. Values are embedded as escaped
//! single-quoted literals, so operator text never reaches a shell quoting
//! boundary (the same pattern as packages/notify/notifications-windows).

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

/** Fallback AppUserModelID: Windows PowerShell's own, so toasts still show when the shell identity is not registered. */
pub const POWERSHELL_APP_ID: &str =
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

/** The AppUserModelID the shell shows toasts under, chosen at boot: the
 * shell's own identity once the Start Menu shortcut registers it, Windows
 * PowerShell's otherwise. */
pub struct ToastAppId(pub String);

/**
 * Escape one value for XML text content: the four markup-significant
 * characters become entities. Single quotes stay untouched; the PowerShell
 * literal step doubles them next.
 * @param value - raw operator text.
 * @returns the XML-safe value.
 */
pub fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/**
 * Escape one value for embedding in a PowerShell single-quoted literal.
 * @param value - XML-safe text.
 * @returns the literal-safe value with single quotes doubled.
 */
pub fn escape_powershell_literal(value: &str) -> String {
    value.replace('\'', "''")
}

/**
 * Build the toast XML: a two-line text toast, plus protocol activation when a
 * launch URL is given.
 * @param title - toast title.
 * @param body - toast body.
 * @param launch - the `dsh://` URL a click activates, or None for a plain toast.
 * @returns the complete toast XML document.
 */
pub fn build_toast_xml(title: &str, body: &str, launch: Option<&str>) -> String {
    let activation = match launch {
        Some(url) => format!(" activationType=\"protocol\" launch=\"{url}\""),
        None => String::new(),
    };
    format!(
        "<toast{activation}><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>",
        escape_xml(title),
        escape_xml(body),
    )
}

/**
 * Build the complete PowerShell script that shows one toast.
 * @param xml - the toast XML document.
 * @param app_id - AppUserModelID to show the toast under.
 * @returns the complete Windows PowerShell 5.1 script text.
 */
pub fn build_toast_script(xml: &str, app_id: &str) -> String {
    let xml_literal = escape_powershell_literal(xml);
    let app_literal = escape_powershell_literal(app_id);
    [
        "$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]",
        "$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]",
        "$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()",
        &format!("$xml.LoadXml('{xml_literal}')"),
        "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
        &format!("$null = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{app_literal}').Show($toast)"),
    ]
    .join("\n")
}

/**
 * Encode one script as a PowerShell -EncodedCommand payload.
 * @param script - the script text to encode.
 * @returns the UTF-16LE base64 payload PowerShell expects.
 */
pub fn encode_powershell_command(script: &str) -> String {
    let bytes: Vec<u8> = script
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    BASE64.encode(bytes)
}

/**
 * Spawn one toast through the inbox PowerShell. The child runs without a
 * console window and the caller never waits for it.
 * @param title - toast title.
 * @param body - toast body.
 * @param launch - the `dsh://` URL a click activates, or None for a plain toast.
 * @param app_id - AppUserModelID to show the toast under.
 * @returns the spawn outcome; Ok means the launcher started, not that the OS
 *   displayed the toast.
 */
pub fn show_toast(
    title: &str,
    body: &str,
    launch: Option<&str>,
    app_id: &str,
) -> std::io::Result<()> {
    let script = build_toast_script(&build_toast_xml(title, body, launch), app_id);
    let mut command = Command::new("powershell.exe");
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        &encode_powershell_command(&script),
    ]);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    command.spawn().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_xml_markup_characters() {
        assert_eq!("a &amp; b &lt;c&gt; &quot;d", escape_xml("a & b <c> \"d"));
    }

    #[test]
    fn escapes_powershell_single_quotes() {
        assert_eq!("it''s", escape_powershell_literal("it's"));
    }

    #[test]
    fn builds_a_plain_toast_without_activation() {
        assert_eq!(
            "<toast><visual><binding template=\"ToastGeneric\"><text>标题</text><text>正文</text></binding></visual></toast>",
            build_toast_xml("标题", "正文", None),
        );
    }

    #[test]
    fn builds_a_toast_with_protocol_activation() {
        assert_eq!(
            "<toast activationType=\"protocol\" launch=\"dsh://session/sess-9\"><visual><binding template=\"ToastGeneric\"><text>t</text><text>b</text></binding></visual></toast>",
            build_toast_xml("t", "b", Some("dsh://session/sess-9")),
        );
    }

    #[test]
    fn xml_escapes_operator_text_inside_script_literal() {
        let xml = build_toast_xml("a & b <c> 'd'", "正文", None);
        let script = build_toast_script(&xml, POWERSHELL_APP_ID);
        assert!(script.contains("&amp;"));
        assert!(script.contains("&lt;c&gt;"));
        assert!(script.contains("''d''"));
        assert!(!script.contains("a & b <c>"));
    }

    #[test]
    fn encoded_command_decodes_back_to_the_script() {
        let script = build_toast_script(
            &build_toast_xml("t", "b", Some("dsh://session/sess-9")),
            POWERSHELL_APP_ID,
        );
        let decoded_bytes = BASE64.decode(encode_powershell_command(&script)).unwrap();
        let units: Vec<u16> = decoded_bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        let decoded = String::from_utf16(&units).unwrap();
        assert_eq!(script, decoded);
    }
}
