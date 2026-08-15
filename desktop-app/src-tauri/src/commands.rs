//! Tauri IPC commands for the embedded web UI. They mirror the bridge
//! primitives so a desktop settings page can call the shell directly.

use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::bridge::pick_directory_on_main;
use crate::settings::{apply, Settings, SettingsState};

/**
 * Basic shell facts for the web UI.
 * @returns shell identity and version.
 */
#[tauri::command]
pub fn get_state() -> serde_json::Value {
    serde_json::json!({
        "shell": "dsh-desktop",
        "version": env!("CARGO_PKG_VERSION"),
    })
}

/**
 * Show one native notification.
 * @param title - toast title.
 * @param body - toast body.
 */
#[tauri::command]
pub fn toast(app: AppHandle, title: String, body: String) {
    let _ = app.notification().builder().title(title).body(body).show();
}

/**
 * Open one native directory chooser.
 * @returns the chosen path, or null on cancel or failure.
 */
#[tauri::command]
pub fn pick_directory(app: AppHandle) -> Option<String> {
    pick_directory_on_main(&app).ok().flatten()
}

/**
 * The current shell settings document.
 * @returns the camelCase wire form the settings page renders.
 */
#[tauri::command]
pub fn get_settings(state: State<SettingsState>) -> serde_json::Value {
    let snapshot = state.snapshot();
    serde_json::json!({
        "closeToTray": snapshot.close_to_tray,
        "launchAtLogin": snapshot.launch_at_login,
    })
}

/**
 * Replace shell settings with a partial document. Missing fields keep their
 * current values; OS side effects run before persistence, and the updated
 * document is the answer. Errors reject the invoke with the message.
 * @param close_to_tray - optional new close-to-tray value.
 * @param launch_at_login - optional new launch-at-login value.
 * @returns the updated document.
 */
#[tauri::command]
pub fn set_settings(
    state: State<SettingsState>,
    close_to_tray: Option<bool>,
    launch_at_login: Option<bool>,
) -> Result<serde_json::Value, String> {
    let current = state.snapshot();
    let next = Settings {
        close_to_tray: close_to_tray.unwrap_or(current.close_to_tray),
        launch_at_login: launch_at_login.unwrap_or(current.launch_at_login),
    };
    apply(&state, &next)?;
    Ok(serde_json::json!({
        "closeToTray": next.close_to_tray,
        "launchAtLogin": next.launch_at_login,
    }))
}
