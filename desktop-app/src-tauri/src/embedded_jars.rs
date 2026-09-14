// Jary pluginów WBUDOWANE w binarkę appki (include_bytes! w czasie kompilacji) - klient
// appki NIE ma i nie musi mieć kodu źródłowego Mainplugins na dysku, appka po prostu
// już zawiera gotowe do użytku pluginy. Źródło: dist/ z lokalnego build-u Mainplugins,
// skopiowane ręcznie do plugin-jars/ w tym repo.
//
// AKTUALIZACJA WERSJI: jak zbudujesz nowszą wersję pluginów w Mainplugins (mvn package),
// skopiuj świeże jary z Mainplugins/dist/ do desktop-app/src-tauri/plugin-jars/
// (nadpisując stare) i przebuduj appkę - include_bytes! wciąga ich zawartość na nowo
// przy każdej kompilacji, nic więcej nie trzeba zmieniać w kodzie.

macro_rules! jar_entry {
    ($id:literal, $file:literal) => {
        ($id, $file, include_bytes!(concat!("../plugin-jars/", $file)) as &[u8])
    };
}

const JARS: &[(&str, &str, &[u8])] = &[
    jar_entry!("advancements", "mainplugins-advancements-1.0-SNAPSHOT.jar"),
    jar_entry!("announcer", "mainplugins-announcer-1.0-SNAPSHOT.jar"),
    jar_entry!("chatfilter", "mainplugins-chatfilter-1.0-SNAPSHOT.jar"),
    jar_entry!("core", "mainplugins-core-1.0-SNAPSHOT.jar"),
    jar_entry!("crates", "mainplugins-crates-1.0-SNAPSHOT.jar"),
    jar_entry!("dungeons", "mainplugins-dungeons-1.0-SNAPSHOT.jar"),
    jar_entry!("farming", "mainplugins-farming-1.0-SNAPSHOT.jar"),
    jar_entry!("fishing", "mainplugins-fishing-1.0-SNAPSHOT.jar"),
    jar_entry!("generators", "mainplugins-generators-1.0-SNAPSHOT.jar"),
    jar_entry!("hud", "mainplugins-hud-1.0-SNAPSHOT.jar"),
    jar_entry!("market", "mainplugins-market-1.0-SNAPSHOT.jar"),
    jar_entry!("menu", "mainplugins-menu-1.0-SNAPSHOT.jar"),
    jar_entry!("quests", "mainplugins-quests-1.0-SNAPSHOT.jar"),
    jar_entry!("ranks", "mainplugins-ranks-1.0-SNAPSHOT.jar"),
    jar_entry!("redstone", "mainplugins-redstone-1.0-SNAPSHOT.jar"),
    jar_entry!("shop", "mainplugins-shop-1.0-SNAPSHOT.jar"),
    jar_entry!("skyblock", "mainplugins-skyblock-1.0-SNAPSHOT.jar"),
    jar_entry!("spawn", "mainplugins-spawn-1.0-SNAPSHOT.jar"),
    jar_entry!("spawners", "mainplugins-spawners-1.0-SNAPSHOT.jar"),
    jar_entry!("teleport", "mainplugins-teleport-1.0-SNAPSHOT.jar"),
    jar_entry!("tools", "mainplugins-tools-1.0-SNAPSHOT.jar"),
];

/// Bajty jara dla danego id pluginu (patrz JARS), albo None jeśli nieznany.
pub fn jar_bytes(plugin_id: &str) -> Option<&'static [u8]> {
    JARS.iter().find(|(id, _, _)| *id == plugin_id).map(|(_, _, bytes)| *bytes)
}

/// Oryginalna nazwa pliku jara (do zapisu na dysku/serwerze).
pub fn jar_filename(plugin_id: &str) -> Option<&'static str> {
    JARS.iter().find(|(id, _, _)| *id == plugin_id).map(|(_, name, _)| *name)
}

#[derive(serde::Serialize)]
pub struct EmbeddedJarInfo {
    pub id: String,
    pub filename: String,
    pub size: usize,
}

/// Lista wszystkich wbudowanych jarów - do zakładki Wdrożenie, żeby klient appki mógł
/// wybrać, które pluginy wypchnąć na serwer, bez posiadania kodu źródłowego ani Mavena.
#[tauri::command]
pub fn list_embedded_jars() -> Vec<EmbeddedJarInfo> {
    JARS.iter()
        .map(|(id, filename, bytes)| EmbeddedJarInfo {
            id: id.to_string(),
            filename: filename.to_string(),
            size: bytes.len(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn announcer_jar_matches_source_file_byte_for_byte() {
        let embedded = jar_bytes("announcer").expect("announcer jar should be embedded");
        let source = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/plugin-jars/mainplugins-announcer-1.0-SNAPSHOT.jar")).unwrap();
        // Bez sprawdzania konkretnego rozmiaru - zmieniałby się przy każdej aktualizacji jarów.
        assert_eq!(embedded, source.as_slice());
        assert!(!embedded.is_empty());
    }

    #[test]
    fn all_21_jars_are_findable() {
        for id in ["advancements","announcer","chatfilter","core","crates","dungeons","farming","fishing","generators","hud","market","menu","quests","ranks","redstone","shop","skyblock","spawn","spawners","teleport","tools"] {
            assert!(jar_bytes(id).is_some(), "missing jar for {id}");
            assert!(jar_filename(id).is_some(), "missing filename for {id}");
        }
        assert!(jar_bytes("nonexistent-plugin").is_none());
    }
}
