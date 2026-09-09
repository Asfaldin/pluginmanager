use base64::Engine;
use image::{ImageBuffer, Rgba};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackMeta {
    pub pack_format: i64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextureStatus {
    pub overridden: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub preview_data_url: Option<String>,
}

fn mcmeta_path(pack_dir: &str) -> PathBuf {
    Path::new(pack_dir).join("pack.mcmeta")
}

fn texture_path(pack_dir: &str, rel_path: &str) -> PathBuf {
    Path::new(pack_dir).join(rel_path)
}

#[tauri::command]
pub fn rp_read_meta(pack_dir: String) -> Result<PackMeta, String> {
    let path = mcmeta_path(&pack_dir);
    if !path.exists() {
        return Ok(PackMeta { pack_format: 0, description: String::new() });
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let pack = value.get("pack").cloned().unwrap_or(serde_json::Value::Null);
    Ok(PackMeta {
        pack_format: pack.get("pack_format").and_then(|v| v.as_i64()).unwrap_or(0),
        description: pack
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

#[tauri::command]
pub fn rp_write_meta(pack_dir: String, meta: PackMeta) -> Result<(), String> {
    std::fs::create_dir_all(&pack_dir).map_err(|e| e.to_string())?;
    let value = serde_json::json!({
        "pack": {
            "pack_format": meta.pack_format,
            "description": meta.description,
        }
    });
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    std::fs::write(mcmeta_path(&pack_dir), text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rp_texture_status(pack_dir: String, rel_path: String) -> Result<TextureStatus, String> {
    let path = texture_path(&pack_dir, &rel_path);
    if !path.exists() {
        return Ok(TextureStatus { overridden: false, width: None, height: None, preview_data_url: None });
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let preview = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );
    Ok(TextureStatus {
        overridden: true,
        width: Some(img.width()),
        height: Some(img.height()),
        preview_data_url: Some(preview),
    })
}

#[tauri::command]
pub fn rp_make_transparent(pack_dir: String, rel_path: String, width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err("Nieprawidłowe wymiary tekstury".to_string());
    }
    let path = texture_path(&pack_dir, &rel_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_pixel(width, height, Rgba([0, 0, 0, 0]));
    img.save(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rp_import_texture(
    pack_dir: String,
    rel_path: String,
    source_path: String,
    strip_alpha: bool,
) -> Result<(), String> {
    let dest = texture_path(&pack_dir, &rel_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if !strip_alpha {
        std::fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let mut img = image::open(&source_path).map_err(|e| e.to_string())?.to_rgba8();
    for pixel in img.pixels_mut() {
        pixel.0[3] = 0;
    }
    img.save(&dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rp_reset_texture(pack_dir: String, rel_path: String) -> Result<(), String> {
    let path = texture_path(&pack_dir, &rel_path);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McVersionSummary {
    pub id: String,
    pub version_type: String,
}

/// Lists Minecraft versions from Mojang's public launcher-meta manifest so
/// the UI can offer a proper dropdown instead of a free-text version field
/// the user has to get exactly right.
#[tauri::command]
pub async fn rp_list_mc_versions() -> Result<Vec<McVersionSummary>, String> {
    #[derive(Deserialize)]
    struct RawVersion {
        id: String,
        #[serde(rename = "type")]
        kind: String,
    }
    #[derive(Deserialize)]
    struct RawManifest {
        versions: Vec<RawVersion>,
    }

    let manifest: RawManifest = reqwest::get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .await
        .map_err(|e| format!("Nie udało się pobrać listy wersji Minecraft: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Nieprawidłowa odpowiedź manifestu wersji: {e}"))?;

    Ok(manifest
        .versions
        .into_iter()
        .map(|v| McVersionSummary { id: v.id, version_type: v.kind })
        .collect())
}

#[tauri::command]
pub fn rp_write_text_file(pack_dir: String, rel_path: String, contents: String) -> Result<(), String> {
    let path = texture_path(&pack_dir, &rel_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rp_read_text_file(pack_dir: String, rel_path: String) -> Result<Option<String>, String> {
    let path = texture_path(&pack_dir, &rel_path);
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rp_save_png_bytes(pack_dir: String, rel_path: String, png_base64: String) -> Result<(), String> {
    let dest = texture_path(&pack_dir, &rel_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|e| e.to_string())?;
    std::fs::write(&dest, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rp_list_all_textures(pack_dir: String) -> Result<Vec<String>, String> {
    let root = Path::new(&pack_dir);
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut found = Vec::new();
    collect_pngs(root, root, &mut found)?;
    found.sort();
    Ok(found)
}

fn collect_pngs(base: &Path, dir: &Path, found: &mut Vec<String>) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_pngs(base, &path, found)?;
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("png"))
            .unwrap_or(false)
        {
            let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
            found.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResult {
    pub sha1: String,
    pub files_extracted: usize,
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn extract_zip_to_dir(bytes: &[u8], dest_dir: &Path) -> Result<usize, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut count = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(enclosed) = entry.enclosed_name() else { continue };
        let out_path = dest_dir.join(enclosed);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    Ok(count)
}

/// Downloads a resource pack from a direct URL (e.g. an mc-packs.net link),
/// verifies it against the expected SHA1 (the same hash Minecraft servers
/// send alongside `resource-pack` in server.properties) when one is given,
/// and extracts it into `pack_dir` so every texture becomes locally editable.
#[tauri::command]
pub async fn rp_download_pack(
    url: String,
    expected_sha1: Option<String>,
    pack_dir: String,
) -> Result<DownloadResult, String> {
    use sha1::{Digest, Sha1};

    let response = reqwest::get(&url).await.map_err(|e| format!("Pobieranie nie powiodło się: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Serwer zwrócił błąd HTTP: {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    let sha1_hex = hex_encode(hasher.finalize().as_slice());

    if let Some(expected) = expected_sha1.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if !expected.eq_ignore_ascii_case(&sha1_hex) {
            return Err(format!(
                "Niezgodność sumy SHA1: oczekiwano {expected}, otrzymano {sha1_hex}. Plik NIE został rozpakowany."
            ));
        }
    }

    std::fs::create_dir_all(&pack_dir).map_err(|e| e.to_string())?;
    let files_extracted = extract_zip_to_dir(&bytes, Path::new(&pack_dir))?;

    Ok(DownloadResult { sha1: sha1_hex, files_extracted })
}

#[derive(Debug, Deserialize)]
struct VersionManifest {
    latest: LatestVersions,
    versions: Vec<VersionEntry>,
}

#[derive(Debug, Deserialize)]
struct LatestVersions {
    release: String,
}

#[derive(Debug, Deserialize)]
struct VersionEntry {
    id: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct VersionDetail {
    downloads: Downloads,
}

#[derive(Debug, Deserialize)]
struct Downloads {
    client: DownloadEntry,
}

#[derive(Debug, Deserialize)]
struct DownloadEntry {
    url: String,
    sha1: String,
}

fn extract_assets_from_jar(bytes: &[u8], dest_dir: &Path) -> Result<usize, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut count = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(enclosed) = entry.enclosed_name() else { continue };
        // The client jar also ships compiled game code (top-level .class
        // files), META-INF, and a `data/` datapack tree — none of that
        // belongs in a resource pack, so only `assets/**` is extracted.
        if !enclosed.starts_with("assets") {
            continue;
        }
        let out_path = dest_dir.join(&enclosed);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    Ok(count)
}

/// Downloads the official Minecraft client for `version` (or the latest
/// release when omitted) via Mojang's public launcher-meta API — the same
/// endpoints every Minecraft launcher uses — verifies it against the SHA1
/// Mojang itself publishes, and extracts just the `assets/` tree into
/// `pack_dir` as a full vanilla template to build a custom pack on top of.
#[tauri::command]
pub async fn rp_download_vanilla_assets(version: Option<String>, pack_dir: String) -> Result<DownloadResult, String> {
    use sha1::{Digest, Sha1};

    let manifest: VersionManifest = reqwest::get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .await
        .map_err(|e| format!("Nie udało się pobrać listy wersji Minecraft: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Nieprawidłowa odpowiedź manifestu wersji: {e}"))?;

    let version_id = version
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or(manifest.latest.release);

    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Nie znaleziono wersji '{version_id}' w oficjalnym manifeście Mojang"))?;

    let detail: VersionDetail = reqwest::get(&entry.url)
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let client_bytes = reqwest::get(&detail.downloads.client.url)
        .await
        .map_err(|e| format!("Pobieranie klienta Minecraft nie powiodło się: {e}"))?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let mut hasher = Sha1::new();
    hasher.update(&client_bytes);
    let got_sha1 = hex_encode(hasher.finalize().as_slice());
    if !got_sha1.eq_ignore_ascii_case(&detail.downloads.client.sha1) {
        return Err(format!(
            "Niezgodność sumy SHA1 klienta Minecraft (oczekiwano {}, otrzymano {got_sha1}). Plik NIE został rozpakowany.",
            detail.downloads.client.sha1
        ));
    }

    std::fs::create_dir_all(&pack_dir).map_err(|e| e.to_string())?;
    let files_extracted = extract_assets_from_jar(&client_bytes, Path::new(&pack_dir))?;

    Ok(DownloadResult { sha1: got_sha1, files_extracted })
}

#[tauri::command]
pub fn rp_export_zip(pack_dir: String, output_path: String) -> Result<(), String> {
    let root = Path::new(&pack_dir);
    if !root.is_dir() {
        return Err(format!("'{pack_dir}' nie jest folderem"));
    }

    let file = std::fs::File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options: zip::write::SimpleFileOptions =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    add_dir_to_zip(&mut zip, root, root, &options)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    base: &Path,
    dir: &Path,
    options: &zip::write::SimpleFileOptions,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            zip.add_directory(format!("{rel_str}/"), *options).map_err(|e| e.to_string())?;
            add_dir_to_zip(zip, base, &path, options)?;
        } else {
            zip.start_file(rel_str, *options).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
