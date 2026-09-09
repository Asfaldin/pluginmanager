use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalJar {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_unix: u64,
}

/// If the JAVA_HOME this process inherited doesn't point at a real
/// directory (e.g. a stale user-level env var left over from an uninstalled
/// JDK), look for the newest `jdk-*` under the standard Windows install
/// location and use that instead - scoped to just the spawned build
/// process, never touching the user's actual system environment.
fn resolve_java_home_override() -> Option<String> {
    if let Ok(existing) = std::env::var("JAVA_HOME") {
        if Path::new(&existing).is_dir() {
            return None;
        }
    }
    let java_root = Path::new("C:/Program Files/Java");
    let mut candidates: Vec<(u32, std::path::PathBuf)> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(java_root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(rest) = name.strip_prefix("jdk-") {
                let version: u32 = rest.split('.').next().unwrap_or("0").parse().unwrap_or(0);
                candidates.push((version, entry.path()));
            }
        }
    }
    candidates.sort_by_key(|(v, _)| *v);
    candidates.last().map(|(_, p)| p.to_string_lossy().to_string())
}

/// Runs `mvn package` (or the project's `mvnw.cmd` wrapper when present) in
/// `project_dir`. Returns the tail of combined stdout+stderr on success so
/// the caller has something to show even for a clean build; on failure the
/// same tail is returned as the error, since that's where the actual Maven
/// error message lives.
#[tauri::command]
pub async fn run_maven_build(project_dir: String) -> Result<String, String> {
    let has_wrapper = Path::new(&project_dir).join("mvnw.cmd").exists();
    // Explicit ".\" prefix, not a bare filename: some systems have
    // NoDefaultCurrentDirectoryInExePath set, which disables cmd.exe's
    // implicit "search the current directory" behavior for bare command
    // names and makes `mvnw.cmd package` silently fail as "not recognized".
    let command_line = if has_wrapper { ".\\mvnw.cmd package" } else { "mvn package" };

    let mut command = tokio::process::Command::new("cmd");
    command.args(["/C", command_line]).current_dir(&project_dir);
    if let Some(java_home) = resolve_java_home_override() {
        command.env("JAVA_HOME", java_home);
    }

    let output = command
        .output()
        .await
        .map_err(|e| format!("Nie udało się uruchomić budowania: {e}"))?;

    let mut combined = String::from_utf8_lossy(&output.stdout).to_string();
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    let tail: String = combined.chars().rev().take(6000).collect::<Vec<char>>().into_iter().rev().collect();

    if !output.status.success() {
        return Err(format!("Build nie powiódł się (kod {:?}):\n{tail}", output.status.code()));
    }
    Ok(tail)
}

#[tauri::command]
pub fn list_dist_jars(project_dir: String) -> Result<Vec<LocalJar>, String> {
    let dist = Path::new(&project_dir).join("dist");
    if !dist.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dist).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jar") {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let modified_unix = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        out.push(LocalJar {
            name: path.file_name().unwrap().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            size: meta.len(),
            modified_unix,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Eksport "bez serwera": zapisuje jar pluginu (WBUDOWANY w appkę, patrz
/// embedded_jars.rs - klient nie musi mieć kodu źródłowego Mainplugins na dysku) +
/// aktualnie edytowany w appce config YAML - do folderu wskazanego przez użytkownika
/// (`dest_dir` to już GOTOWA nazwa/lokalizacja, np. z dialogu "Zapisz jako" gdzie appka
/// sama proponuje nazwę pluginu jako nazwę folderu - patrz LocalExportButton.tsx),
/// bez potrzeby konfigurowania profilu SFTP/RCON w tej appce. W środku tego folderu
/// układ odtwarza realny folder `plugins/` serwera: jar na górze, config w swoim
/// podfolderze o nazwie pluginu - można to wprost skopiować do `plugins/` na
/// docelowym serwerze.
#[tauri::command]
pub fn export_plugin_bundle(
    plugin_id: String,
    plugin_folder_name: String,
    config_filename: String,
    config_contents: String,
    dest_dir: String,
) -> Result<String, String> {
    let bytes = crate::embedded_jars::jar_bytes(&plugin_id)
        .ok_or_else(|| format!("Brak wbudowanego jara dla pluginu '{plugin_id}' w tej appce."))?;
    let jar_filename = crate::embedded_jars::jar_filename(&plugin_id).unwrap();

    let dest = Path::new(&dest_dir);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    std::fs::write(dest.join(jar_filename), bytes).map_err(|e| e.to_string())?;

    let config_dir = dest.join(&plugin_folder_name);
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join(&config_filename), config_contents).map_err(|e| e.to_string())?;

    Ok(dest_dir)
}
