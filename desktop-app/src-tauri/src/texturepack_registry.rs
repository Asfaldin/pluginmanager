use crate::models::{TexturePackProject, TexturePackStore};
use tauri::{AppHandle, Manager};

fn store_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("texture_packs.json"))
}

fn read_store(app: &AppHandle) -> Result<TexturePackStore, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(TexturePackStore { packs: vec![] });
    }
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

fn write_store(app: &AppHandle, store: &TexturePackStore) -> Result<(), String> {
    let path = store_path(app)?;
    let contents = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_texture_packs(app: AppHandle) -> Result<Vec<TexturePackProject>, String> {
    Ok(read_store(&app)?.packs)
}

#[tauri::command]
pub fn save_texture_pack(app: AppHandle, pack: TexturePackProject) -> Result<(), String> {
    let mut store = read_store(&app)?;
    if let Some(existing) = store.packs.iter_mut().find(|p| p.id == pack.id) {
        *existing = pack;
    } else {
        store.packs.push(pack);
    }
    write_store(&app, &store)
}

#[tauri::command]
pub fn delete_texture_pack(app: AppHandle, id: String) -> Result<(), String> {
    let mut store = read_store(&app)?;
    store.packs.retain(|p| p.id != id);
    write_store(&app, &store)
}
