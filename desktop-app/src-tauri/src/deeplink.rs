//! Deep links and their URL contracts. The shell accepts `dsh://` (show
//! the main window) and `dsh://session/<id>` (navigate the main window to
//! `http://127.0.0.1:<port>/?session=<id>`). Protocol launches on Windows and
//! Linux arrive as a new instance's argv and are forwarded by the
//! single-instance plugin; macOS delivers them through `deep-link://new-url`
//! events. Notification deep links ride the same URLs.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};

/** The protocol scheme prefix every dsh deep link starts with. */
pub const SCHEME_PREFIX: &str = "dsh://";

/** Managed pending deep link: the latest notification's session id, one slot. */
pub struct PendingDeepLink(pub Mutex<Option<String>>);

impl PendingDeepLink {
    /** The managed state instance. */
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/** The web port managed for URL building. */
pub struct WebPort(pub u16);

/** One parsed deep-link target. */
#[derive(Debug, PartialEq, Eq)]
pub enum DeepLinkTarget {
    /** Show the main window with no specific session. */
    Home,
    /** Navigate to this session. */
    Session(String),
}

/** Whether a session id embeds verbatim into a URL query. */
pub fn is_safe_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 256
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/**
 * Parse one dsh deep link. Unknown schemes, malformed forms, and unsafe
 * session ids return None; the caller leaves such input untouched.
 * @param input - the raw URL string.
 * @returns the target, or None when the input is not a valid dsh link.
 */
pub fn parse_deep_link(input: &str) -> Option<DeepLinkTarget> {
    let rest = input.strip_prefix(SCHEME_PREFIX)?;
    if rest.is_empty() {
        return Some(DeepLinkTarget::Home);
    }
    let id = rest.strip_prefix("session/")?;
    if !is_safe_session_id(id) {
        return None;
    }
    Some(DeepLinkTarget::Session(id.to_string()))
}

/**
 * Build the deep-link URL for one session.
 * @param port - web port.
 * @param session_id - target session id.
 * @returns the URL, or None when the id cannot be embedded safely.
 */
pub fn deep_link_url(port: u16, session_id: &str) -> Option<String> {
    if !is_safe_session_id(session_id) {
        return None;
    }
    Some(format!("http://127.0.0.1:{port}/?session={session_id}"))
}

/**
 * Show, unminimize, and focus one window, then replace its location when the
 * target is a session. A Home target only shows the window; a window the shell
 * has not built yet is a no-op.
 * @param app - application handle.
 * @param label - window label.
 * @param target - the parsed target.
 */
pub fn navigate_window(app: &AppHandle, label: &str, target: &DeepLinkTarget) {
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let DeepLinkTarget::Session(id) = target else {
        return;
    };
    let port = app
        .try_state::<WebPort>()
        .map(|state| state.0)
        .unwrap_or(crate::runtime::DEFAULT_PORT);
    let Some(url) = deep_link_url(port, id) else {
        return;
    };
    let script = format!(
        "window.location.href = {}",
        serde_json::to_string(&url).unwrap_or_else(|_| "null".to_string()),
    );
    let _ = window.eval(&script);
}

/**
 * Navigate the main window to one deep-link target.
 * @param app - application handle.
 * @param target - the parsed target.
 */
pub fn navigate_main(app: &AppHandle, target: &DeepLinkTarget) {
    navigate_window(app, "main", target);
}

/**
 * Handle one raw deep-link URL: parse it, remember session targets as the
 * pending notification deep link, and route it through the window registry.
 * @param app - application handle.
 * @param url - the raw URL string.
 */
pub fn handle_url(app: &AppHandle, url: &str) {
    let Some(target) = parse_deep_link(url) else {
        return;
    };
    if let DeepLinkTarget::Session(id) = &target {
        if let Some(slot) = app.try_state::<PendingDeepLink>() {
            if let Ok(mut guard) = slot.0.lock() {
                *guard = Some(id.clone());
            }
        }
    }
    crate::windows::route_deep_link(app, &target);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_query_url_for_safe_ids() {
        assert_eq!(
            "http://127.0.0.1:3080/?session=sess-9",
            deep_link_url(3080, "sess-9").unwrap()
        );
        assert_eq!(
            "http://127.0.0.1:3080/?session=abc_123",
            deep_link_url(3080, "abc_123").unwrap()
        );
    }

    #[test]
    fn rejects_unsafe_or_empty_ids() {
        assert_eq!(None, deep_link_url(3080, ""));
        assert_eq!(None, deep_link_url(3080, "a b"));
        assert_eq!(None, deep_link_url(3080, "a&b=c"));
        assert_eq!(None, deep_link_url(3080, "a<b>"));
    }

    #[test]
    fn parses_home_and_session_links() {
        assert_eq!(Some(DeepLinkTarget::Home), parse_deep_link("dsh://"));
        assert_eq!(
            Some(DeepLinkTarget::Session("sess-9".to_string())),
            parse_deep_link("dsh://session/sess-9"),
        );
        assert_eq!(
            Some(DeepLinkTarget::Session("abc_123".to_string())),
            parse_deep_link("dsh://session/abc_123"),
        );
    }

    #[test]
    fn rejects_malformed_or_unsafe_links() {
        assert_eq!(None, parse_deep_link("http://example.com/session/a"));
        assert_eq!(None, parse_deep_link("dsh://session/"));
        assert_eq!(None, parse_deep_link("dsh://session/a b"));
        assert_eq!(None, parse_deep_link("dsh://session/a/b"));
        assert_eq!(None, parse_deep_link("dsh://session/a?x=y"));
        assert_eq!(None, parse_deep_link("dsh://other"));
    }
}
