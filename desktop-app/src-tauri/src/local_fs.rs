// Serwer "na tym komputerze": te same operacje co sftp.rs (lista, odczyt, zapis), ale
// prosto na dysku, w folderze serwera wskazanym w profilu. Każda ścieżka musi leżeć
// wewnątrz tego folderu - appka nie może przez pomyłkę pisać gdziekolwiek indziej.

use crate::models::RemoteEntry;
use std::path::{Component, PathBuf};

fn normalize(p: &str) -> String {
    p.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

/// Ścieżka z appki -> plik na dysku, tylko jeśli leży w folderze serwera `root`.
pub fn resolve(root: &str, path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if candidate.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!("Path '{path}' may not contain '..'."));
    }
    let root_n = normalize(root);
    let path_n = normalize(path);
    if root_n.is_empty() || !(path_n == root_n || path_n.starts_with(&format!("{root_n}/"))) {
        return Err(format!("Path '{path}' is outside the server folder '{root}'."));
    }
    Ok(candidate)
}

pub fn list_dir(root: &str, path: &str) -> Result<Vec<RemoteEntry>, String> {
    let dir = resolve(root, path)?;
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = if path.ends_with('/') || path.ends_with('\\') {
            format!("{path}{name}")
        } else {
            format!("{path}/{name}")
        };
        entries.push(RemoteEntry { name, path: entry_path, is_dir: metadata.is_dir(), size: metadata.len() });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}

pub fn read_file(root: &str, path: &str) -> Result<String, String> {
    let file = resolve(root, path)?;
    std::fs::read_to_string(&file).map_err(|e| format!("{}: {e}", file.display()))
}

/// Zapis z utworzeniem brakujących folderów (np. pierwsze wgranie pluginu do pustego plugins/).
pub fn write_bytes(root: &str, path: &str, bytes: &[u8]) -> Result<(), String> {
    let file = resolve(root, path)?;
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(&file, bytes).map_err(|e| format!("{}: {e}", file.display()))
}

/// Odczyt binarny - w odróżnieniu od read_file (String, zakłada UTF-8) bezpieczny dla
/// dowolnych plików, np. schematów .nbt/.schem, które nie są tekstem.
pub fn read_bytes(root: &str, path: &str) -> Result<Vec<u8>, String> {
    let file = resolve(root, path)?;
    std::fs::read(&file).map_err(|e| format!("{}: {e}", file.display()))
}

pub fn delete_file(root: &str, path: &str) -> Result<(), String> {
    let file = resolve(root, path)?;
    std::fs::remove_file(&file).map_err(|e| format!("{}: {e}", file.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root() -> String {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("pm-local-fs-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.to_string_lossy().replace('\\', "/")
    }

    #[test]
    fn read_bytes_roundtrips_non_utf8_content_and_delete_removes_the_file() {
        let root = temp_root();
        let path = format!("{root}/schematics/wyspa.nbt");
        let binary = [0u8, 159, 146, 150, 255, 0, 1, 2];
        write_bytes(&root, &path, &binary).unwrap();
        assert_eq!(read_bytes(&root, &path).unwrap(), binary.to_vec());

        delete_file(&root, &path).unwrap();
        assert!(read_bytes(&root, &path).is_err());
    }

    #[test]
    fn write_creates_folders_and_read_returns_the_same_text() {
        let root = temp_root();
        let path = format!("{root}/plugins/MainpluginsCore/items/test.yml");
        write_bytes(&root, &path, "items:\n  A: {}\n".as_bytes()).unwrap();
        assert_eq!(read_file(&root, &path).unwrap(), "items:\n  A: {}\n");
    }

    #[test]
    fn list_puts_folders_first_and_builds_child_paths() {
        let root = temp_root();
        write_bytes(&root, &format!("{root}/plugins/b.yml"), b"x").unwrap();
        write_bytes(&root, &format!("{root}/plugins/a/c.yml"), b"x").unwrap();
        let entries = list_dir(&root, &format!("{root}/plugins")).unwrap();
        let names: Vec<_> = entries.iter().map(|e| (e.name.as_str(), e.is_dir)).collect();
        assert_eq!(names, vec![("a", true), ("b.yml", false)]);
        assert_eq!(entries[1].path, format!("{root}/plugins/b.yml"));
    }

    #[test]
    fn paths_outside_the_server_folder_are_rejected() {
        let root = temp_root();
        assert!(resolve(&root, "C:/Windows/system32/x.dll").is_err());
        assert!(resolve(&root, &format!("{root}/plugins/../../evil.txt")).is_err());
        assert!(resolve(&format!("{root}/serv"), &format!("{root}/server2/x.yml")).is_err());
        assert!(resolve("", &format!("{root}/x.yml")).is_err());
    }

    #[test]
    fn slashes_and_letter_case_do_not_matter_inside_the_folder() {
        let root = temp_root();
        let windows_style = format!("{}\\PLUGINS\\x.yml", root.replace('/', "\\"));
        assert!(resolve(&root, &windows_style).is_ok());
        assert!(resolve(&format!("{root}/"), &format!("{root}/plugins/x.yml")).is_ok());
    }
}
