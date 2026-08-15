//! Window registry and orchestration: the shell tracks every window it
//! opened (label \u2192 session), opens and focuses windows on demand, and routes
//! deep links to the window that owns the target session — or opens a new one.
//! Labels: \"main\" is the primary window; further windows take \"win-<n>\".

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::deeplink::{DeepLinkTarget, WebPort};

/** Label of the primary window. */
pub const MAIN_LABEL: &str = "main";

/**
 * Managed window registry: one entry per shell-opened window, mapping its
 * label to the session the shell routed it to (None = no specific session).
 * Shell-initiated navigation only; sessions opened through the web GUI are
 * not tracked.
 */
pub struct WindowRegistry {
    map: Mutex<HashMap<String, Option<String>>>,
    counter: AtomicU64,
}

impl WindowRegistry {
    /** The managed state instance, with the main window pre-registered. */
    pub fn new() -> Self {
        let mut map = HashMap::new();
        map.insert(MAIN_LABEL.to_string(), None);
        Self {
            map: Mutex::new(map),
            counter: AtomicU64::new(0),
        }
    }

    /** Whether the registry knows one window label.
     * @param label - label to look up.
     * @returns true when a window with this label is registered.
     */
    pub fn exists(&self, label: &str) -> bool {
        self.map
            .lock()
            .expect("window registry lock held")
            .contains_key(label)
    }

    /**
     * The window label that owns one session, or None.
     * @param session_id - session to look up.
     * @returns the owning label.
     */
    pub fn find_session(&self, session_id: &str) -> Option<String> {
        self.map
            .lock()
            .expect("window registry lock held")
            .iter()
            .find(|(_, session)| session.as_deref() == Some(session_id))
            .map(|(label, _)| label.clone())
    }

    /** Record the session one window was routed to; new labels join the registry. */
    pub fn assign(&self, label: &str, session: Option<String>) {
        self.map
            .lock()
            .expect("window registry lock held")
            .insert(label.to_string(), session);
    }

    /** Drop one window entry after its window is destroyed. */
    pub fn unregister(&self, label: &str) {
        let _ = self
            .map
            .lock()
            .expect("window registry lock held")
            .remove(label);
    }

    /** The next fresh window label, monotonic within one run. */
    pub fn next_label(&self) -> String {
        format!("win-{}", self.counter.fetch_add(1, Ordering::Relaxed))
    }

    /** The complete label \u2192 session snapshot. */
    pub fn snapshot(&self) -> Vec<(String, Option<String>)> {
        self.map
            .lock()
            .expect("window registry lock held")
            .iter()
            .map(|(label, session)| (label.clone(), session.clone()))
            .collect()
    }
}

/**
 * Build the URL one window loads: the session query targets the session, and
 * the win query names the window label.
 * @param port - web port.
 * @param session_id - optional target session.
 * @param label - the window label.
 * @returns the complete loopback URL.
 */
pub fn window_url(port: u16, session_id: Option<&str>, label: &str) -> String {
    match session_id {
        Some(id) => format!("http://127.0.0.1:{port}/?session={id}&win={label}"),
        None => format!("http://127.0.0.1:{port}/?win={label}"),
    }
}

/**
 * Open one new window and register it.
 * @param app - application handle.
 * @param session_id - optional session the window loads; unsafe ids are rejected.
 * @param port - web port.
 * @returns the new window label, or the failure.
 */
pub fn open_window(app: &AppHandle, session_id: Option<&str>, port: u16) -> Result<String, String> {
    if let Some(id) = session_id {
        if !crate::deeplink::is_safe_session_id(id) {
            return Err(format!("unsafe session id {id:?}"));
        }
    }
    let label = app.state::<WindowRegistry>().next_label();
    let url: WebviewUrl = WebviewUrl::External(
        window_url(port, session_id, &label)
            .parse()
            .expect("loopback url parses"),
    );
    WebviewWindowBuilder::new(app, &label, url)
        .title("DeepSeek Harness")
        .inner_size(1280.0, 800.0)
        .min_inner_size(940.0, 600.0)
        .build()
        .map_err(|error| format!("window build failed: {error}"))?;
    app.state::<WindowRegistry>()
        .assign(&label, session_id.map(String::from));
    Ok(label)
}

/**
 * Show, unminimize, and focus one window; unknown labels are a no-op.
 * @param app - application handle.
 * @param label - window label.
 */
pub fn focus_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/**
 * Close one window. The main window hides instead of closing (tray keeps it
 * alive); other windows close for real and their registry entries leave with
 * the Destroyed event.
 * @param app - application handle.
 * @param label - window label.
 * @returns true when the window existed.
 */
pub fn close_window(app: &AppHandle, label: &str) -> bool {
    let Some(window) = app.get_webview_window(label) else {
        return false;
    };
    if label == MAIN_LABEL {
        let _ = window.hide();
    } else {
        let _ = window.close();
    }
    true
}

/**
 * Route one deep-link target to its window: Home focuses the main window, a
 * session focuses the window that owns it or opens a new one.
 * @param app - application handle.
 * @param target - the parsed target.
 */
pub fn route_deep_link(app: &AppHandle, target: &DeepLinkTarget) {
    match target {
        DeepLinkTarget::Home => crate::deeplink::navigate_main(app, target),
        DeepLinkTarget::Session(id) => {
            let owning = app.state::<WindowRegistry>().find_session(id);
            match owning {
                Some(label) => crate::deeplink::navigate_window(app, &label, target),
                None => {
                    let port = app
                        .try_state::<WebPort>()
                        .map(|state| state.0)
                        .unwrap_or(crate::runtime::DEFAULT_PORT);
                    let _ = open_window(app, Some(id), port);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_window_urls_with_and_without_a_session() {
        assert_eq!(
            "http://127.0.0.1:3080/?session=abc&win=win-0",
            window_url(3080, Some("abc"), "win-0"),
        );
        assert_eq!(
            "http://127.0.0.1:3080/?win=win-1",
            window_url(3080, None, "win-1")
        );
    }

    #[test]
    fn registry_finds_the_window_owning_a_session() {
        let registry = WindowRegistry::new();
        registry.assign("win-0", Some("sess-9".to_string()));
        assert_eq!(Some("win-0".to_string()), registry.find_session("sess-9"));
        assert_eq!(None, registry.find_session("other"));
    }

    #[test]
    fn registry_unregister_drops_the_entry() {
        let registry = WindowRegistry::new();
        registry.assign("win-0", Some("sess-9".to_string()));
        registry.unregister("win-0");
        assert_eq!(None, registry.find_session("sess-9"));
        assert!(registry
            .snapshot()
            .iter()
            .all(|(label, _)| label != "win-0"));
    }

    #[test]
    fn labels_increase_monotonically() {
        let registry = WindowRegistry::new();
        assert_eq!("win-0", registry.next_label());
        assert_eq!("win-1", registry.next_label());
    }

    #[test]
    fn registry_starts_with_the_main_window() {
        let registry = WindowRegistry::new();
        let snapshot = registry.snapshot();
        assert_eq!(vec![(MAIN_LABEL.to_string(), None)], snapshot);
    }

    #[test]
    fn registry_reports_window_membership() {
        let registry = WindowRegistry::new();
        assert!(registry.exists(MAIN_LABEL));
        assert!(!registry.exists("win-0"));
        registry.assign("win-0", None);
        assert!(registry.exists("win-0"));
    }
}
