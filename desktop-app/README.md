# PluginManager

Desktopowa apka (Tauri + React + TypeScript) do zarządzania Twoimi autorskimi pluginami Minecraft: skanuje lokalne
projekty IntelliJ, edytuje configi na serwerze przez SFTP, przeładowuje je przez RCON i zawiera wizualny kreator
custom itemów.

## Uruchomienie

```
cd desktop-app
npm install
npm run tauri dev
```

## Sekcje aplikacji

- **Workspace** — dwa tryby skanowania w poszukiwaniu `plugin.yml` (luzem albo spakowanego wewnątrz `.jar`):
  - *Lokalnie* — wskazujesz folder z projektami (np. `IdeaProjects`) lub z zbudowanymi `.jar`-ami.
  - *Serwer (SFTP)* — skanuje zdalny folder `plugins` bezpośrednio na serwerze. Przydatne, gdy `plugin.yml` powstaje
    dopiero przy buildzie/wdrożeniu i lokalnie go po prostu nie ma.
- **Serwery** — profile połączeń: SFTP (hasło lub klucz prywatny) do wysyłki plików configów oraz RCON do
  przeładowania pluginu bez restartu serwera. Hasła trzymane są w Menedżerze poświadczeń Windows (`keyring`), nie w
  plikach na dysku.
- **Edytor configów** — przegląda zdalny folder `plugins` po SFTP, otwiera dowolny plik YAML w edytorze, zapisuje
  zmiany z powrotem na serwer i pozwala wysłać komendę RCON (np. reload pluginu).
- **Kreator itemów** — wizualny formularz (materiał, nazwa, lore, enchanty, custom model data, unbreakable, item
  flags) zapisujący definicje do pliku `items.yml` na serwerze.

## Format items.yml

Kreator itemów zapisuje/wczytuje plik YAML w takim kształcie:

```yaml
excalibur:
  material: DIAMOND_SWORD
  displayName: "&b&lExcalibur"
  lore:
    - "&7Legendarny miecz"
  customModelData: 1001
  unbreakable: true
  amount: 1
  enchantments:
    - type: SHARPNESS
      level: 5
  itemFlags:
    - HIDE_ENCHANTS
```

Żeby plugin faktycznie tworzył takie itemy w grze, potrzebuje po swojej stronie loadera czytającego ten plik i
budującego `ItemStack`, np.:

```java
ItemStack build(ConfigurationSection section) {
    ItemStack item = new ItemStack(Material.valueOf(section.getString("material")));
    ItemMeta meta = item.getItemMeta();
    meta.setDisplayName(ChatColor.translateAlternateColorCodes('&', section.getString("displayName")));
    meta.setLore(section.getStringList("lore").stream()
            .map(l -> ChatColor.translateAlternateColorCodes('&', l))
            .toList());
    if (section.contains("customModelData")) {
        meta.setCustomModelData(section.getInt("customModelData"));
    }
    meta.setUnbreakable(section.getBoolean("unbreakable"));
    for (String flag : section.getStringList("itemFlags")) {
        meta.addItemFlags(ItemFlag.valueOf(flag));
    }
    item.setItemMeta(meta);
    for (ConfigurationSection ench : section.getConfigurationSection("enchantments").getKeys(false)...) {
        item.addUnsafeEnchantment(Enchantment.getByName(ench.getString("type")), ench.getInt("level"));
    }
    item.setAmount(section.getInt("amount", 1));
    return item;
}
```

Dopasuj nazwę komendy reloadu w pluginie (np. `/items reload`) i wpisz ją w polu RCON w apce po zapisaniu itemu.

## Backend (Rust / src-tauri)

- `workspace.rs` — skanowanie lokalnych projektów po `plugin.yml`.
- `profiles.rs` — CRUD profili serwerów; metadane w `%APPDATA%/.../server_profiles.json`, sekrety w OS keychain.
- `sftp.rs` — połączenie SSH (russh) + sesja SFTP (russh-sftp): listowanie katalogów, odczyt/zapis plików.
- `rcon.rs` — minimalny klient protokołu Source RCON (autoryzacja + jedna komenda na wywołanie).
