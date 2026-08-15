//! Shell settings: one JSON document in the app config directory with the
//! desktop-specific behaviors the shell owns (close-to-tray, launch at
//! login). Loading, atomic saving, and applying the launch-at-login Run key
//! live here; the bridge and the Tauri commands expose them.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/** Settings document filename inside the app config directory. */
pub const SETTINGS_FILENAME: &str = "settings.json";
/** The Windows Run key value name the shell registers for launch at login. */
pub const RUN_VALUE_NAME: &str = "dsh-desktop";

/** The persisted settings document. */
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /** Whether closing the main window hides it instead of quitting. */
    #[serde(default = "default_close_to_tray")]
    pub close_to_tray: bool,
    /** Whether the shell starts when the operator logs in (Windows Run key). */
    #[serde(default = "default_launch_at_login")]
    pub launch_at_login: bool,
}

fn default_close_to_tray() -> bool {
    true
}

fn default_launch_at_login() -> bool {
    false
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            close_to_tray: default_close_to_tray(),
            launch_at_login: default_launch_at_login(),
        }
    }
}

/** Managed shell settings: the live document plus its backing file path. */
pub struct SettingsState {
    settings: std::sync::Mutex<Settings>,
    path: PathBuf,
}

impl SettingsState {
    /**
     * Build the managed state from a loaded document.
     * @param settings - the loaded document.
     * @param path - the backing file path.
     */
    pub fn new(settings: Settings, path: PathBuf) -> Self {
        Self {
            settings: std::sync::Mutex::new(settings),
            path,
        }
    }

    /** The current document snapshot. */
    pub fn snapshot(&self) -> Settings {
        self.settings.lock().expect("settings lock held").clone()
    }
}

/**
 * The settings file path inside the app config directory.
 * @param app_config_dir - the platform config directory.
 * @returns the joined path.
 */
pub fn settings_path(app_config_dir: &Path) -> PathBuf {
    app_config_dir.join(SETTINGS_FILENAME)
}

/**
 * Load the settings document. An absent file yields the defaults; a corrupt
 * one fails loud so the shell never silently runs with guessed behavior.
 * @param path - the settings file path.
 * @returns the document, or the failure.
 */
pub fn load(path: &Path) -> Result<Settings, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Settings::default())
        }
        Err(error) => return Err(format!("读取设置失败: {error}")),
    };
    serde_json::from_str(&text).map_err(|error| format!("设置文件解析失败: {error}"))
}

/**
 * Atomically persist one settings document: write a sibling temp file, then
 * rename it over the target so a crash never leaves a truncated document.
 * @param path - the settings file path.
 * @param settings - the document to persist.
 * @returns the outcome.
 */
pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建设置目录失败: {error}"))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("序列化设置失败: {error}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|error| format!("写入设置失败: {error}"))?;
    fs::rename(&tmp, path).map_err(|error| format!("提交设置失败: {error}"))
}

/**
 * Apply one document to the state: OS side effects first (launch at login),
 * then persistence, then the in-memory document — the memory update is the
 * commit point, so a failed OS change leaves everything untouched.
 * @param state - the managed state.
 * @param next - the complete next document.
 * @returns the outcome.
 */
pub fn apply(state: &SettingsState, next: &Settings) -> Result<(), String> {
    if next.launch_at_login != state.snapshot().launch_at_login {
        apply_launch_at_login(next.launch_at_login)?;
    }
    save(&state.path, next)?;
    *state.settings.lock().expect("settings lock held") = next.clone();
    Ok(())
}

/**
 * Build the reg.exe invocation that sets or clears the launch-at-login Run
 * value. Pure for tests; only Windows has the Run key.
 * @param enabled - whether the shell starts at login.
 * @returns the program and args, or an error off Windows.
 */
pub fn launch_at_login_command(enabled: bool) -> Result<(String, Vec<String>), String> {
    #[cfg(not(windows))]
    {
        let _ = enabled;
        return Err("开机自启目前仅支持 Windows".to_string());
    }
    #[cfg(windows)]
    {
        let exe = std::env::current_exe()
            .map_err(|error| format!("定位程序路径失败: {error}"))?
            .display()
            .to_string();
        if enabled {
            Ok((
                "reg.exe".to_string(),
                vec![
                    "add".to_string(),
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run".to_string(),
                    "/v".to_string(),
                    RUN_VALUE_NAME.to_string(),
                    "/t".to_string(),
                    "REG_SZ".to_string(),
                    "/d".to_string(),
                    format!("\"{exe}\""),
                    "/f".to_string(),
                ],
            ))
        } else {
            Ok((
                "reg.exe".to_string(),
                vec![
                    "delete".to_string(),
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run".to_string(),
                    "/v".to_string(),
                    RUN_VALUE_NAME.to_string(),
                    "/f".to_string(),
                ],
            ))
        }
    }
}

/**
 * Apply the launch-at-login OS setting through reg.exe. The spawn outcome is
 * the success signal; a failed registry write reports its exit status.
 * @param enabled - whether the shell starts at login.
 * @returns the outcome.
 */
pub fn apply_launch_at_login(enabled: bool) -> Result<(), String> {
    let (program, args) = launch_at_login_command(enabled)?;
    let status = std::process::Command::new(program)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|error| format!("执行开机自启设置失败: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("开机自启设置失败(退出码 {status})"))
    }
}

/**
 * Show the settings window, creating it on first use. The window loads the
 * bundled settings.html, which drives get_settings/set_settings through the
 * Tauri IPC commands.
 * @param app - application handle.
 * @returns the outcome.
 */
pub fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("设置")
        .inner_size(420.0, 340.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .build()
        .map_err(|error| format!("设置窗口创建失败: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "dsh-desktop-settings-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir creates");
        dir
    }

    #[test]
    fn defaults_close_to_tray_on_and_launch_at_login_off() {
        let settings = Settings::default();
        assert!(settings.close_to_tray);
        assert!(!settings.launch_at_login);
    }

    #[test]
    fn an_absent_file_loads_defaults() {
        let dir = temp_dir("absent");
        let path = settings_path(&dir);
        assert_eq!(Ok(Settings::default()), load(&path));
        assert!(!path.exists(), "an absent file is not materialized by load");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_corrupt_file_fails_loud() {
        let dir = temp_dir("corrupt");
        let path = settings_path(&dir);
        fs::write(&path, "{ not json").unwrap();
        assert!(load(&path).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_and_load_round_trip_and_tolerate_missing_fields() {
        let dir = temp_dir("roundtrip");
        let path = settings_path(&dir);
        let settings = Settings {
            close_to_tray: false,
            launch_at_login: true,
        };
        save(&path, &settings).unwrap();
        assert_eq!(Ok(settings), load(&path));

        // Fields absent from an older document take their defaults.
        fs::write(&path, "{\"closeToTray\": false}").unwrap();
        assert_eq!(
            Ok(Settings {
                close_to_tray: false,
                launch_at_login: false,
            }),
            load(&path),
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn apply_updates_os_then_file_then_memory() {
        let dir = temp_dir("apply");
        let path = settings_path(&dir);
        let state = SettingsState::new(Settings::default(), path.clone());
        let next = Settings {
            close_to_tray: false,
            launch_at_login: false,
        };
        apply(&state, &next).unwrap();
        assert_eq!(next, state.snapshot());
        assert_eq!(Ok(next), load(&path));
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn run_command_quotes_the_exe_path_when_enabling() {
        let (program, args) = launch_at_login_command(true).unwrap();
        assert_eq!("reg.exe", program);
        assert!(args.contains(&"add".to_string()));
        assert!(args.contains(&r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run".to_string()));
        assert!(args.contains(&"/v".to_string()));
        assert!(args.contains(&RUN_VALUE_NAME.to_string()));
        let data = args
            .iter()
            .find(|arg| arg.starts_with('"') && arg.ends_with(".exe\""))
            .expect("the exe path is quoted");
        let _ = data;
    }
}
