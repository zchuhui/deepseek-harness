//! System tray: show-window and quit menu; the main window hides instead of
//! closing until quit is chosen.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

/** Whether the user chose quit (window close hides instead of exiting). */
pub struct QuitFlag(pub std::sync::atomic::AtomicBool);

impl QuitFlag {
    /** The shared flag read by the window-close handler. */
    pub fn new() -> Self {
        Self(std::sync::atomic::AtomicBool::new(false))
    }
}

/**
 * Build the tray icon with its menu. The returned handle lives in managed
 * state for the application lifetime.
 * @param app - application handle.
 * @returns an error string when the tray cannot be built.
 */
pub fn build(app: &AppHandle) -> Result<(), String> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>).map_err(|e| e.to_string())?;
    let open_notification = MenuItem::with_id(app, "open-notification", "打开最新通知", true, None::<&str>).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&show, &open_notification, &quit]).map_err(|e| e.to_string())?;

    let mut builder = TrayIconBuilder::new();
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    let tray = builder
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "open-notification" => {
                let target = {
                    let mut result = None;
                    if let Some(slot) = app.try_state::<crate::deeplink::PendingDeepLink>() {
                        if let Ok(guard) = slot.0.lock() {
                            result = guard.clone();
                        }
                    }
                    result
                };
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    if let Some(session) = target {
                        let port = app
                            .try_state::<crate::deeplink::WebPort>()
                            .map(|state| state.0)
                            .unwrap_or(crate::runtime::DEFAULT_PORT);
                        if let Some(url) = crate::deeplink::deep_link_url(port, &session) {
                            let script = format!(
                                "window.location.href = {}",
                                serde_json::to_string(&url).unwrap_or_else(|_| "null".to_string()),
                            );
                            let _ = window.eval(&script);
                        }
                    }
                }
            }
            "quit" => {
                app.state::<QuitFlag>().0.store(true, std::sync::atomic::Ordering::Relaxed);
                app.exit(0);
            }
            _ => {},
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    app.manage(tray);
    Ok(())
}
