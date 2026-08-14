//! Pending deep link and its URL contract: the shell navigates the main
//! window to `http://127.0.0.1:<port>/?session=<id>` when a notification
//! is opened (the tray item today; OS toast-click activation arrives with
//! the installer milestone, which registers the AppUserModelID shortcut
//! that Windows activation requires).

use std::sync::Mutex;

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

/** Whether a session id embeds verbatim into a URL query. */
pub fn is_safe_session_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 256 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_query_url_for_safe_ids() {
        assert_eq!("http://127.0.0.1:3080/?session=sess-9", deep_link_url(3080, "sess-9").unwrap());
        assert_eq!("http://127.0.0.1:3080/?session=abc_123", deep_link_url(3080, "abc_123").unwrap());
    }

    #[test]
    fn rejects_unsafe_or_empty_ids() {
        assert_eq!(None, deep_link_url(3080, ""));
        assert_eq!(None, deep_link_url(3080, "a b"));
        assert_eq!(None, deep_link_url(3080, "a&b=c"));
        assert_eq!(None, deep_link_url(3080, "a<b>"));
    }
}
