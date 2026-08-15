//! DeepSeek Harness desktop shell (Tauri 2). Boot order: bridge -> local
//! dsh web runtime -> main window -> tray. The window loads the loopback
//! URL instead of bundled assets; frontend-dist exists only to satisfy the
//! Tauri build.
//!
//! Deep links: the shell owns the `dsh://` protocol (Windows/Linux register
//! it through the deep-link plugin at every boot). A protocol launch on
//! Windows/Linux spawns a second process whose argv carries the URL; the
//! single-instance plugin forwards that argv into the first process. macOS
//! delivers links through `deep-link://new-url` events instead.

#[cfg(windows)]
mod aumid;
mod bridge;
mod commands;
mod deeplink;
mod runtime;
mod settings;
mod toast;
mod tray;
mod updater;
mod windows;

#[cfg(target_os = "macos")]
use tauri::Listener;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

fn main() {
    tauri::Builder::default()
        // Single instance first: later protocol launches are forwarded into this
        // process, and a plain relaunch just shows the main window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv
                .iter()
                .find(|arg| arg.starts_with(deeplink::SCHEME_PREFIX))
            {
                deeplink::handle_url(app, url);
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(tray::QuitFlag::new())
        .manage(deeplink::PendingDeepLink::new())
        .manage(updater::UpdaterStateCache::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::toast,
            commands::pick_directory,
            commands::get_settings,
            commands::set_settings
        ])
        .setup(|app| {
            let port = std::env::var(runtime::ENV_PORT)
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(runtime::DEFAULT_PORT);
            let bridge_port = std::env::var(bridge::ENV_BRIDGE_PORT)
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(bridge::DEFAULT_BRIDGE_PORT);

            // Load shell settings before anything consumes them; a corrupt
            // document fails loud with the error window instead of guessed behavior.
            let settings_dir = app
                .path()
                .app_config_dir()
                .map_err(|error| format!("配置目录不可用: {error}"))?;
            let settings_file = settings::settings_path(&settings_dir);
            let settings = match settings::load(&settings_file) {
                Ok(settings) => settings,
                Err(error) => {
                    eprintln!("dsh-desktop: {error}");
                    let window = WebviewWindowBuilder::new(
                        app,
                        windows::MAIN_LABEL,
                        WebviewUrl::App("error.html".into()),
                    )
                    .title("DeepSeek Harness")
                    .inner_size(720.0, 480.0)
                    .build()?;
                    let _ = window;
                    return Ok(());
                }
            };
            app.manage(settings::SettingsState::new(settings, settings_file));

            // Windows toast identity: the Start Menu shortcut registers the
            // shell's AppUserModelID, and toasts show under it. Registration
            // failure falls back to the PowerShell identity used before.
            let toast_app_id = {
                #[cfg(windows)]
                {
                    let app_id = app.config().identifier.clone();
                    match crate::aumid::ensure_shortcut(
                        &std::env::current_exe().unwrap_or_default(),
                        &app_id,
                    ) {
                        Ok(_) => app_id,
                        Err(error) => {
                            eprintln!("dsh-desktop: toast identity registration failed: {error}");
                            crate::toast::POWERSHELL_APP_ID.to_string()
                        }
                    }
                }
                #[cfg(not(windows))]
                {
                    app.config().identifier.clone()
                }
            };
            app.manage(crate::toast::ToastAppId(toast_app_id));

            let token = bridge::generate_token();
            let bridge_url = format!("http://127.0.0.1:{bridge_port}");
            let handle = app.handle().clone();
            let _bridge = bridge::Bridge::start(handle, bridge_port, token.clone())?;
            std::mem::forget(_bridge); // lives for the application lifetime

            app.manage(deeplink::WebPort(port));

            // Register the dsh protocol before reading boot links, so a
            // protocol launch of the primary instance sees its link.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                app.deep_link()
                    .register_all()
                    .map_err(|error| format!("deep link registration failed: {error}"))?;
            }
            // The primary instance may itself have been launched through a dsh
            // link (Windows/Linux pass it as the only argv entry). The first
            // target chooses the main window's URL; any later target routes
            // through the window registry.
            let boot_urls: Vec<String> = app
                .deep_link()
                .get_current()
                .ok()
                .flatten()
                .map(|urls| urls.iter().map(|url| url.as_str().to_string()).collect())
                .unwrap_or_default();
            let boot_target = boot_urls
                .first()
                .and_then(|url| deeplink::parse_deep_link(url));
            if let Some(deeplink::DeepLinkTarget::Session(id)) = &boot_target {
                if let Some(slot) = app.try_state::<deeplink::PendingDeepLink>() {
                    if let Ok(mut guard) = slot.0.lock() {
                        *guard = Some(id.clone());
                    }
                }
            }

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
                    let window = WebviewWindowBuilder::new(
                        app,
                        "main",
                        WebviewUrl::App("error.html".into()),
                    )
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

            // The main window's URL always carries its label, so the web client
            // can report which session it shows back through the bridge.
            let session = match &boot_target {
                Some(deeplink::DeepLinkTarget::Session(id)) => Some(id.as_str()),
                _ => None,
            };
            let main_url = windows::window_url(port, session, windows::MAIN_LABEL);
            let url: WebviewUrl =
                WebviewUrl::External(main_url.parse().expect("loopback url parses"));
            let window = WebviewWindowBuilder::new(app, windows::MAIN_LABEL, url)
                .title("DeepSeek Harness")
                .inner_size(1280.0, 800.0)
                .min_inner_size(940.0, 600.0)
                .build()?;
            let _ = window;

            app.manage(windows::WindowRegistry::new());
            if let Some(deeplink::DeepLinkTarget::Session(id)) = &boot_target {
                app.state::<windows::WindowRegistry>()
                    .assign(windows::MAIN_LABEL, Some(id.clone()));
            }
            tray::build(&app.handle().clone())?;

            for url in boot_urls.iter().skip(1) {
                deeplink::handle_url(app.handle(), url);
            }
            // macOS delivers links as events instead of argv.
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                        for url in urls {
                            deeplink::handle_url(&handle, &url);
                        }
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building dsh-desktop")
        .run(|app, event| match event {
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::Destroyed,
                ..
            } => {
                app.state::<windows::WindowRegistry>().unregister(&label);
            }
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                if label == windows::MAIN_LABEL
                    && !app
                        .state::<tray::QuitFlag>()
                        .0
                        .load(std::sync::atomic::Ordering::Relaxed)
                {
                    if app
                        .state::<settings::SettingsState>()
                        .snapshot()
                        .close_to_tray
                    {
                        api.prevent_close();
                        if let Some(window) = app.get_webview_window(windows::MAIN_LABEL) {
                            let _ = window.hide();
                        }
                    } else {
                        // Closing the main window quits when close-to-tray is off.
                        app.state::<tray::QuitFlag>()
                            .0
                            .store(true, std::sync::atomic::Ordering::Relaxed);
                        app.exit(0);
                    }
                }
            }
            _ => {}
        });
}
