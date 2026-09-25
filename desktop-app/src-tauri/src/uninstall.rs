// Prawdziwy deinstalator Windows - ten sam, który widać w "Panel sterowania → Programy i
// funkcje"/"Ustawienia → Aplikacje". Działa TYLKO w zbudowanej/zainstalowanej wersji
// (installer NSIS/WiX rejestruje wpis w rejestrze przy instalacji) - w trybie
// deweloperskim (`cargo run`/`tauri dev`) appka nie jest "zainstalowana", więc nie ma
// czego szukać ani odpalać (find_uninstall_string zwraca None, komenda kończy się
// czytelnym błędem zamiast paniki).
//
// #[tauri::command] musi siedzieć na funkcji bezpośrednio w tym module (nie w zagnieżdżonym
// mod + pub use) - makro generuje obok niej ukryte pomocnicze itemy w TEJ SAMEJ
// przestrzeni nazw, a generate_handler! w lib.rs szuka ich pod ścieżką uninstall::uninstall_app.
// Stąd dwie osobne funkcje o tej samej nazwie, rozdzielone #[cfg(...)], zamiast jednej
// wspólnej z podmodułem per platforma.

#[cfg(target_os = "windows")]
const APP_NAME: &str = "RSMCMANAGER";

#[cfg(target_os = "windows")]
const UNINSTALL_ROOTS: &[(winreg::HKEY, &str)] = &[
    (winreg::enums::HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    (winreg::enums::HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    (
        winreg::enums::HKEY_LOCAL_MACHINE,
        r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ),
];

/// Przechodzi po standardowych gałęziach rejestru, w których instalatory (NSIS/WiX/MSI)
/// rejestrują odinstalowywane programy, i szuka wpisu z naszym DisplayName.
#[cfg(target_os = "windows")]
fn find_uninstall_string() -> Option<String> {
    use winreg::RegKey;
    for &(hive, path) in UNINSTALL_ROOTS {
        let root = RegKey::predef(hive);
        let Ok(uninstall_key) = root.open_subkey(path) else { continue };
        for name in uninstall_key.enum_keys().flatten() {
            let Ok(sub) = uninstall_key.open_subkey(&name) else { continue };
            let Ok(display_name) = sub.get_value::<String, _>("DisplayName") else { continue };
            if display_name != APP_NAME {
                continue;
            }
            if let Ok(uninstall_string) = sub.get_value::<String, _>("UninstallString") {
                return Some(uninstall_string);
            }
        }
    }
    None
}

/// UninstallString bywa zapisany jako `"C:\Sciezka\uninstall.exe" /S` (ścieżka w
/// cudzysłowie, bo może mieć spacje) albo bez cudzysłowu - rozbija to na
/// (ścieżka do exe, reszta argumentów).
#[cfg(target_os = "windows")]
fn split_command(cmd: &str) -> (String, Vec<String>) {
    let cmd = cmd.trim();
    if let Some(rest) = cmd.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            let exe = rest[..end].to_string();
            let args = rest[end + 1..].split_whitespace().map(|s| s.to_string()).collect();
            return (exe, args);
        }
    }
    let mut parts = cmd.split_whitespace();
    let exe = parts.next().unwrap_or("").to_string();
    (exe, parts.map(|s| s.to_string()).collect())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn uninstall_app(app: tauri::AppHandle) -> Result<(), String> {
    use std::process::Command;
    let Some(uninstall_string) = find_uninstall_string() else {
        return Err(
            "Aplikacja nie jest zainstalowana przez instalator (to build deweloperski) - nie ma czego odinstalować.".to_string(),
        );
    };
    let (exe, args) = split_command(&uninstall_string);
    // Odpalamy deinstalator i OD RAZU zamykamy siebie - deinstalator (jak każdy na
    // Windows) nie potrafi skasować pliku .exe appki, dopóki ta jest uruchomiona.
    Command::new(exe).args(args).spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn uninstall_app() -> Result<(), String> {
    Err("Odinstalowywanie z poziomu appki jest dostępne tylko na Windows.".to_string())
}
