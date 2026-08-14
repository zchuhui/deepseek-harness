//! Tauri IPC commands for the embedded web UI. They mirror the bridge
//! primitives so a desktop settings page can call the shell directly.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::bridge::pick_directory_on_main;

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
