//! DeepSeek Harness desktop shell (Tauri 2). Boot order: bridge -> local
//! dsh web runtime -> main window -> tray. The window loads the loopback
//! URL instead of bundled assets; frontend-dist exists only to satisfy the
//! Tauri build.

mod bridge;
mod commands;
mod runtime;
mod tray;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(tray::QuitFlag::new())
        .invoke_handler(tauri::generate_handler![commands::get_state, commands::toast, commands::pick_directory])
        .setup(|app| {
            let port = std::env::var(runtime::ENV_PORT)
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(runtime::DEFAULT_PORT);
            let bridge_port = std::env::var(bridge::ENV_BRIDGE_PORT)
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(bridge::DEFAULT_BRIDGE_PORT);

            let token = bridge::generate_token();
            let bridge_url = format!("http://127.0.0.1:{bridge_port}");
            let handle = app.handle().clone();
            let _bridge = bridge::Bridge::start(handle, bridge_port, token.clone())?;
            std::mem::forget(_bridge); // lives for the application lifetime

            let start_dir = std::env::current_dir().unwrap_or_default();
            let spec = runtime::resolve_launch_spec(port, &start_dir)?;
            let mut manager = runtime::RuntimeManager::new(port, spec);
            let env = [
                (bridge::ENV_BRIDGE_URL, bridge_url.as_str()),
                (bridge::ENV_BRIDGE_TOKEN, token.as_str()),
            ];
            let outcome = match manager.start(&env) {
                Ok(outcome) => outcome,
                Err(error) => {
                    eprintln!("dsh-desktop: {error}");
                    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("error.html".into()))
                        .title("DeepSeek Harness")
                        .inner_size(720.0, 480.0)
                        .build()?;
                    std::mem::forget(manager); // no child was spawned
                    let _ = window;
                    return Ok(());
                }
            };
            if outcome == runtime::StartOutcome::Spawned {
                // Keep the manager alive so the spawned child dies with the shell.
                app.manage(manager);
            } else {
                std::mem::forget(manager); // a reused service must outlive the shell
            }

            let url: WebviewUrl = WebviewUrl::External(format!("http://127.0.0.1:{port}").parse().expect("loopback url parses"));
            let window = WebviewWindowBuilder::new(app, "main", url)
                .title("DeepSeek Harness")
                .inner_size(1280.0, 800.0)
                .min_inner_size(940.0, 600.0)
                .build()?;
            let _ = window;

            tray::build(&app.handle().clone())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building dsh-desktop")
        .run(|app, event| {
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } = event
            {
                if label == "main" && !app.state::<tray::QuitFlag>().0.load(std::sync::atomic::Ordering::Relaxed) {
                    api.prevent_close();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }
        });
}
