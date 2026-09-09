use crate::models::{ServerProfile, ServerProfileStore};
use tauri::{AppHandle, Manager};

const SFTP_KEYRING_SERVICE: &str = "pluginmanager-sftp";
const RCON_KEYRING_SERVICE: &str = "pluginmanager-rcon";

fn store_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("server_profiles.json"))
}

fn read_store(app: &AppHandle) -> Result<ServerProfileStore, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(ServerProfileStore { profiles: vec![] });
    }
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

fn write_store(app: &AppHandle, store: &ServerProfileStore) -> Result<(), String> {
    let path = store_path(app)?;
    let contents = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_profiles(app: AppHandle) -> Result<Vec<ServerProfile>, String> {
    Ok(read_store(&app)?.profiles)
}

/// Creates or updates a profile. Passing `None` for a secret leaves the
/// previously stored credential untouched; passing `Some("")` clears it.
#[tauri::command]
pub fn save_profile(
    app: AppHandle,
    profile: ServerProfile,
    sftp_secret: Option<String>,
    rcon_secret: Option<String>,
) -> Result<(), String> {
    let mut store = read_store(&app)?;

    if let Some(secret) = sftp_secret {
        set_secret(SFTP_KEYRING_SERVICE, &profile.id, &secret)?;
    }
    if let Some(secret) = rcon_secret {
        set_secret(RCON_KEYRING_SERVICE, &profile.id, &secret)?;
    }

    if let Some(existing) = store.profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile;
    } else {
        store.profiles.push(profile);
    }

    write_store(&app, &store)
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, id: String) -> Result<(), String> {
    let mut store = read_store(&app)?;
    store.profiles.retain(|p| p.id != id);
    write_store(&app, &store)?;

    let _ = delete_secret(SFTP_KEYRING_SERVICE, &id);
    let _ = delete_secret(RCON_KEYRING_SERVICE, &id);
    Ok(())
}

fn set_secret(service: &str, profile_id: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, profile_id).map_err(|e| e.to_string())?;
    if secret.is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(secret).map_err(|e| e.to_string())
}

fn delete_secret(service: &str, profile_id: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, profile_id).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

pub fn get_sftp_secret(profile_id: &str) -> Option<String> {
    keyring::Entry::new(SFTP_KEYRING_SERVICE, profile_id)
        .ok()?
        .get_password()
        .ok()
}

pub fn get_rcon_secret(profile_id: &str) -> Option<String> {
    keyring::Entry::new(RCON_KEYRING_SERVICE, profile_id)
        .ok()?
        .get_password()
        .ok()
}
