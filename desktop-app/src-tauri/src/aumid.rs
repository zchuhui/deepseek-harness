//! Windows shell-identity registration: the shell keeps one Start Menu
//! shortcut marked with its own AppUserModelID. Windows shows a toast under
//! the AUMID the notifier passes, but only while that AUMID is registered —
//! the shortcut IS the registration. Dev and portable runs create it here;
//! the NSIS installer writes its own copy in the same place, and this module
//! rewrites it idempotently, so every launch converges on the shell identity.

use std::path::{Path, PathBuf};

use windows::core::{Interface, GUID, HSTRING, PWSTR};
use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PROPVARIANT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemAlloc, CoTaskMemFree, IPersistFile,
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    FOLDERID_Programs, IShellLinkW, SHGetKnownFolderPath, KF_FLAG_DEFAULT,
};

/** Start Menu subdirectory that holds the shell shortcut. */
pub const SHORTCUT_DIR_NAME: &str = "DeepSeek Harness";
/** The shortcut's file name. */
pub const SHORTCUT_FILE_NAME: &str = "DeepSeek Harness.lnk";
/** CLSID_ShellLink; the windows 0.62 Win32 tree defines no constant for it. */
const CLSID_SHELL_LINK: GUID = GUID::from_u128(0x0002_1401_0000_0000_C000_0000_0000_0046);

/**
 * The shortcut path inside the user's Start Menu Programs directory.
 * @param programs_dir - the resolved Programs directory.
 * @returns the complete shortcut path.
 */
pub fn shortcut_path(programs_dir: &Path) -> PathBuf {
    programs_dir
        .join(SHORTCUT_DIR_NAME)
        .join(SHORTCUT_FILE_NAME)
}

/**
 * Ensure the Start Menu carries one shortcut to `target` marked with
 * `app_id`. Creating it is idempotent: an existing shortcut (the installer's
 * copy, or a stale dev one) is rewritten with the same target and identity.
 * @param target - the executable the shortcut launches; empty targets reject.
 * @param app_id - the shell's AppUserModelID (the tauri identifier).
 * @returns the shortcut path written.
 */
pub fn ensure_shortcut(target: &Path, app_id: &str) -> Result<PathBuf, String> {
    if target.as_os_str().is_empty() {
        return Err("shortcut target is empty".to_string());
    }
    let path = shortcut_path(&programs_dir()?);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("shortcut directory create failed: {error}"))?;
    }
    write_shortcut(&path, target, app_id).map(|()| path)
}

/**
 * Resolve the user's Start Menu Programs directory.
 * @returns the absolute Programs path.
 */
fn programs_dir() -> Result<PathBuf, String> {
    let raw = unsafe { SHGetKnownFolderPath(&FOLDERID_Programs, KF_FLAG_DEFAULT, None) }
        .map_err(|error| format!("Start Menu Programs directory unavailable: {error}"))?;
    let text = unsafe { raw.to_string() }
        .map_err(|error| format!("Start Menu Programs directory is not valid UTF-16: {error}"))?;
    unsafe { CoTaskMemFree(Some(raw.as_ptr() as *const core::ffi::c_void)) };
    Ok(PathBuf::from(text))
}

/**
 * Write one shortcut with its AppUserModelID property.
 * @param path - shortcut file to write.
 * @param target - the executable the shortcut launches.
 * @param app_id - the AppUserModelID to mark.
 */
fn write_shortcut(path: &Path, target: &Path, app_id: &str) -> Result<(), String> {
    // Apartment-threaded COM for the shell-link class. The call balance
    // rule: CoUninitialize runs ONLY when this call performed the init itself
    // (S_OK). S_FALSE means the thread was already initialized (Tauri owns a
    // main-thread STA the webview needs) and RPC_E_CHANGED_MODE means another
    // mode owns it — both must leave the existing apartment alone.
    let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let result = write_shortcut_initialized(path, target, app_id);
    if init == windows::core::HRESULT(0) {
        unsafe { windows::Win32::System::Com::CoUninitialize() };
    }
    result
}

/** The COM body; the caller has already initialized the apartment. */
fn write_shortcut_initialized(path: &Path, target: &Path, app_id: &str) -> Result<(), String> {
    unsafe {
        let shell_link: IShellLinkW =
            CoCreateInstance(&CLSID_SHELL_LINK, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("shell link creation failed: {error}"))?;
        shell_link
            .SetPath(&HSTRING::from(target.as_os_str()))
            .map_err(|error| format!("shortcut target set failed: {error}"))?;
        shell_link
            .SetDescription(&HSTRING::from("DeepSeek Harness"))
            .map_err(|error| format!("shortcut description set failed: {error}"))?;
        shell_link
            .SetIconLocation(&HSTRING::from(target.as_os_str()), 0)
            .map_err(|error| format!("shortcut icon set failed: {error}"))?;

        let store: IPropertyStore = shell_link
            .cast()
            .map_err(|error| format!("shortcut property store unavailable: {error}"))?;
        // The property store copies during SetValue, so the wide string must
        // be its own CoTaskMem allocation: PropVariantClear frees exactly that
        // buffer, and no other owner exists.
        let wide: Vec<u16> = app_id.encode_utf16().chain(std::iter::once(0)).collect();
        let copy = CoTaskMemAlloc(wide.len() * std::mem::size_of::<u16>()) as *mut u16;
        std::ptr::copy_nonoverlapping(wide.as_ptr(), copy, wide.len());
        let mut value = PROPVARIANT::default();
        (*value.Anonymous.Anonymous).vt = VT_LPWSTR;
        (*value.Anonymous.Anonymous).Anonymous.pwszVal = PWSTR(copy);
        let set = store.SetValue(&PKEY_AppUserModel_ID, &value);
        PropVariantClear(&mut value).ok();
        set.map_err(|error| format!("shortcut AUMID set failed: {error}"))?;
        store
            .Commit()
            .map_err(|error| format!("shortcut property commit failed: {error}"))?;

        let persist: IPersistFile = shell_link
            .cast()
            .map_err(|error| format!("shortcut persistence unavailable: {error}"))?;
        persist
            .Save(&HSTRING::from(path.as_os_str()), true)
            .map_err(|error| format!("shortcut save failed: {error}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composes_the_shortcut_path_inside_programs() {
        assert_eq!(
            PathBuf::from("C:\\Users\\op\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\DeepSeek Harness\\DeepSeek Harness.lnk"),
            shortcut_path(Path::new("C:\\Users\\op\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs")),
        );
    }

    #[test]
    fn rejects_an_empty_target() {
        assert!(ensure_shortcut(Path::new(""), "ai.deepseek.harness.desktop").is_err());
    }

    #[test]
    fn writes_a_shortcut_and_reads_back_its_identity() {
        use std::sync::atomic::{AtomicU64, Ordering};

        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "dsh-desktop-aumid-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir creates");
        let target = std::env::current_exe().expect("test binary path resolves");
        let path = dir.join("test.lnk");
        let app_id = "ai.deepseek.harness.desktop";

        write_shortcut(&path, &target, app_id).unwrap();

        let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        assert_eq!(init, windows::core::HRESULT(0), "read-back apartment init succeeds");
        unsafe {
            let shell_link: IShellLinkW =
                CoCreateInstance(&CLSID_SHELL_LINK, None, CLSCTX_INPROC_SERVER).unwrap();
            let persist: IPersistFile = shell_link.cast().unwrap();
            persist
                .Load(
                    &HSTRING::from(path.as_os_str()),
                    windows::Win32::System::Com::STGM(0),
                )
                .unwrap();
            // windows 0.62 generates no GetPath wrapper for IShellLinkW and
            // its vtable fields are private, so the target is asserted through
            // the link file itself: the path lands in the link as UTF-16LE.
            let target_wide: Vec<u16> = target.to_string_lossy().encode_utf16().collect();
            let target_bytes: Vec<u8> = target_wide
                .iter()
                .flat_map(|unit| unit.to_le_bytes())
                .collect();
            let link = std::fs::read(&path).unwrap();
            assert!(
                link.windows(target_bytes.len())
                    .any(|window| window == target_bytes),
                "target path is embedded in the shortcut file",
            );

            let store: IPropertyStore = shell_link.cast().unwrap();
            let mut value = store.GetValue(&PKEY_AppUserModel_ID).unwrap();
            let raw = value.Anonymous.Anonymous.Anonymous.pwszVal;
            assert_eq!(app_id, raw.to_string().unwrap());
            PropVariantClear(&mut value).ok();
        }
        unsafe { windows::Win32::System::Com::CoUninitialize() };
        let _ = std::fs::remove_dir_all(&dir);
    }
}
