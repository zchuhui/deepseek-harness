//! Host-side bridge: a token-guarded loopback HTTP server through which
//! dsh host providers reach the shell's native primitives (toast, directory
//! picker, keychain, updater stub). Contract documented in README.md.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;
use tiny_http::{Header, Method, Response, Server, StatusCode};

use crate::updater::{AvailableUpdate, CachedUpdate, UpdaterStateCache};

/** Environment override for the bridge port; default 3901. */
pub const ENV_BRIDGE_PORT: &str = "DSH_DESKTOP_BRIDGE_PORT";
/** Default bridge port. */
pub const DEFAULT_BRIDGE_PORT: u16 = 3901;
/** Auth header every bridge request must carry. */
pub const TOKEN_HEADER: &str = "x-dsh-bridge-token";
/** Environment entry names handed to the spawned dsh child. */
pub const ENV_BRIDGE_URL: &str = "DSH_DESKTOP_BRIDGE_URL";
pub const ENV_BRIDGE_TOKEN: &str = "DSH_DESKTOP_BRIDGE_TOKEN";

/**
 * Generate one run-scoped bridge token: a hash of the boot time and process
 * id. Unpredictable enough to reject other local processes, not a security
 * boundary against the same OS user.
 */
pub fn generate_token() -> String {
    let mut hasher = RandomState::new().build_hasher();
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    hasher.write_u128(nanos);
    hasher.write_u32(std::process::id());
    format!("{:032x}", hasher.finish() as u64)
}

/** The bridge loop handle: stops and joins on drop. */
pub struct Bridge {
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl Bridge {
    /**
     * Start the bridge server on 127.0.0.1:port.
     * @param app - application handle for notification and dialog access.
     * @param port - loopback port to serve.
     * @param token - required request token.
     * @returns the running bridge, or a startup error.
     */
    pub fn start(app: AppHandle, port: u16, token: String) -> Result<Self, String> {
        let server = Server::http(("127.0.0.1", port)).map_err(|error| format!("bridge listen failed: {error}"))?;
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&stop);
        let join = std::thread::spawn(move || {
            let timeout = Duration::from_millis(500);
            loop {
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }
                let request = match server.recv_timeout(timeout) {
                    Ok(Some(request)) => request,
                    Ok(None) => break,
                    Err(_) => continue,
                };
                if !authorized(&request, &token) {
                    let _ = request.respond(Response::from_string("unauthorized").with_status_code(StatusCode(401)));
                    continue;
                }
                let _ = route(&app, request);
            }
        });
        Ok(Self { stop, join: Some(join) })
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

/** Whether the request carries the run-scoped token. */
fn authorized(request: &tiny_http::Request, token: &str) -> bool {
    request
        .headers()
        .iter()
        .any(|header| header.field.equiv(TOKEN_HEADER) && header.value.as_str() == token)
}

/** Dispatch one authorized request to its primitive. */
fn route(app: &AppHandle, mut request: tiny_http::Request) -> Result<(), ()> {
    let url = request.url().to_string();
    let method = request.method().clone();
    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);

    if method == Method::Get && url == "/api/desktop/update" {
        update_state_handler(app.clone(), request);
        return Ok(());
    }
    if method == Method::Post && url == "/api/desktop/update/apply" {
        update_apply_handler(app.clone(), request);
        return Ok(());
    }
    let response = match (method, url.as_str()) {
        (Method::Post, "/api/desktop/toast") => toast(app, &body),
        (Method::Get, "/update-manifest.json") => file_response("update-manifest.json", "application/json"),
        (Method::Get, "/update-artifact") => file_response("update-artifact.exe", "application/octet-stream"),
        (Method::Post, "/api/desktop/pick-directory") => pick_directory(app),
        (Method::Get, url) if url.starts_with("/api/desktop/keychain/") => {
            keychain_get(&url["/api/desktop/keychain/".len()..])
        }
        (Method::Post, url) if url.starts_with("/api/desktop/keychain/") => {
            keychain_set(&url["/api/desktop/keychain/".len()..], &body)
        }
        (Method::Delete, url) if url.starts_with("/api/desktop/keychain/") => {
            keychain_delete(&url["/api/desktop/keychain/".len()..])
        }
        _ => Response::from_string("not found").with_status_code(StatusCode(404)),
    };
    let _ = request.respond(response);
    Ok(())
}

/** Build one JSON response with the given status. */
fn json_response(status: u16, value: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response = Response::from_string(value.to_string()).with_status_code(StatusCode(status));
    let _ = response.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).expect("static header parses"));
    response
}

/** POST /api/desktop/toast: show one native notification. */
fn toast(app: &AppHandle, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let payload: Result<serde_json::Value, _> = serde_json::from_str(body);
    let Ok(payload) = payload else {
        return json_response(400, serde_json::json!({ "error": "invalid JSON body" }));
    };
    let (Some(title), Some(text)) = (payload.get("title").and_then(|v| v.as_str()), payload.get("body").and_then(|v| v.as_str())) else {
        return json_response(400, serde_json::json!({ "error": "title and body are required" }));
    };
    let session_id = payload.get("sessionId").and_then(|v| v.as_str());
    if let Some(id) = session_id {
        if crate::deeplink::is_safe_session_id(id) {
            if let Some(slot) = app.try_state::<crate::deeplink::PendingDeepLink>() {
                if let Ok(mut guard) = slot.0.lock() {
                    *guard = Some(id.to_string());
                }
            }
        }
    }
    let mut builder = app.notification().builder().title(title).body(text);
    if let Some(id) = session_id {
        builder = builder.extra("sessionId", id);
    }
    let _ = builder.show();
    json_response(200, serde_json::json!({ "shown": true }))
}

/** POST /api/desktop/pick-directory: open one native directory chooser. */
fn pick_directory(app: &AppHandle) -> Response<std::io::Cursor<Vec<u8>>> {
    match pick_directory_on_main(app) {
        Ok(Some(path)) => json_response(200, serde_json::json!({ "path": path })),
        Ok(None) => json_response(200, serde_json::json!({ "canceled": true })),
        Err(error) => json_response(500, serde_json::json!({ "error": error })),
    }
}

/**
 * Run the native folder dialog on the main thread and wait for its answer.
 * Shared by the bridge and the Tauri command.
 * @param app - application handle.
 * @returns the chosen absolute path, None on cancel, or an error string.
 */
pub fn pick_directory_on_main(app: &AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = mpsc::channel();
    let handle = app.clone();
    handle
        .run_on_main_thread({
            let inner = handle.clone();
            move || {
                let picked = inner.dialog().file().set_title("选择工作区目录").blocking_pick_folder();
                let _ = sender.send(picked.and_then(|path| path.into_path().ok()).map(|path| path.to_string_lossy().into_owned()));
            }
        })
        .map_err(|error| format!("main-thread dispatch failed: {error}"))?;
    receiver
        .recv_timeout(Duration::from_secs(30))
        .map_err(|error| format!("directory pick timed out: {error}"))
}

/** GET /api/desktop/keychain/{name}: read one Windows Credential Manager secret. */
fn keychain_get(name: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    match keyring::Entry::new("dsh-desktop", name) {
        Ok(entry) => match entry.get_password() {
            Ok(value) => json_response(200, serde_json::json!({ "value": value })),
            Err(_) => json_response(404, serde_json::json!({ "error": "not found" })),
        },
        Err(error) => json_response(500, serde_json::json!({ "error": error.to_string() })),
    }
}

/** POST /api/desktop/keychain/{name}: store one secret. */
fn keychain_set(name: &str, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let payload: Result<serde_json::Value, _> = serde_json::from_str(body);
    let Ok(payload) = payload else {
        return json_response(400, serde_json::json!({ "error": "invalid JSON body" }));
    };
    let Some(value) = payload.get("value").and_then(|v| v.as_str()) else {
        return json_response(400, serde_json::json!({ "error": "value is required" }));
    };
    if value.is_empty() {
        return json_response(400, serde_json::json!({ "error": "value must not be empty" }));
    }
    match keyring::Entry::new("dsh-desktop", name) {
        Ok(entry) => match entry.set_password(value) {
            Ok(()) => json_response(200, serde_json::json!({ "stored": true })),
            Err(error) => json_response(500, serde_json::json!({ "error": error.to_string() })),
        },
        Err(error) => json_response(500, serde_json::json!({ "error": error.to_string() })),
    }
}

/** DELETE /api/desktop/keychain/{name}: remove one secret. */
fn keychain_delete(name: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    match keyring::Entry::new("dsh-desktop", name) {
        Ok(entry) => match entry.delete_credential() {
            Ok(()) => json_response(200, serde_json::json!({ "deleted": true })),
            Err(_) => json_response(404, serde_json::json!({ "error": "not found" })),
        },
        Err(error) => json_response(500, serde_json::json!({ "error": error.to_string() })),
    }
}

/**
 * Serve one self-hosted update file from the shell's working directory.
 * @param filename - file to read.
 * @param content_type - response content type.
 * @returns the file bytes, or a 404 with an actionable message.
 */
fn file_response(filename: &str, content_type: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    match std::fs::read(filename) {
        Ok(bytes) => {
            let mut response = Response::from_data(bytes).with_status_code(StatusCode(200));
            let _ = response.add_header(Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes()).expect("static header parses"));
            response
        }
        Err(_) => json_response(404, serde_json::json!({ "error": filename.to_string() + " is not self-hosted; run the build-and-sign script and restart the shell" })),
    }
}

/**
 * Run one updater check and answer with the cached wire state.
 * @param app - application handle.
 * @param request - the bridge request to answer.
 */
fn update_state_handler(app: AppHandle, request: tiny_http::Request) {
    tauri::async_runtime::spawn(async move {
        let current = app.package_info().version.to_string();
        let outcome = check_updater(&app).await;
        let cache = app.try_state::<UpdaterStateCache>();
        if let Some(cache) = cache {
            let mut guard = cache.0.lock().expect("updater cache lock held");
            let previous = guard.clone();
            *guard = Some(match outcome {
                Ok(Some(update)) => CachedUpdate {
                    checked_at_ms: epoch_ms(),
                    available: Some(AvailableUpdate {
                        version: update.version.clone(),
                        published_at_ms: update.date.map(|d| d.unix_timestamp() * 1000).unwrap_or(0),
                    }),
                    last_failure: None,
                },
                Ok(None) => CachedUpdate {
                    checked_at_ms: epoch_ms(),
                    available: None,
                    last_failure: None,
                },
                Err(message) => CachedUpdate {
                    checked_at_ms: epoch_ms(),
                    available: previous.and_then(|c| c.available),
                    last_failure: Some(message),
                },
            });
            let json = crate::updater::wire_state(&current, guard.as_ref());
            drop(guard);
            let _ = request.respond(json_response(200, json));
        } else {
            let _ = request.respond(json_response(500, serde_json::json!({ "error": "updater state missing" })));
        }
    });
}

/**
 * Check the configured endpoints through the updater plugin.
 * @param app - application handle.
 * @returns the offered update, None when latest, or the failure.
 */
async fn check_updater(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    updater.check().await.map_err(|e| e.to_string())
}

/**
 * Download and install the offered update; the installer restarts the shell.
 * @param app - application handle.
 * @param request - the bridge request to answer before the installer runs.
 */
fn update_apply_handler(app: AppHandle, request: tiny_http::Request) {
    tauri::async_runtime::spawn(async move {
        let outcome = async {
            let update = check_updater(&app).await?.ok_or_else(|| "no update available".to_string())?;
            update
                .download_and_install(|_chunk_len: usize, _total: Option<u64>| {}, || {})
                .await
                .map_err(|e| e.to_string())
        }.await;
        match outcome {
            Ok(()) => { let _ = request.respond(json_response(200, serde_json::json!({ "applying": true }))); }
            Err(message) => { let _ = request.respond(json_response(500, serde_json::json!({ "error": message }))); }
        }
    });
}

/** Current epoch milliseconds. */
fn epoch_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
