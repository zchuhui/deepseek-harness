//! Updater state cache and its bridge wire mapping. The plugin performs
//! check/download/install; this module owns the cached facts the bridge
//! serves and the pure JSON mapping tests pin.

use std::sync::Mutex;

/** One available update's facts, reduced from the plugin's Update type. */
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AvailableUpdate {
    /** Announced version. */
    pub version: String,
    /** Publish epoch milliseconds; 0 when the release carries no date. */
    pub published_at_ms: i64,
}

/** The last completed check's facts. */
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CachedUpdate {
    /** Check epoch milliseconds. */
    pub checked_at_ms: i64,
    /** The offered update, or None when already latest. */
    pub available: Option<AvailableUpdate>,
    /** The last check failure message, or None when the last check succeeded. */
    pub last_failure: Option<String>,
}

/** Managed updater cache: replaced wholesale by each check, never mutated. */
pub struct UpdaterStateCache(pub Mutex<Option<CachedUpdate>>);

impl UpdaterStateCache {
    /** The managed state instance. */
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/**
 * Map the cached facts onto the bridge wire state.
 * @param current_version - the running application version.
 * @param cached - the last completed check, or None before the first one.
 * @returns the JSON the host updater providers consume.
 */
pub fn wire_state(current_version: &str, cached: Option<&CachedUpdate>) -> serde_json::Value {
    let Some(cached) = cached else {
        return serde_json::json!({
            "channel": "tauri",
            "currentVersion": current_version,
            "checkedAt": null,
            "available": null,
            "lastFailure": null,
        });
    };
    serde_json::json!({
        "channel": "tauri",
        "currentVersion": current_version,
        "checkedAt": cached.checked_at_ms,
        "available": cached.available.as_ref().map(|a| serde_json::json!({
            "version": a.version,
            "publishedAt": a.published_at_ms,
        })),
        "lastFailure": cached.last_failure.as_ref().map(|m| serde_json::json!({
            "message": m,
            "at": cached.checked_at_ms,
        })),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_the_pre_check_state() {
        assert_eq!(
            serde_json::json!({ "channel": "tauri", "currentVersion": "0.1.0-rc.5", "checkedAt": null, "available": null, "lastFailure": null }),
            wire_state("0.1.0-rc.5", None),
        );
    }

    #[test]
    fn maps_a_successful_check_with_an_offer() {
        let cached = CachedUpdate {
            checked_at_ms: 100,
            available: Some(AvailableUpdate {
                version: "0.2.0".to_string(),
                published_at_ms: 200,
            }),
            last_failure: None,
        };
        assert_eq!(
            serde_json::json!({ "channel": "tauri", "currentVersion": "0.1.0-rc.5", "checkedAt": 100, "available": { "version": "0.2.0", "publishedAt": 200 }, "lastFailure": null }),
            wire_state("0.1.0-rc.5", Some(&cached)),
        );
    }

    #[test]
    fn maps_a_failed_check() {
        let cached = CachedUpdate {
            checked_at_ms: 100,
            available: None,
            last_failure: Some("network down".to_string()),
        };
        assert_eq!(
            serde_json::json!({ "channel": "tauri", "currentVersion": "0.1.0-rc.5", "checkedAt": 100, "available": null, "lastFailure": { "message": "network down", "at": 100 } }),
            wire_state("0.1.0-rc.5", Some(&cached)),
        );
    }
}
