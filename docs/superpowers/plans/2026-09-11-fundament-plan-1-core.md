# Foundation Plan 1 - Core: languages, item catalog, shared rewards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `mainplugins-core` three shared services: `LangService` (en/pl message files), an upgraded item catalog (`items/` folder, enchants, unbreakable, `idOf`, providers, plugin defaults) and `RewardService` (one reward format for every plugin).

**Architecture:** Every piece has a pure-Java core (no running server needed), which is unit-tested with JUnit 5, plus a thin Bukkit layer (`*Manager`, `BukkitRewardSink`) registered in the Bukkit `ServicesManager` and exposed through `CoreAPI`, following the existing core pattern. Rewards the core cannot give by itself (`key`, `title`, …) are passed to handlers that other plugins register by type name. Core never depends on those plugins.

**Tech Stack:** Java 25, Paper API 26.2 (`26.2.build.112-stable`), Maven multi-module, JUnit 5, Bukkit `YamlConfiguration`, Adventure `LegacyComponentSerializer`.

**Spec:** `C:\Users\Zgredek\pluginmanager\docs\superpowers\specs\2026-09-11-fundament-design.md` (this plan covers parts A, B and E on the core side).

## Global Constraints

- Code repo: `D:\folder z mc`, branch `Karol`. Commit after every task. Stage **only** the files listed in the task. Never stage `docs/configi-zewnetrzne/*` (someone else's uncommitted deletions) or `docs/Zrzut ekranu 2026-08-31 164214.png`. **No push.**
- Build and tests from **PowerShell** (not Git Bash). The Maven binary is `D:\intelia\IntelliJ IDEA 2026.2.0.1\plugins\maven-plugin\lib\maven3\bin\mvn.cmd`. In steps below it is written as `& $mvn`; define it first: `$mvn = "D:\intelia\IntelliJ IDEA 2026.2.0.1\plugins\maven-plugin\lib\maven3\bin\mvn.cmd"`.
- Core test command: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test` (add `-Dtest=ClassName` for one class).
- Config keys and default player/admin texts are **English**. Every text a player or admin sees in chat goes through `LangService` with keys in `lang/en.yml` **and** `lang/pl.yml`. Server log lines are English.
- Code comments and javadoc are Polish, short, in the style of the existing core code.
- No backward compatibility with old config formats (spec §2).
- Money: the economy stores grosze (1 = 100 grosze). Rewards convert with `Math.round(amount * 100)`.
- A missing plugin, item or handler never throws. The entry is skipped with a log warning, or its `fallback` is given instead (spec A).
- Maven resource filtering is ON for `src/main/resources`, so never write `${` in any `.yml` resource.
- **Not in this plan** (later plans): Vault/PlaceholderAPI/command renaming (spec C → Plan 2), app editors (Plan 3), migrating individual plugins to the new services (pilot + per-plugin plans), per-plugin "works alone" checks (spec D).
- **Known side effect:** after Task 5 the core reads `items/*.yml` instead of `custom-items.yml`. The app page `CustomItemsPage.tsx` (edits `custom-items.yml` over SFTP) stays out of date until Plan 3 fixes it. Acceptable: there are no clients yet.

---

## File Structure

All paths are relative to `D:\folder z mc\mainplugins-core\`.

| File | Status | Responsibility |
|---|---|---|
| `pom.xml` | modify | JUnit 5 + surefire |
| `src/main/resources/config.yml` | create | `language`, `test-rewards` |
| `src/main/resources/lang/en.yml`, `lang/pl.yml` | create | core messages |
| `src/main/java/elo/mainplugins/core/lang/MessageCatalog.java` | create | pure: layered key→text lookup, placeholders, flatten YAML |
| `src/main/java/elo/mainplugins/core/api/LangService.java` | create | public contract |
| `src/main/java/elo/mainplugins/core/lang/LangManager.java` | create | Bukkit impl: copy/load lang files per plugin |
| `src/main/java/elo/mainplugins/core/customitem/ItemSpec.java` | create | pure record of one item entry |
| `src/main/java/elo/mainplugins/core/customitem/ItemSpecParser.java` | create | pure: YAML file → `List<ItemSpec>` |
| `src/main/java/elo/mainplugins/core/customitem/ItemCatalog.java` | create | pure: merge files, duplicates, case-insensitive lookup |
| `src/main/java/elo/mainplugins/core/customitem/DefaultItemMerger.java` | create | pure: which plugin defaults are missing, copy them |
| `src/main/java/elo/mainplugins/core/api/CustomItemProvider.java` | create | contract for plugins that build stateful items |
| `src/main/java/elo/mainplugins/core/api/CustomItemService.java` | modify | new methods |
| `src/main/java/elo/mainplugins/core/customitem/CustomItemDefinition.java` | modify | + enchants, unbreakable |
| `src/main/java/elo/mainplugins/core/customitem/CustomItemManager.java` | rewrite | folder loading, providers, defaults, idOf |
| `src/main/resources/items/examples.yml`, `items/quests.yml`, `items/fishing.yml` | create | split of old `custom-items.yml` |
| `src/main/resources/custom-items.yml` | delete | replaced by `items/` |
| `src/main/java/elo/mainplugins/core/api/Reward.java` | create | one parsed reward |
| `src/main/java/elo/mainplugins/core/api/RewardHandler.java` | create | contract for plugin reward types |
| `src/main/java/elo/mainplugins/core/api/RewardService.java` | create | public contract |
| `src/main/java/elo/mainplugins/core/reward/RewardParser.java` | create | pure: YAML list → `List<Reward>` |
| `src/main/java/elo/mainplugins/core/reward/RewardSink.java` | create | what the giver needs from the world |
| `src/main/java/elo/mainplugins/core/reward/RewardGiver.java` | create | pure: give + fallback + messages |
| `src/main/java/elo/mainplugins/core/reward/BukkitRewardSink.java` | create | Bukkit impl of the sink |
| `src/main/java/elo/mainplugins/core/reward/RewardManager.java` | create | `RewardService` impl + handler registry |
| `src/main/java/elo/mainplugins/core/CoreAPI.java` | modify | `getLangService()`, `getRewardService()` |
| `src/main/java/elo/mainplugins/core/MainpluginsCore.java` | modify | wiring + 2 admin commands |
| `src/main/resources/plugin.yml` | modify | `@rewardtest`, `@reloadlang` |
| `src/test/java/elo/mainplugins/core/...` | create | unit tests |

---

### Task 1: Test setup (JUnit 5)

**Files:**
- Modify: `mainplugins-core/pom.xml`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/YamlSmokeTest.java`

**Interfaces:**
- Consumes: nothing
- Produces: working `mvn -pl mainplugins-core test`. Also confirms that Bukkit `YamlConfiguration` works in plain unit tests, which every later task relies on.

- [ ] **Step 1: Write the smoke test**

```java
package elo.mainplugins.core;

import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Sprawdza, że YamlConfiguration z Paper API działa w zwykłym teście, bez serwera. */
class YamlSmokeTest {

    @Test
    void yamlConfigurationWorksWithoutServer() throws Exception {
        YamlConfiguration yaml = new YamlConfiguration();
        yaml.loadFromString("a:\n  b: 5\n");
        assertEquals(5, yaml.getInt("a.b"));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails because JUnit is missing**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test`
Expected: compilation FAIL, `package org.junit.jupiter.api does not exist`.

- [ ] **Step 3: Add JUnit 5 and surefire to `mainplugins-core/pom.xml`**

Replace the whole file with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>elo</groupId>
        <artifactId>mainplugins-parent</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>

    <artifactId>mainplugins-core</artifactId>
    <packaging>jar</packaging>
    <name>Mainplugins - Core</name>

    <dependencies>
        <!-- Testy jednostkowe czystej logiki (parsery configów) - nie trafiają do jara -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.11.4</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.5.2</version>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test`
Expected: exit code 0, no failures. If `YamlConfiguration` throws because Bukkit is not initialised, STOP and report it: every later task assumes this works.

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/pom.xml mainplugins-core/src/test/java/elo/mainplugins/core/YamlSmokeTest.java; git commit -m "Core: JUnit 5 do testow jednostkowych"
```

---

### Task 2: MessageCatalog (pure language lookup)

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/lang/MessageCatalog.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/lang/MessageCatalogTest.java`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `new MessageCatalog(List<Map<String,String>> layers, Consumer<String> warn)`: layers in priority order (first wins).
  - `String resolve(String key, Map<String,String> placeholders)`: placeholder map keys have no braces (`"amount"` replaces `{amount}`). A missing key returns the key itself and warns once per key.
  - `static Map<String,String> flatten(ConfigurationSection section)`: nested keys become dotted (`reward.money`), and string lists are joined with `\n`.

- [ ] **Step 1: Write the failing test**

```java
package elo.mainplugins.core.lang;

import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class MessageCatalogTest {

    private final List<String> warnings = new ArrayList<>();

    @Test
    void firstLayerWins() {
        MessageCatalog c = new MessageCatalog(List.of(Map.of("a", "PL"), Map.of("a", "EN")), warnings::add);
        assertEquals("PL", c.resolve("a", Map.of()));
    }

    @Test
    void fallsBackToLaterLayer() {
        MessageCatalog c = new MessageCatalog(List.of(Map.of(), Map.of("a", "EN")), warnings::add);
        assertEquals("EN", c.resolve("a", Map.of()));
        assertTrue(warnings.isEmpty());
    }

    @Test
    void missingKeyReturnsKeyAndWarnsOnce() {
        MessageCatalog c = new MessageCatalog(List.of(Map.of()), warnings::add);
        assertEquals("x.y", c.resolve("x.y", Map.of()));
        assertEquals("x.y", c.resolve("x.y", Map.of()));
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("x.y"));
    }

    @Test
    void replacesPlaceholders() {
        MessageCatalog c = new MessageCatalog(List.of(Map.of("m", "Hi {player}, +{amount}")), warnings::add);
        assertEquals("Hi Steve, +500", c.resolve("m", Map.of("player", "Steve", "amount", "500")));
    }

    @Test
    void flattenReadsNestedKeysAndJoinsLists() throws Exception {
        YamlConfiguration y = new YamlConfiguration();
        y.loadFromString("reward:\n  money: \"&aYou got {amount}\"\nhelp:\n  - line one\n  - line two\n");
        Map<String, String> flat = MessageCatalog.flatten(y);
        assertEquals("&aYou got {amount}", flat.get("reward.money"));
        assertEquals("line one\nline two", flat.get("help"));
        assertFalse(flat.containsKey("reward"));
    }
}
```

- [ ] **Step 2: Run and confirm it fails**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=MessageCatalogTest`
Expected: compilation FAIL, `cannot find symbol ... MessageCatalog`.

- [ ] **Step 3: Implement**

```java
package elo.mainplugins.core.lang;

import org.bukkit.configuration.ConfigurationSection;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * Czysta logika tłumaczeń (bez serwera): lista warstw klucz→tekst w kolejności
 * ważności (np. plik serwera w wybranym języku, domyślny z jara, potem angielski).
 * Brak klucza we wszystkich warstwach = zwracamy sam klucz + jedno ostrzeżenie w logu.
 */
public final class MessageCatalog {

    private final List<Map<String, String>> layers;
    private final Consumer<String> warn;
    private final Set<String> warned = ConcurrentHashMap.newKeySet();

    public MessageCatalog(List<Map<String, String>> layers, Consumer<String> warn) {
        this.layers = List.copyOf(layers);
        this.warn = warn;
    }

    public String resolve(String key, Map<String, String> placeholders) {
        String text = null;
        for (Map<String, String> layer : layers) {
            text = layer.get(key);
            if (text != null) break;
        }
        if (text == null) {
            if (warned.add(key)) warn.accept("Missing message '" + key + "' in every language file.");
            return key;
        }
        for (Map.Entry<String, String> e : placeholders.entrySet()) {
            text = text.replace("{" + e.getKey() + "}", e.getValue());
        }
        return text;
    }

    /** Spłaszcza plik językowy: "reward.money" -> tekst, listy łączone znakiem nowej linii. */
    public static Map<String, String> flatten(ConfigurationSection section) {
        Map<String, String> out = new HashMap<>();
        for (String key : section.getKeys(true)) {
            if (section.isString(key)) out.put(key, section.getString(key));
            else if (section.isList(key)) out.put(key, String.join("\n", section.getStringList(key)));
        }
        return out;
    }
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=MessageCatalogTest`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/lang/MessageCatalog.java mainplugins-core/src/test/java/elo/mainplugins/core/lang/MessageCatalogTest.java; git commit -m "Core: MessageCatalog - warstwowe tlumaczenia z fallbackiem"
```

---

### Task 3: LangService + LangManager + core config and lang files

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/api/LangService.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/lang/LangManager.java`
- Create: `mainplugins-core/src/main/resources/config.yml`
- Create: `mainplugins-core/src/main/resources/lang/en.yml`
- Create: `mainplugins-core/src/main/resources/lang/pl.yml`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/CoreAPI.java`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java`
- Modify: `mainplugins-core/src/main/resources/plugin.yml`

**Interfaces:**
- Consumes: `MessageCatalog` (Task 2)
- Produces:
  - `LangService`:
    - `void registerDefaults(Plugin owner)`
    - `String language()`
    - `Component msg(Plugin owner, String key, Map<String,String> placeholders)`
    - `default Component msg(Plugin owner, String key)`
    - `void send(CommandSender to, Plugin owner, String key, Map<String,String> placeholders)`
    - `default void send(CommandSender to, Plugin owner, String key)`
    - `void reload()`
  - `CoreAPI.getLangService()` throws `IllegalStateException` when the service is missing.
  - Core lang keys: `reward.money`, `reward.item`, `reward.custom`, `items.reloaded`, `lang.reloaded`, `admin.player-not-found`, `admin.rewardtest.usage`, `admin.rewardtest.done`.
  - Command `/@reloadlang`.

- [ ] **Step 1: Create `LangService`**

```java
package elo.mainplugins.core.api;

import net.kyori.adventure.text.Component;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.Plugin;

import java.util.Map;

/**
 * Wspólne tłumaczenia wszystkich pluginów Mainplugins. Każdy plugin trzyma napisy w
 * swoim jarze w lang/en.yml i lang/pl.yml; przy starcie woła {@link #registerDefaults(Plugin)},
 * co kopiuje brakujące pliki do plugins/<Plugin>/lang/. Język serwera = "language" w
 * config.yml core. Brak napisu w wybranym języku -> angielski -> sam klucz (+ ostrzeżenie).
 * Kolory "&", placeholdery w klamrach: {player}, {amount}.
 */
public interface LangService {

    /** Wołać w onEnable pluginu, zanim użyje msg/send. */
    void registerDefaults(Plugin owner);

    /** Aktualny kod języka serwera, np. "en". */
    String language();

    Component msg(Plugin owner, String key, Map<String, String> placeholders);

    default Component msg(Plugin owner, String key) {
        return msg(owner, key, Map.of());
    }

    void send(CommandSender to, Plugin owner, String key, Map<String, String> placeholders);

    default void send(CommandSender to, Plugin owner, String key) {
        send(to, owner, key, Map.of());
    }

    /** Czyta na nowo język z config.yml core i pliki językowe wszystkich zarejestrowanych pluginów. */
    void reload();
}
```

- [ ] **Step 2: Create `LangManager`**

```java
package elo.mainplugins.core.lang;

import elo.mainplugins.core.api.LangService;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Implementacja {@link LangService} - warstwy: plik serwera (język), jar (język), plik serwera (en), jar (en). */
public final class LangManager implements LangService {

    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();
    private static final String ENGLISH = "en";
    private static final List<String> BUNDLED = List.of("en", "pl");

    private final JavaPlugin core;
    private final Map<String, Plugin> owners = new LinkedHashMap<>();
    private final Map<String, MessageCatalog> catalogs = new HashMap<>();
    private String language;

    public LangManager(JavaPlugin core) {
        this.core = core;
        this.language = readLanguage();
    }

    private String readLanguage() {
        String code = core.getConfig().getString("language", ENGLISH);
        return code == null || code.isBlank() ? ENGLISH : code.trim().toLowerCase(Locale.ROOT);
    }

    @Override
    public String language() {
        return language;
    }

    @Override
    public void registerDefaults(Plugin owner) {
        for (String code : BUNDLED) {
            String path = "lang/" + code + ".yml";
            if (owner.getResource(path) != null && !new File(owner.getDataFolder(), path).exists()) {
                owner.saveResource(path, false);
            }
        }
        owners.put(owner.getName(), owner);
        catalogs.put(owner.getName(), build(owner));
    }

    private MessageCatalog build(Plugin owner) {
        List<Map<String, String>> layers = new ArrayList<>();
        layers.add(fromDisk(owner, language));
        layers.add(fromJar(owner, language));
        if (!language.equals(ENGLISH)) {
            layers.add(fromDisk(owner, ENGLISH));
            layers.add(fromJar(owner, ENGLISH));
        }
        return new MessageCatalog(layers, msg -> owner.getLogger().warning(msg));
    }

    private Map<String, String> fromDisk(Plugin owner, String code) {
        File file = new File(owner.getDataFolder(), "lang/" + code + ".yml");
        return file.exists() ? MessageCatalog.flatten(YamlConfiguration.loadConfiguration(file)) : Map.of();
    }

    private Map<String, String> fromJar(Plugin owner, String code) {
        InputStream in = owner.getResource("lang/" + code + ".yml");
        if (in == null) return Map.of();
        try (Reader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
            return MessageCatalog.flatten(YamlConfiguration.loadConfiguration(reader));
        } catch (IOException e) {
            owner.getLogger().warning("Could not read bundled lang/" + code + ".yml: " + e.getMessage());
            return Map.of();
        }
    }

    @Override
    public Component msg(Plugin owner, String key, Map<String, String> placeholders) {
        MessageCatalog catalog = catalogs.get(owner.getName());
        if (catalog == null) {
            core.getLogger().warning(owner.getName() + " asked for message '" + key
                    + "' without calling LangService.registerDefaults first.");
            return Component.text(key);
        }
        return SERIALIZER.deserialize(catalog.resolve(key, placeholders));
    }

    @Override
    public void send(CommandSender to, Plugin owner, String key, Map<String, String> placeholders) {
        to.sendMessage(msg(owner, key, placeholders));
    }

    @Override
    public void reload() {
        core.reloadConfig();
        language = readLanguage();
        for (Plugin owner : owners.values()) catalogs.put(owner.getName(), build(owner));
    }
}
```

- [ ] **Step 3: Create resources**

`mainplugins-core/src/main/resources/config.yml`:

```yaml
# Server language for every Mainplugins plugin: "en" or "pl".
# You can add your own language: copy plugins/<Plugin>/lang/en.yml to lang/<code>.yml,
# translate it and put the code here. Missing texts fall back to English.
language: en

# Admin helper: /@rewardtest <player> gives this list (handy for checking reward setups).
test-rewards:
  - money: 100
  - item: DIAMOND
    amount: 2
```

`mainplugins-core/src/main/resources/lang/en.yml`:

```yaml
# Mainplugins Core - English messages. Colors: &a &e ...  Placeholders: {name}
reward:
  money: "&aYou received &e{amount}$&a."
  item: "&aYou received &e{amount}x {item}&a."
  custom: "&aYou received &e{amount}x {item}&a."
items:
  reloaded: "&aItem catalog reloaded."
lang:
  reloaded: "&aLanguage files reloaded (language: {language})."
admin:
  player-not-found: "&cPlayer not found: {player}"
  rewardtest:
    usage: "&cUsage: /@rewardtest <player>"
    done: "&aGave test-rewards to {player}."
```

`mainplugins-core/src/main/resources/lang/pl.yml`:

```yaml
# Mainplugins Core - komunikaty po polsku. Kolory: &a &e ...  Placeholdery: {nazwa}
reward:
  money: "&aOtrzymujesz &e{amount}$&a."
  item: "&aOtrzymujesz &e{amount}x {item}&a."
  custom: "&aOtrzymujesz &e{amount}x {item}&a."
items:
  reloaded: "&aKatalog itemów przeładowany."
lang:
  reloaded: "&aPliki językowe przeładowane (język: {language})."
admin:
  player-not-found: "&cNie znaleziono gracza: {player}"
  rewardtest:
    usage: "&cUżycie: /@rewardtest <gracz>"
    done: "&aWydano test-rewards graczowi {player}."
```

- [ ] **Step 4: Add `getLangService()` to `CoreAPI`**

Add the import `import elo.mainplugins.core.api.LangService;` and this method after `getLicenseService()`:

```java
    /** Tłumaczenia (patrz {@link LangService}) - rejestruje go samo core, rzuca jak {@link #getEconomyService()}. */
    public static LangService getLangService() {
        RegisteredServiceProvider<LangService> rsp = Bukkit.getServicesManager().getRegistration(LangService.class);
        if (rsp == null) {
            throw new IllegalStateException("MainpluginsCore nie jest włączony lub nie zarejestrował jeszcze LangService - sprawdź plugin.yml (depend: [MainpluginsCore]).");
        }
        return rsp.getProvider();
    }
```

- [ ] **Step 5: Wire it in `MainpluginsCore.onEnable`**

Add the imports `elo.mainplugins.core.api.LangService` and `elo.mainplugins.core.lang.LangManager`. Add the field `private LangManager langManager;`. At the very start of `onEnable()`, right after the first `getLogger().info(...)` line, insert:

```java
        saveDefaultConfig();
        langManager = new LangManager(this);
        getServer().getServicesManager().register(LangService.class, langManager, this, ServicePriority.Normal);
        langManager.registerDefaults(this);
```

Before the final `getLogger().info("MainpluginsCore włączony ...")` line, add:

```java
        if (getCommand("@reloadlang") != null) {
            getCommand("@reloadlang").setExecutor((sender, command, label, args) -> {
                langManager.reload();
                langManager.send(sender, this, "lang.reloaded", java.util.Map.of("language", langManager.language()));
                return true;
            });
            getCommand("@reloadlang").setTabCompleter((sender, command, alias, args) -> TabCompleteUtils.PUSTA);
        }
```

- [ ] **Step 6: Register the command in `plugin.yml`**

Add under `commands:` (after `"@reloadcustomitems"`):

```yaml
  "@reloadlang":
    description: (Admin) Reload language files of every Mainplugins plugin
    permission: mainplugins.core.reloadlang
    permission-message: "&cNie masz permisji do tej komendy!"
```

Add under `permissions:`:

```yaml
  mainplugins.core.reloadlang:
    description: Access to /@reloadlang
    default: op
```

- [ ] **Step 7: Build and run all core tests**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test`
Expected: exit code 0 (compiles, 6 tests pass).

- [ ] **Step 8: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/api/LangService.java mainplugins-core/src/main/java/elo/mainplugins/core/lang/LangManager.java mainplugins-core/src/main/resources/config.yml mainplugins-core/src/main/resources/lang/en.yml mainplugins-core/src/main/resources/lang/pl.yml mainplugins-core/src/main/java/elo/mainplugins/core/CoreAPI.java mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java mainplugins-core/src/main/resources/plugin.yml; git commit -m "Core: LangService - pliki jezykowe en/pl dla wszystkich pluginow"
```

---

### Task 4: Pure item catalog logic (ItemSpec, parser, catalog, default merger)

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/customitem/ItemSpec.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/customitem/ItemSpecParser.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/customitem/ItemCatalog.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/customitem/DefaultItemMerger.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/customitem/ItemSpecParserTest.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/customitem/ItemCatalogTest.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/customitem/DefaultItemMergerTest.java`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `record ItemSpec(String id, String material, String name, List<String> lore, String model, boolean glint, Map<String,Integer> enchants, boolean unbreakable, String sourceFile)`: enchant keys are lower-case.
  - `ItemSpecParser.parseFile(ConfigurationSection root, String fileName, Consumer<String> warn) → List<ItemSpec>`
  - `ItemCatalog.build(List<ItemSpec> specsInLoadOrder, Consumer<String> warn) → ItemCatalog`, with `ItemSpec get(String id)` (case-insensitive, null-safe), `boolean contains(String id)` and `Set<String> ids()` (original spelling, load order).
  - `DefaultItemMerger.missingIds(ConfigurationSection defaultsRoot, ItemCatalog catalog) → List<String>`
  - `DefaultItemMerger.copyEntries(ConfigurationSection defaultsRoot, ConfigurationSection target, List<String> ids)`

- [ ] **Step 1: Write the failing tests**

`ItemSpecParserTest.java`:

```java
package elo.mainplugins.core.customitem;

import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ItemSpecParserTest {

    private final List<String> warnings = new ArrayList<>();

    private static YamlConfiguration yaml(String text) throws Exception {
        YamlConfiguration y = new YamlConfiguration();
        y.loadFromString(text);
        return y;
    }

    @Test
    void parsesAllFields() throws Exception {
        List<ItemSpec> specs = ItemSpecParser.parseFile(yaml("""
                items:
                  MAGIC_SWORD:
                    material: DIAMOND_SWORD
                    name: "&bMagic"
                    lore: ["&7line"]
                    model: "mainplugins:magic"
                    glint: true
                    unbreakable: true
                    enchants:
                      Sharpness: 5
                      unbreaking: 3
                """), "a.yml", warnings::add);

        assertEquals(1, specs.size());
        ItemSpec s = specs.get(0);
        assertEquals("MAGIC_SWORD", s.id());
        assertEquals("DIAMOND_SWORD", s.material());
        assertEquals("&bMagic", s.name());
        assertEquals(List.of("&7line"), s.lore());
        assertEquals("mainplugins:magic", s.model());
        assertTrue(s.glint());
        assertTrue(s.unbreakable());
        assertEquals(Map.of("sharpness", 5, "unbreaking", 3), s.enchants());
        assertEquals("a.yml", s.sourceFile());
        assertTrue(warnings.isEmpty());
    }

    @Test
    void optionalFieldsHaveDefaults() throws Exception {
        ItemSpec s = ItemSpecParser.parseFile(yaml("items:\n  ROCK:\n    material: STONE\n"), "a.yml", warnings::add).get(0);
        assertNull(s.name());
        assertEquals(List.of(), s.lore());
        assertNull(s.model());
        assertFalse(s.glint());
        assertFalse(s.unbreakable());
        assertEquals(Map.of(), s.enchants());
    }

    @Test
    void entryWithoutMaterialIsSkipped() throws Exception {
        List<ItemSpec> specs = ItemSpecParser.parseFile(yaml("items:\n  BAD:\n    name: x\n  OK:\n    material: STONE\n"), "a.yml", warnings::add);
        assertEquals(List.of("OK"), specs.stream().map(ItemSpec::id).toList());
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("BAD"));
    }

    @Test
    void enchantWithLevelBelowOneIsDropped() throws Exception {
        ItemSpec s = ItemSpecParser.parseFile(yaml("items:\n  X:\n    material: STONE\n    enchants:\n      sharpness: 0\n"), "a.yml", warnings::add).get(0);
        assertEquals(Map.of(), s.enchants());
        assertEquals(1, warnings.size());
    }

    @Test
    void fileWithoutItemsSectionGivesNothing() throws Exception {
        assertEquals(List.of(), ItemSpecParser.parseFile(yaml("other: 1\n"), "a.yml", warnings::add));
        assertEquals(1, warnings.size());
    }
}
```

`ItemCatalogTest.java`:

```java
package elo.mainplugins.core.customitem;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ItemCatalogTest {

    private final List<String> warnings = new ArrayList<>();

    private static ItemSpec spec(String id, String material, String file) {
        return new ItemSpec(id, material, null, List.of(), null, false, Map.of(), false, file);
    }

    @Test
    void lookupIsCaseInsensitive() {
        ItemCatalog c = ItemCatalog.build(List.of(spec("GENERATOR_BRUK_T1", "STONE", "a.yml")), warnings::add);
        assertTrue(c.contains("generator_bruk_t1"));
        assertEquals("GENERATOR_BRUK_T1", c.get("Generator_Bruk_T1").id());
        assertNull(c.get(null));
    }

    @Test
    void duplicateKeepsFirstAndWarns() {
        ItemCatalog c = ItemCatalog.build(List.of(spec("X", "STONE", "a.yml"), spec("x", "DIRT", "b.yml")), warnings::add);
        assertEquals("STONE", c.get("x").material());
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("a.yml") && warnings.get(0).contains("b.yml"));
    }

    @Test
    void idsKeepOriginalSpelling() {
        ItemCatalog c = ItemCatalog.build(List.of(spec("Magic_Sword", "STONE", "a.yml")), warnings::add);
        assertEquals(Set.of("Magic_Sword"), c.ids());
    }
}
```

`DefaultItemMergerTest.java`:

```java
package elo.mainplugins.core.customitem;

import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DefaultItemMergerTest {

    private static YamlConfiguration yaml(String text) throws Exception {
        YamlConfiguration y = new YamlConfiguration();
        y.loadFromString(text);
        return y;
    }

    private static final String DEFAULTS = """
            items:
              A:
                material: STONE
              B:
                material: DIAMOND_SWORD
                lore: ["&7one", "&7two"]
                enchants:
                  sharpness: 5
            """;

    @Test
    void findsOnlyMissingIds() throws Exception {
        ItemCatalog catalog = ItemCatalog.build(List.of(
                new ItemSpec("a", "STONE", null, List.of(), null, false, Map.of(), false, "x.yml")), s -> {});
        assertEquals(List.of("B"), DefaultItemMerger.missingIds(yaml(DEFAULTS), catalog));
    }

    @Test
    void copiedEntriesSurviveSaveAndReload() throws Exception {
        YamlConfiguration target = yaml("items:\n  OLD:\n    material: DIRT\n");
        DefaultItemMerger.copyEntries(yaml(DEFAULTS), target, List.of("B"));

        YamlConfiguration reloaded = yaml(target.saveToString());
        assertEquals("DIRT", reloaded.getString("items.OLD.material"));
        assertEquals("DIAMOND_SWORD", reloaded.getString("items.B.material"));
        assertEquals(List.of("&7one", "&7two"), reloaded.getStringList("items.B.lore"));
        assertEquals(5, reloaded.getInt("items.B.enchants.sharpness"));
        assertFalse(reloaded.contains("items.A"));
    }
}
```

- [ ] **Step 2: Run and confirm they fail**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest="ItemSpecParserTest,ItemCatalogTest,DefaultItemMergerTest"`
Expected: compilation FAIL, `cannot find symbol ... ItemSpec`.

- [ ] **Step 3: Implement the four classes**

`ItemSpec.java`:

```java
package elo.mainplugins.core.customitem;

import java.util.List;
import java.util.Map;

/** Jeden wpis z pliku items/*.yml jako czyste dane (bez Materiału/Enchantu z Bukkita) - patrz ItemSpecParser. */
public record ItemSpec(String id, String material, String name, List<String> lore, String model, boolean glint,
                       Map<String, Integer> enchants, boolean unbreakable, String sourceFile) {
}
```

`ItemSpecParser.java`:

```java
package elo.mainplugins.core.customitem;

import org.bukkit.configuration.ConfigurationSection;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;

/** Czyta sekcję "items" jednego pliku katalogu. Złe wpisy są pomijane z ostrzeżeniem, nigdy wyjątek. */
public final class ItemSpecParser {

    private ItemSpecParser() {}

    public static List<ItemSpec> parseFile(ConfigurationSection root, String fileName, Consumer<String> warn) {
        List<ItemSpec> out = new ArrayList<>();
        ConfigurationSection items = root.getConfigurationSection("items");
        if (items == null) {
            warn.accept(fileName + ": no 'items' section - skipping file.");
            return out;
        }
        for (String id : items.getKeys(false)) {
            ConfigurationSection s = items.getConfigurationSection(id);
            if (s == null) {
                warn.accept(fileName + ": '" + id + "' is not a section - skipping.");
                continue;
            }
            String material = s.getString("material");
            if (material == null || material.isBlank()) {
                warn.accept(fileName + ": '" + id + "' has no material - skipping.");
                continue;
            }
            Map<String, Integer> enchants = new LinkedHashMap<>();
            ConfigurationSection e = s.getConfigurationSection("enchants");
            if (e != null) {
                for (String name : e.getKeys(false)) {
                    int level = e.getInt(name, 0);
                    if (level < 1) {
                        warn.accept(fileName + ": '" + id + "' enchant '" + name + "' needs a level >= 1 - skipping enchant.");
                        continue;
                    }
                    enchants.put(name.toLowerCase(Locale.ROOT), level);
                }
            }
            out.add(new ItemSpec(id, material, s.getString("name"), List.copyOf(s.getStringList("lore")),
                    s.getString("model"), s.getBoolean("glint", false), Collections.unmodifiableMap(enchants),
                    s.getBoolean("unbreakable", false), fileName));
        }
        return out;
    }
}
```

`ItemCatalog.java`:

```java
package elo.mainplugins.core.customitem;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/** Wszystkie wpisy ze wszystkich plików items/*.yml. Id bez rozróżniania wielkości liter; duplikat = wygrywa pierwszy. */
public final class ItemCatalog {

    private final Map<String, ItemSpec> byLowerId;

    private ItemCatalog(Map<String, ItemSpec> byLowerId) {
        this.byLowerId = byLowerId;
    }

    public static ItemCatalog build(List<ItemSpec> specsInLoadOrder, Consumer<String> warn) {
        Map<String, ItemSpec> map = new LinkedHashMap<>();
        for (ItemSpec spec : specsInLoadOrder) {
            String key = spec.id().toLowerCase(Locale.ROOT);
            ItemSpec first = map.get(key);
            if (first != null) {
                warn.accept(spec.sourceFile() + ": duplicate item id '" + spec.id() + "' (already defined in "
                        + first.sourceFile() + ") - keeping the first one.");
                continue;
            }
            map.put(key, spec);
        }
        return new ItemCatalog(Collections.unmodifiableMap(map));
    }

    public ItemSpec get(String id) {
        return id == null ? null : byLowerId.get(id.toLowerCase(Locale.ROOT));
    }

    public boolean contains(String id) {
        return get(id) != null;
    }

    public Set<String> ids() {
        Set<String> out = new LinkedHashSet<>();
        for (ItemSpec spec : byLowerId.values()) out.add(spec.id());
        return out;
    }
}
```

`DefaultItemMerger.java`:

```java
package elo.mainplugins.core.customitem;

import org.bukkit.configuration.ConfigurationSection;

import java.util.ArrayList;
import java.util.List;

/** Domyślne itemy pluginu (z jego jara): które brakują w katalogu i jak je dopisać do pliku serwera. */
public final class DefaultItemMerger {

    private DefaultItemMerger() {}

    public static List<String> missingIds(ConfigurationSection defaultsRoot, ItemCatalog catalog) {
        ConfigurationSection items = defaultsRoot.getConfigurationSection("items");
        if (items == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String id : items.getKeys(false)) {
            if (!catalog.contains(id)) out.add(id);
        }
        return out;
    }

    public static void copyEntries(ConfigurationSection defaultsRoot, ConfigurationSection target, List<String> ids) {
        for (String id : ids) {
            ConfigurationSection src = defaultsRoot.getConfigurationSection("items." + id);
            if (src != null) copySection(src, target.createSection("items." + id));
        }
    }

    private static void copySection(ConfigurationSection from, ConfigurationSection to) {
        for (String key : from.getKeys(false)) {
            if (from.isConfigurationSection(key)) copySection(from.getConfigurationSection(key), to.createSection(key));
            else to.set(key, from.get(key));
        }
    }
}
```

- [ ] **Step 4: Run and confirm they pass**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest="ItemSpecParserTest,ItemCatalogTest,DefaultItemMergerTest"`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/customitem/ItemSpec.java mainplugins-core/src/main/java/elo/mainplugins/core/customitem/ItemSpecParser.java mainplugins-core/src/main/java/elo/mainplugins/core/customitem/ItemCatalog.java mainplugins-core/src/main/java/elo/mainplugins/core/customitem/DefaultItemMerger.java mainplugins-core/src/test/java/elo/mainplugins/core/customitem; git commit -m "Core: czysta logika katalogu itemow (parser, duplikaty, domyslne wpisy pluginow)"
```

---

### Task 5: CustomItemManager on the `items/` folder + providers + idOf + enchants/unbreakable

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/api/CustomItemProvider.java`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/api/CustomItemService.java` (full replacement below)
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/customitem/CustomItemDefinition.java` (full replacement below)
- Rewrite: `mainplugins-core/src/main/java/elo/mainplugins/core/customitem/CustomItemManager.java`
- Create: `mainplugins-core/src/main/resources/items/examples.yml`, `items/quests.yml`, `items/fishing.yml`
- Delete: `mainplugins-core/src/main/resources/custom-items.yml`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java`
- Modify: `mainplugins-core/src/main/resources/plugin.yml`

**Interfaces:**
- Consumes: `ItemSpec`, `ItemSpecParser`, `ItemCatalog`, `DefaultItemMerger` (Task 4); `LangService` (Task 3)
- Produces (`CustomItemService`):
  - kept: `ItemStack create(String id, int amount)`, `boolean exists(String id)`, `Set<String> ids()`, `void reload()`
  - new: `ItemStack create(String id, int amount, Player player)`, `String idOf(ItemStack item)`, `void registerProvider(Plugin owner, CustomItemProvider provider)`, `void registerDefaults(Plugin owner, String resourcePath)`
  - `CustomItemProvider`: `Set<String> ids()`, `ItemStack create(String id, int amount, Player player)` (player may be null)
  - All id lookups are case-insensitive. The PDC tag keeps the id exactly as written in the file.

- [ ] **Step 1: Create `CustomItemProvider`**

```java
package elo.mainplugins.core.api;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.Set;

/**
 * Plugin, którego itemy mają stan (np. ewoluujące narzędzia), rejestruje się tym w
 * {@link CustomItemService#registerProvider}. Wtedy "custom: <id>" działa dla jego itemów
 * wszędzie tak samo jak dla zwykłych wpisów katalogu. Katalog items/ ma pierwszeństwo.
 */
public interface CustomItemProvider {

    Set<String> ids();

    /** player może być null (np. wydanie z konsoli bez gracza). Null = nie umiem stworzyć. */
    ItemStack create(String id, int amount, Player player);
}
```

- [ ] **Step 2: Replace `CustomItemService`**

```java
package elo.mainplugins.core.api;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.util.Set;

/**
 * Wspólny katalog itemów: wszystkie pliki plugins/MainpluginsCore/items/*.yml + itemy
 * dostawców ({@link CustomItemProvider}). Rejestruje go samo core - dostępny zawsze,
 * gdy core jest włączony. Id bez rozróżniania wielkości liter. Każdy stworzony item
 * nosi tag custom-id (CustomItemKeys.CUSTOM_ITEM_ID) - po nim pluginy go rozpoznają ({@link #idOf}).
 */
public interface CustomItemService {

    /** Nowy ItemStack itemu o danym id, albo null, gdy id nieznane. */
    ItemStack create(String id, int amount);

    /** Jak {@link #create(String, int)}, ale z graczem dla dostawców, którzy go potrzebują (może być null). */
    ItemStack create(String id, int amount, Player player);

    /** Czy id istnieje w katalogu lub u któregoś dostawcy. */
    boolean exists(String id);

    /** Wszystkie id (katalog + dostawcy), w pisowni z plików - pod tab-completion i aplikację. */
    Set<String> ids();

    /** Id z tagu custom-id na itemie, albo null, gdy to nie nasz item. */
    String idOf(ItemStack item);

    /** Dostawca itemów pluginu - wyrejestrowywany automatycznie, gdy plugin się wyłącza. */
    void registerProvider(Plugin owner, CustomItemProvider provider);

    /**
     * Dopisuje do items/<plugin>.yml te itemy z pliku resourcePath w jarze pluginu, których
     * jeszcze nie ma w katalogu (np. "items/defaults.yml"). Wołać w onEnable pluginu.
     */
    void registerDefaults(Plugin owner, String resourcePath);

    /** Wczytuje katalog items/ na nowo, bez restartu. */
    void reload();
}
```

- [ ] **Step 3: Replace `CustomItemDefinition`**

```java
package elo.mainplugins.core.customitem;

import net.kyori.adventure.key.Key;
import net.kyori.adventure.text.Component;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;

import java.util.List;
import java.util.Map;

/** Wpis katalogu przetłumaczony na typy Bukkita - patrz CustomItemManager#toDefinition. */
record CustomItemDefinition(String id, Material material, Component name, List<Component> lore, Key model,
                            boolean glint, Map<Enchantment, Integer> enchants, boolean unbreakable) {
}
```

- [ ] **Step 4: Rewrite `CustomItemManager`**

```java
package elo.mainplugins.core.customitem;

import elo.mainplugins.core.api.CustomItemProvider;
import elo.mainplugins.core.api.CustomItemService;
import elo.mainplugins.core.util.CustomItemKeys;
import io.papermc.paper.datacomponent.DataComponentTypes;
import io.papermc.paper.datacomponent.item.ItemEnchantments;
import io.papermc.paper.datacomponent.item.ItemLore;
import io.papermc.paper.registry.RegistryAccess;
import io.papermc.paper.registry.RegistryKey;
import net.kyori.adventure.key.Key;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.Registry;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.server.PluginDisableEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Katalog itemów z folderu items/ (każdy plik *.yml, alfabetycznie) + dostawcy pluginów.
 * Wygląd budujemy API komponentów (setData), tag custom-id przez ItemMeta na końcu -
 * żeby setItemMeta nie nadpisał komponentów starszym stanem.
 */
public class CustomItemManager implements CustomItemService, Listener {

    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();
    private static final String FOLDER = "items";
    private static final List<String> BUNDLED = List.of("examples.yml", "quests.yml", "fishing.yml");

    private final Plugin plugin;
    private final Map<String, CustomItemDefinition> definitions = new HashMap<>();
    private final Map<Plugin, CustomItemProvider> providers = new LinkedHashMap<>();
    private ItemCatalog catalog = ItemCatalog.build(List.of(), w -> {});

    public CustomItemManager(Plugin plugin) {
        this.plugin = plugin;
        reload();
    }

    @Override
    public void reload() {
        File folder = new File(plugin.getDataFolder(), FOLDER);
        if (!folder.exists()) {
            for (String name : BUNDLED) plugin.saveResource(FOLDER + "/" + name, false);
        }
        if (new File(plugin.getDataFolder(), "custom-items.yml").exists()) {
            plugin.getLogger().warning("custom-items.yml is no longer read - move its entries into the items/ folder and delete it.");
        }

        Consumer<String> warn = plugin.getLogger()::warning;
        List<ItemSpec> specs = new ArrayList<>();
        File[] files = folder.listFiles((dir, name) -> name.toLowerCase(Locale.ROOT).endsWith(".yml"));
        if (files != null) {
            Arrays.sort(files, Comparator.comparing(File::getName));
            for (File file : files) {
                specs.addAll(ItemSpecParser.parseFile(YamlConfiguration.loadConfiguration(file), file.getName(), warn));
            }
        }

        ItemCatalog newCatalog = ItemCatalog.build(specs, warn);
        Map<String, CustomItemDefinition> newDefinitions = new HashMap<>();
        for (String id : newCatalog.ids()) {
            CustomItemDefinition def = toDefinition(newCatalog.get(id));
            if (def != null) newDefinitions.put(id.toLowerCase(Locale.ROOT), def);
        }
        catalog = newCatalog;
        definitions.clear();
        definitions.putAll(newDefinitions);
        plugin.getLogger().info("Loaded " + definitions.size() + " custom items from " + FOLDER + "/.");
    }

    private CustomItemDefinition toDefinition(ItemSpec spec) {
        String where = spec.sourceFile() + ": '" + spec.id() + "'";
        Material material = Material.matchMaterial(spec.material());
        if (material == null) {
            plugin.getLogger().warning(where + " has unknown material '" + spec.material() + "' - skipping.");
            return null;
        }
        Component name = spec.name() != null
                ? SERIALIZER.deserialize(spec.name()).decoration(TextDecoration.ITALIC, false) : null;
        List<Component> lore = spec.lore().stream()
                .map(line -> (Component) SERIALIZER.deserialize(line).decoration(TextDecoration.ITALIC, false))
                .toList();

        Key model = null;
        if (spec.model() != null) {
            try {
                model = Key.key(spec.model());
            } catch (IllegalArgumentException e) {
                plugin.getLogger().warning(where + " has invalid model '" + spec.model() + "' - ignoring model.");
            }
        }

        Map<Enchantment, Integer> enchants = new LinkedHashMap<>();
        Registry<Enchantment> registry = RegistryAccess.registryAccess().getRegistry(RegistryKey.ENCHANTMENT);
        for (Map.Entry<String, Integer> e : spec.enchants().entrySet()) {
            Enchantment enchantment = null;
            try {
                enchantment = registry.get(Key.key(e.getKey()));
            } catch (IllegalArgumentException ignored) {
                // zła składnia klucza - potraktuj jak nieznany enchant
            }
            if (enchantment == null) {
                plugin.getLogger().warning(where + " has unknown enchant '" + e.getKey() + "' - skipping enchant.");
                continue;
            }
            enchants.put(enchantment, e.getValue());
        }

        return new CustomItemDefinition(spec.id(), material, name, lore, model, spec.glint(), enchants, spec.unbreakable());
    }

    @Override
    public boolean exists(String id) {
        if (id == null) return false;
        if (definitions.containsKey(id.toLowerCase(Locale.ROOT))) return true;
        for (CustomItemProvider provider : providers.values()) {
            if (findIgnoreCase(provider.ids(), id) != null) return true;
        }
        return false;
    }

    @Override
    public Set<String> ids() {
        Set<String> out = new LinkedHashSet<>();
        for (CustomItemDefinition def : definitions.values()) out.add(def.id());
        for (CustomItemProvider provider : providers.values()) out.addAll(provider.ids());
        return Set.copyOf(out);
    }

    @Override
    public ItemStack create(String id, int amount) {
        return create(id, amount, null);
    }

    @Override
    public ItemStack create(String id, int amount, Player player) {
        if (id == null) return null;
        CustomItemDefinition def = definitions.get(id.toLowerCase(Locale.ROOT));
        if (def != null) return build(def, amount);
        for (CustomItemProvider provider : providers.values()) {
            String own = findIgnoreCase(provider.ids(), id);
            if (own != null) return provider.create(own, amount, player);
        }
        return null;
    }

    private ItemStack build(CustomItemDefinition def, int amount) {
        ItemStack item = new ItemStack(def.material(), amount);
        if (def.name() != null) item.setData(DataComponentTypes.CUSTOM_NAME, def.name());
        if (!def.lore().isEmpty()) item.setData(DataComponentTypes.LORE, ItemLore.lore(def.lore()));
        if (def.model() != null) item.setData(DataComponentTypes.ITEM_MODEL, def.model());
        if (def.glint()) item.setData(DataComponentTypes.ENCHANTMENT_GLINT_OVERRIDE, true);
        if (!def.enchants().isEmpty()) item.setData(DataComponentTypes.ENCHANTMENTS, ItemEnchantments.itemEnchantments(def.enchants()));
        if (def.unbreakable()) item.setData(DataComponentTypes.UNBREAKABLE);

        ItemMeta meta = item.getItemMeta();
        meta.getPersistentDataContainer().set(CustomItemKeys.CUSTOM_ITEM_ID, PersistentDataType.STRING, def.id());
        item.setItemMeta(meta);
        return item;
    }

    @Override
    public String idOf(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return null;
        return item.getItemMeta().getPersistentDataContainer().get(CustomItemKeys.CUSTOM_ITEM_ID, PersistentDataType.STRING);
    }

    @Override
    public void registerProvider(Plugin owner, CustomItemProvider provider) {
        providers.put(owner, provider);
    }

    @EventHandler
    public void onPluginDisable(PluginDisableEvent event) {
        providers.remove(event.getPlugin());
    }

    @Override
    public void registerDefaults(Plugin owner, String resourcePath) {
        InputStream in = owner.getResource(resourcePath);
        if (in == null) {
            plugin.getLogger().warning(owner.getName() + ": default items resource '" + resourcePath + "' not found in its jar.");
            return;
        }
        YamlConfiguration defaults;
        try (Reader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
            defaults = YamlConfiguration.loadConfiguration(reader);
        } catch (IOException e) {
            plugin.getLogger().warning(owner.getName() + ": could not read '" + resourcePath + "': " + e.getMessage());
            return;
        }

        List<String> missing = DefaultItemMerger.missingIds(defaults, catalog);
        if (missing.isEmpty()) return;

        File target = new File(new File(plugin.getDataFolder(), FOLDER), owner.getName().toLowerCase(Locale.ROOT) + ".yml");
        YamlConfiguration out = target.exists() ? YamlConfiguration.loadConfiguration(target) : new YamlConfiguration();
        DefaultItemMerger.copyEntries(defaults, out, missing);
        try {
            out.save(target);
        } catch (IOException e) {
            plugin.getLogger().warning("Could not save " + target.getName() + ": " + e.getMessage());
            return;
        }
        plugin.getLogger().info("Added " + missing.size() + " default item(s) for " + owner.getName()
                + " to " + FOLDER + "/" + target.getName() + ".");
        reload();
    }

    private static String findIgnoreCase(Set<String> ids, String id) {
        for (String candidate : ids) {
            if (candidate.equalsIgnoreCase(id)) return candidate;
        }
        return null;
    }
}
```

- [ ] **Step 5: Split `custom-items.yml` into three resource files**

Create `mainplugins-core/src/main/resources/items/examples.yml` with this header, followed by the `PRZYKLADOWY_AMULET` entry and the commented-out `MOJ_CUSTOM_MIECZ` example copied **unchanged** from the old file (old lines 43–60, under the same `items:` key):

```yaml
# ==========================================================================
# Item catalog - every *.yml file in this folder is read (alphabetically).
# Each entry under "items:" is one item; its id (the key) is how every plugin
# refers to it: "custom: <id>" in rewards, shops, crates, quests...
#
# Give/test: /@dajcustom <id> [player] [amount]
# Reload without restart: /@reloadcustomitems
#
# Fields:
#   material     REQUIRED. Paper material name, e.g. DIAMOND_SWORD.
#   name         optional. Display name, "&" color codes.
#   lore         optional. List of description lines, "&" color codes.
#   model        optional. Resource-pack item model "<namespace>:<path>" (no .json),
#                pointing at assets/<namespace>/items/<path>.json.
#   glint        optional, default false. Enchantment shine without enchants.
#   enchants     optional. Map enchant -> level, e.g. { sharpness: 5, unbreaking: 3 }.
#   unbreakable  optional, default false.
#
# Ids are not case-sensitive. The same id in two files = the first file wins
# (a warning is written to the server log).
# ==========================================================================

items:
```

Create `items/quests.yml`: first line `# Quest rewards and generator items (mainplugins-quests).`, then `items:`. Under it, copy **unchanged** the old entries `TROFEUM_GLOWA_POCZATKUJACEGO`, `TROFEUM_GLOWA_GORNIKA`, `TROFEUM_GLOWA_WOJOWNIKA_NETHERU`, `TROFEUM_GLOWA_SMOKA`, `TROFEUM_GLOWA_RYBAKA_OTCHLANI`, `GENERATOR_KRUCHY_T1`, `GENERATOR_KRUCHY_PRZEWODNIK`, `GENERATOR_BRUK_T1`, including the old comment block above the trophies (old lines 62–69).

Create `items/fishing.yml`: first line `# Fishing items (mainplugins-fishing): recipes, fish species, minigame bar layers.`, then `items:`. Under it, copy **unchanged** the old entries `FISHING_RECIPE_NIEBIANSKA`, `FISHING_RECIPE_KOSMICZNA`, every `FISH_*` entry and every `LOWIENIE_*` entry, including their old comment blocks (old lines 145–158, 203–210, 390–391, 401–408).

Then delete the old file:

```powershell
cd "D:\folder z mc"; git rm -q mainplugins-core/src/main/resources/custom-items.yml
```

Check: the three new files together contain exactly the 47 `items:` entries of the old file. Count with
`(Select-String -Path "D:\folder z mc\mainplugins-core\src\main\resources\items\*.yml" -Pattern '^  [A-Z_0-9]+:$').Count`
Expected: `47`.

- [ ] **Step 6: Wire into `MainpluginsCore`**

Right after the line `getServer().getServicesManager().register(CustomItemService.class, customItemManager, this, ServicePriority.Normal);` add:

```java
        getServer().getPluginManager().registerEvents(customItemManager, this);
```

Replace the body of the `@reloadcustomitems` executor so it uses the lang file:

```java
            getCommand("@reloadcustomitems").setExecutor((sender, command, label, args) -> {
                customItemManager.reload();
                langManager.send(sender, this, "items.reloaded");
                return true;
            });
```

In `plugin.yml`, change the `"@reloadcustomitems"` description to `Reload the item catalog (items/ folder) without a restart`.

- [ ] **Step 7: Build all modules (other plugins call `CustomItemService`)**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" package`
Expected: exit code 0, and `D:\folder z mc\dist\` contains fresh jars. A compile error in another module means that module used a removed method. Nothing was removed, so no error is expected; if one appears, STOP and report it.

- [ ] **Step 8: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/api/CustomItemProvider.java mainplugins-core/src/main/java/elo/mainplugins/core/api/CustomItemService.java mainplugins-core/src/main/java/elo/mainplugins/core/customitem/CustomItemDefinition.java mainplugins-core/src/main/java/elo/mainplugins/core/customitem/CustomItemManager.java mainplugins-core/src/main/resources/items mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java mainplugins-core/src/main/resources/plugin.yml; git commit -m "Core: katalog itemow jako folder items/, enchanty, unbreakable, idOf, dostawcy i domyslne itemy pluginow"
```

---

### Task 6: Reward model + RewardParser (pure)

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/api/Reward.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/api/RewardHandler.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/api/RewardService.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardParser.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/reward/RewardParserTest.java`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `record Reward(String type, Object value, int amount, boolean silent, List<Reward> fallback)`: after parsing, `value` is a `Double` for `money`, an upper-case `String` for `item`, a `String` for `custom`/`command`, and the raw YAML value for plugin types.
  - `RewardHandler`: `boolean give(Player player, Reward reward)`
  - `RewardService`: constants `MONEY="money"`, `ITEM="item"`, `CUSTOM="custom"`, `COMMAND="command"`; `List<Reward> parse(List<?> entries, String source)`; `void give(Player player, List<Reward> rewards)`; `void registerType(Plugin owner, String type, RewardHandler handler)`
  - `new RewardParser(Predicate<String> materialExists, Consumer<String> warn)`, `List<Reward> parse(List<?> entries, String source)`, `static final Set<String> RESERVED = Set.of("amount","silent","fallback")`

- [ ] **Step 1: Create the three API types**

`Reward.java`:

```java
package elo.mainplugins.core.api;

import java.util.List;

/**
 * Jedna nagroda ze wspólnego formatu "rewards:" (patrz {@link RewardService}).
 * type = "money" / "item" / "custom" / "command" albo typ zarejestrowany przez plugin
 * (np. "key", "title"). fallback = co dać zamiast, gdy tej nagrody nie da się wydać.
 */
public record Reward(String type, Object value, int amount, boolean silent, List<Reward> fallback) {

    public Reward {
        fallback = List.copyOf(fallback);
    }
}
```

`RewardHandler.java`:

```java
package elo.mainplugins.core.api;

import org.bukkit.entity.Player;

/**
 * Wydawanie typu nagrody, którego core nie zna (np. "key" - skrzynki, "title" - questy).
 * Handler sam wysyła graczowi wiadomość (chyba że reward.silent()).
 */
@FunctionalInterface
public interface RewardHandler {

    /** false = nie da się teraz wydać -> core użyje fallback tej nagrody. */
    boolean give(Player player, Reward reward);
}
```

`RewardService.java`:

```java
package elo.mainplugins.core.api;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.util.List;

/**
 * Jeden format nagród dla wszystkich pluginów (config: lista "rewards:").
 * Wbudowane typy: money, item (+amount), custom (+amount), command ({player} = nick).
 * Każdy wpis może mieć silent: true i fallback: [lista nagród].
 * Inne typy wydają pluginy przez {@link #registerType}. Brak handlera/itemu = fallback,
 * a bez fallbacku pominięcie z ostrzeżeniem w logu - nigdy wyjątek.
 */
public interface RewardService {

    String MONEY = "money";
    String ITEM = "item";
    String CUSTOM = "custom";
    String COMMAND = "command";

    /** entries = np. config.getList("rewards"); source = opis miejsca do logów, np. "crates.yml epic.rewards". */
    List<Reward> parse(List<?> entries, String source);

    void give(Player player, List<Reward> rewards);

    /** Rejestruje własny typ nagrody pluginu - wyrejestrowywany automatycznie, gdy plugin się wyłącza. */
    void registerType(Plugin owner, String type, RewardHandler handler);
}
```

- [ ] **Step 2: Write the failing test**

```java
package elo.mainplugins.core.reward;

import elo.mainplugins.core.api.Reward;
import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class RewardParserTest {

    private final List<String> warnings = new ArrayList<>();
    private final RewardParser parser = new RewardParser(
            m -> Set.of("DIAMOND", "STONE").contains(m.toUpperCase(Locale.ROOT)), warnings::add);

    private List<Reward> parse(String yaml) throws Exception {
        YamlConfiguration y = new YamlConfiguration();
        y.loadFromString(yaml);
        return parser.parse(y.getList("rewards"), "test.yml rewards");
    }

    @Test
    void parsesBuiltInTypes() throws Exception {
        List<Reward> r = parse("""
                rewards:
                  - money: 500
                  - item: diamond
                    amount: 3
                  - custom: magic_sword
                  - command: "give {player} cake"
                    silent: true
                """);
        assertEquals(List.of(
                new Reward("money", 500.0, 1, false, List.of()),
                new Reward("item", "DIAMOND", 3, false, List.of()),
                new Reward("custom", "magic_sword", 1, false, List.of()),
                new Reward("command", "give {player} cake", 1, true, List.of())), r);
        assertTrue(warnings.isEmpty());
    }

    @Test
    void keepsPluginTypesAndParsesFallback() throws Exception {
        Reward r = parse("""
                rewards:
                  - key: epic
                    fallback:
                      - money: 1000
                """).get(0);
        assertEquals("key", r.type());
        assertEquals("epic", r.value());
        assertEquals(List.of(new Reward("money", 1000.0, 1, false, List.of())), r.fallback());
    }

    @Test
    void skipsEntryWithTwoTypes() throws Exception {
        assertEquals(List.of(), parse("rewards:\n  - money: 5\n    item: STONE\n"));
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("test.yml rewards [1]"));
    }

    @Test
    void skipsUnknownMaterial() throws Exception {
        assertEquals(List.of(), parse("rewards:\n  - item: NOT_A_BLOCK\n"));
        assertEquals(1, warnings.size());
    }

    @Test
    void skipsMoneyNotAboveZero() throws Exception {
        assertEquals(List.of(), parse("rewards:\n  - money: 0\n"));
        assertEquals(1, warnings.size());
    }

    @Test
    void skipsAmountBelowOne() throws Exception {
        assertEquals(List.of(), parse("rewards:\n  - item: STONE\n    amount: 0\n"));
        assertEquals(1, warnings.size());
    }

    @Test
    void skipsNonMapEntryButKeepsTheRest() throws Exception {
        List<Reward> r = parse("rewards:\n  - just text\n  - money: 5\n");
        assertEquals(List.of(new Reward("money", 5.0, 1, false, List.of())), r);
        assertEquals(1, warnings.size());
    }

    @Test
    void nullListGivesEmpty() {
        assertEquals(List.of(), parser.parse(null, "x"));
        assertTrue(warnings.isEmpty());
    }
}
```

- [ ] **Step 3: Run and confirm it fails**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=RewardParserTest`
Expected: compilation FAIL, `cannot find symbol ... RewardParser`.

- [ ] **Step 4: Implement `RewardParser`**

```java
package elo.mainplugins.core.reward;

import elo.mainplugins.core.api.Reward;
import elo.mainplugins.core.api.RewardService;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Predicate;

/**
 * Czyta listę "rewards:" z configu. Każdy wpis = mapa z dokładnie jednym kluczem typu
 * (+ opcjonalne amount / silent / fallback). Złe wpisy pomijane z ostrzeżeniem.
 * Istnienie custom itemów i handlerów pluginów sprawdzane dopiero przy wydawaniu
 * (mogą się zarejestrować później niż ten config jest czytany).
 */
public final class RewardParser {

    public static final Set<String> RESERVED = Set.of("amount", "silent", "fallback");

    private final Predicate<String> materialExists;
    private final Consumer<String> warn;

    public RewardParser(Predicate<String> materialExists, Consumer<String> warn) {
        this.materialExists = materialExists;
        this.warn = warn;
    }

    public List<Reward> parse(List<?> entries, String source) {
        List<Reward> out = new ArrayList<>();
        if (entries == null) return out;
        for (int i = 0; i < entries.size(); i++) {
            String where = source + " [" + (i + 1) + "]";
            if (!(entries.get(i) instanceof Map<?, ?> map)) {
                warn.accept(where + ": a reward must look like '- money: 100' - skipping.");
                continue;
            }
            Reward reward = parseOne(map, where);
            if (reward != null) out.add(reward);
        }
        return out;
    }

    private Reward parseOne(Map<?, ?> map, String where) {
        List<String> typeKeys = new ArrayList<>();
        for (Object key : map.keySet()) {
            String k = String.valueOf(key);
            if (!RESERVED.contains(k)) typeKeys.add(k);
        }
        if (typeKeys.size() != 1) {
            warn.accept(where + ": expected exactly one reward type, found " + typeKeys + " - skipping.");
            return null;
        }
        String type = typeKeys.get(0).toLowerCase(Locale.ROOT);
        Object value = map.get(typeKeys.get(0));

        int amount = 1;
        Object rawAmount = map.get("amount");
        if (rawAmount != null) {
            if (!(rawAmount instanceof Number n) || n.intValue() < 1) {
                warn.accept(where + ": 'amount' must be a whole number >= 1 - skipping.");
                return null;
            }
            amount = n.intValue();
        }
        boolean silent = Boolean.TRUE.equals(map.get("silent"));
        List<Reward> fallback = map.get("fallback") instanceof List<?> list ? parse(list, where + " fallback") : List.of();

        switch (type) {
            case RewardService.MONEY -> {
                if (!(value instanceof Number n) || n.doubleValue() <= 0) {
                    warn.accept(where + ": 'money' must be a number > 0 - skipping.");
                    return null;
                }
                value = n.doubleValue();
            }
            case RewardService.ITEM -> {
                String material = value == null ? "" : String.valueOf(value);
                if (!materialExists.test(material)) {
                    warn.accept(where + ": unknown item '" + material + "' - skipping.");
                    return null;
                }
                value = material.toUpperCase(Locale.ROOT);
            }
            case RewardService.CUSTOM, RewardService.COMMAND -> {
                if (value == null || String.valueOf(value).isBlank()) {
                    warn.accept(where + ": '" + type + "' needs a value - skipping.");
                    return null;
                }
                value = String.valueOf(value);
            }
            default -> {
                if (value == null) {
                    warn.accept(where + ": '" + type + "' needs a value - skipping.");
                    return null;
                }
            }
        }
        return new Reward(type, value, amount, silent, fallback);
    }
}
```

- [ ] **Step 5: Run and confirm it passes**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=RewardParserTest`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/api/Reward.java mainplugins-core/src/main/java/elo/mainplugins/core/api/RewardHandler.java mainplugins-core/src/main/java/elo/mainplugins/core/api/RewardService.java mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardParser.java mainplugins-core/src/test/java/elo/mainplugins/core/reward/RewardParserTest.java; git commit -m "Core: wspolny format nagrod - model i parser"
```

---

### Task 7: RewardGiver (pure give + fallback + messages)

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardSink.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardGiver.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/reward/RewardGiverTest.java`

**Interfaces:**
- Consumes: `Reward`, `RewardService` constants (Task 6)
- Produces:
  - `RewardSink`: `String playerName()`, `void giveMoney(double amount)`, `boolean giveItem(String material, int amount)`, `boolean giveCustom(String id, int amount)`, `void runCommand(String command)`, `boolean giveExternal(Reward reward)`, `void message(String key, Map<String,String> placeholders)`
  - `new RewardGiver(Consumer<String> warn)`, `void give(List<Reward> rewards, RewardSink sink)`, `static String formatMoney(double amount)` (US grouping, up to 2 decimals: `1234.5 → "1,234.5"`)
  - Messages: `reward.money {amount}`, `reward.item {amount, item}`, `reward.custom {amount, item}`. Nothing for `command` or plugin types (their handlers send their own).

- [ ] **Step 1: Write the failing test**

```java
package elo.mainplugins.core.reward;

import elo.mainplugins.core.api.Reward;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import static org.junit.jupiter.api.Assertions.*;

class RewardGiverTest {

    private final List<String> warnings = new ArrayList<>();
    private final RewardGiver giver = new RewardGiver(warnings::add);
    private final FakeSink sink = new FakeSink();

    private static Reward r(String type, Object value) {
        return new Reward(type, value, 1, false, List.of());
    }

    @Test
    void moneyIsGivenAndAnnounced() {
        giver.give(List.of(r("money", 1500.0)), sink);
        assertEquals(List.of("money 1500.0", "msg reward.money {amount=1,500}"), sink.log);
    }

    @Test
    void itemAnnouncesReadableName() {
        giver.give(List.of(new Reward("item", "GOLDEN_APPLE", 3, false, List.of())), sink);
        assertEquals(List.of("item GOLDEN_APPLE x3", "msg reward.item {amount=3, item=golden apple}"), sink.log);
    }

    @Test
    void silentRewardHasNoMessage() {
        giver.give(List.of(new Reward("money", 5.0, 1, true, List.of())), sink);
        assertEquals(List.of("money 5.0"), sink.log);
    }

    @Test
    void commandReplacesPlayerAndHasNoMessage() {
        giver.give(List.of(r("command", "give {player} cake")), sink);
        assertEquals(List.of("cmd give Steve cake"), sink.log);
    }

    @Test
    void unknownCustomItemUsesFallback() {
        giver.give(List.of(new Reward("custom", "nope", 1, false, List.of(r("money", 1000.0)))), sink);
        assertEquals(List.of("money 1000.0", "msg reward.money {amount=1,000}"), sink.log);
        assertTrue(warnings.isEmpty());
    }

    @Test
    void missingPluginTypeWithoutFallbackIsSkippedWithWarning() {
        giver.give(List.of(r("key", "epic"), r("money", 5.0)), sink);
        assertEquals(List.of("money 5.0", "msg reward.money {amount=5}"), sink.log);
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("key") && warnings.get(0).contains("Steve"));
    }

    @Test
    void pluginTypeGoesToHandlerWithoutCoreMessage() {
        sink.externalTypes = Set.of("key");
        giver.give(List.of(r("key", "epic")), sink);
        assertEquals(List.of("ext key epic"), sink.log);
    }

    @Test
    void formatsMoney() {
        assertEquals("1,234.5", RewardGiver.formatMoney(1234.5));
        assertEquals("500", RewardGiver.formatMoney(500));
        assertEquals("0.25", RewardGiver.formatMoney(0.25));
    }

    private static final class FakeSink implements RewardSink {
        final List<String> log = new ArrayList<>();
        Set<String> externalTypes = Set.of();

        public String playerName() { return "Steve"; }
        public void giveMoney(double amount) { log.add("money " + amount); }
        public boolean giveItem(String material, int amount) { log.add("item " + material + " x" + amount); return true; }
        public boolean giveCustom(String id, int amount) {
            if (!id.equals("magic_sword")) return false;
            log.add("custom " + id + " x" + amount);
            return true;
        }
        public void runCommand(String command) { log.add("cmd " + command); }
        public boolean giveExternal(Reward reward) {
            if (!externalTypes.contains(reward.type())) return false;
            log.add("ext " + reward.type() + " " + reward.value());
            return true;
        }
        public void message(String key, Map<String, String> placeholders) {
            log.add("msg " + key + " " + new TreeMap<>(placeholders));
        }
    }
}
```

- [ ] **Step 2: Run and confirm it fails**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=RewardGiverTest`
Expected: compilation FAIL, `cannot find symbol ... RewardSink`.

- [ ] **Step 3: Implement**

`RewardSink.java`:

```java
package elo.mainplugins.core.reward;

import elo.mainplugins.core.api.Reward;

import java.util.Map;

/** To, czego RewardGiver potrzebuje od świata (gracz, ekonomia, itemy). W testach - atrapa. */
public interface RewardSink {

    String playerName();

    void giveMoney(double amount);

    /** false = materiał nie jest itemem. */
    boolean giveItem(String material, int amount);

    /** false = nieznane id. */
    boolean giveCustom(String id, int amount);

    void runCommand(String command);

    /** false = brak handlera typu albo handler odmówił. */
    boolean giveExternal(Reward reward);

    void message(String key, Map<String, String> placeholders);
}
```

`RewardGiver.java`:

```java
package elo.mainplugins.core.reward;

import elo.mainplugins.core.api.Reward;
import elo.mainplugins.core.api.RewardService;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;

/** Wydaje listę nagród: udane = wiadomość (chyba że silent), nieudane = fallback albo ostrzeżenie. */
public final class RewardGiver {

    private final Consumer<String> warn;

    public RewardGiver(Consumer<String> warn) {
        this.warn = warn;
    }

    public void give(List<Reward> rewards, RewardSink sink) {
        for (Reward reward : rewards) giveOne(reward, sink);
    }

    private void giveOne(Reward reward, RewardSink sink) {
        boolean given = switch (reward.type()) {
            case RewardService.MONEY -> {
                sink.giveMoney(((Number) reward.value()).doubleValue());
                yield true;
            }
            case RewardService.ITEM -> sink.giveItem((String) reward.value(), reward.amount());
            case RewardService.CUSTOM -> sink.giveCustom((String) reward.value(), reward.amount());
            case RewardService.COMMAND -> {
                sink.runCommand(((String) reward.value()).replace("{player}", sink.playerName()));
                yield true;
            }
            default -> sink.giveExternal(reward);
        };

        if (given) {
            if (!reward.silent()) announce(reward, sink);
            return;
        }
        if (!reward.fallback().isEmpty()) {
            give(reward.fallback(), sink);
            return;
        }
        warn.accept("Reward '" + reward.type() + ": " + reward.value() + "' could not be given to "
                + sink.playerName() + " and has no fallback - skipped.");
    }

    private void announce(Reward reward, RewardSink sink) {
        switch (reward.type()) {
            case RewardService.MONEY -> sink.message("reward.money",
                    Map.of("amount", formatMoney(((Number) reward.value()).doubleValue())));
            case RewardService.ITEM, RewardService.CUSTOM -> sink.message("reward." + reward.type(),
                    Map.of("amount", String.valueOf(reward.amount()), "item", readable((String) reward.value())));
            default -> { } // command: bez wiadomości; typy pluginów: wiadomość wysyła ich handler
        }
    }

    private static String readable(String id) {
        return id.toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    public static String formatMoney(double amount) {
        return new DecimalFormat("#,##0.##", DecimalFormatSymbols.getInstance(Locale.US)).format(amount);
    }
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=RewardGiverTest`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardSink.java mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardGiver.java mainplugins-core/src/test/java/elo/mainplugins/core/reward/RewardGiverTest.java; git commit -m "Core: wydawanie nagrod z fallbackiem i komunikatami"
```

---

### Task 8: RewardService on the server (RewardManager, BukkitRewardSink, wiring, /@rewardtest)

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/reward/BukkitRewardSink.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardManager.java`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/CoreAPI.java`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java`
- Modify: `mainplugins-core/src/main/resources/plugin.yml`

**Interfaces:**
- Consumes: `RewardParser`, `RewardGiver`, `RewardSink` (Tasks 6–7); `EconomyService.dodajGrosze(UUID,long)`; `CustomItemService.create(String,int,Player)` (Task 5); `LangService.send(...)` (Task 3)
- Produces: `RewardManager implements RewardService, Listener`, `CoreAPI.getRewardService()` (throws when missing), command `/@rewardtest <player>`

- [ ] **Step 1: Create `BukkitRewardSink`**

```java
package elo.mainplugins.core.reward;

import elo.mainplugins.core.api.CustomItemService;
import elo.mainplugins.core.api.EconomyService;
import elo.mainplugins.core.api.LangService;
import elo.mainplugins.core.api.Reward;
import elo.mainplugins.core.api.RewardHandler;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.util.Map;
import java.util.function.Function;
import java.util.logging.Level;

/** RewardSink dla prawdziwego gracza. Pełny ekwipunek = reszta wypada pod nogi. */
final class BukkitRewardSink implements RewardSink {

    private final Plugin core;
    private final Player player;
    private final EconomyService economy;
    private final CustomItemService items;
    private final LangService lang;
    private final Function<String, RewardHandler> handlers;

    BukkitRewardSink(Plugin core, Player player, EconomyService economy, CustomItemService items,
                     LangService lang, Function<String, RewardHandler> handlers) {
        this.core = core;
        this.player = player;
        this.economy = economy;
        this.items = items;
        this.lang = lang;
        this.handlers = handlers;
    }

    @Override
    public String playerName() {
        return player.getName();
    }

    @Override
    public void giveMoney(double amount) {
        economy.dodajGrosze(player.getUniqueId(), Math.round(amount * 100));
    }

    @Override
    public boolean giveItem(String material, int amount) {
        Material m = Material.matchMaterial(material);
        if (m == null || !m.isItem()) return false;
        giveStack(new ItemStack(m, amount));
        return true;
    }

    @Override
    public boolean giveCustom(String id, int amount) {
        ItemStack item = items.create(id, amount, player);
        if (item == null) return false;
        giveStack(item);
        return true;
    }

    @Override
    public void runCommand(String command) {
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command);
    }

    @Override
    public boolean giveExternal(Reward reward) {
        RewardHandler handler = handlers.apply(reward.type());
        if (handler == null) return false;
        try {
            return handler.give(player, reward);
        } catch (RuntimeException e) {
            core.getLogger().log(Level.WARNING, "Reward handler for '" + reward.type() + "' failed.", e);
            return false;
        }
    }

    @Override
    public void message(String key, Map<String, String> placeholders) {
        lang.send(player, core, key, placeholders);
    }

    private void giveStack(ItemStack item) {
        player.getInventory().addItem(item).values()
                .forEach(left -> player.getWorld().dropItemNaturally(player.getLocation(), left));
    }
}
```

- [ ] **Step 2: Create `RewardManager`**

```java
package elo.mainplugins.core.reward;

import elo.mainplugins.core.api.CustomItemService;
import elo.mainplugins.core.api.EconomyService;
import elo.mainplugins.core.api.LangService;
import elo.mainplugins.core.api.Reward;
import elo.mainplugins.core.api.RewardHandler;
import elo.mainplugins.core.api.RewardService;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.server.PluginDisableEvent;
import org.bukkit.plugin.Plugin;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/** Implementacja {@link RewardService} + rejestr typów nagród pluginów. */
public final class RewardManager implements RewardService, Listener {

    private record Registration(Plugin owner, RewardHandler handler) {}

    private static final Set<String> BUILT_IN = Set.of(MONEY, ITEM, CUSTOM, COMMAND);

    private final Plugin core;
    private final EconomyService economy;
    private final CustomItemService items;
    private final LangService lang;
    private final RewardParser parser;
    private final RewardGiver giver;
    private final Map<String, Registration> handlers = new HashMap<>();

    public RewardManager(Plugin core, EconomyService economy, CustomItemService items, LangService lang) {
        this.core = core;
        this.economy = economy;
        this.items = items;
        this.lang = lang;
        Consumer<String> warn = core.getLogger()::warning;
        this.parser = new RewardParser(name -> Material.matchMaterial(name) != null, warn);
        this.giver = new RewardGiver(warn);
    }

    @Override
    public List<Reward> parse(List<?> entries, String source) {
        return parser.parse(entries, source);
    }

    @Override
    public void give(Player player, List<Reward> rewards) {
        giver.give(rewards, new BukkitRewardSink(core, player, economy, items, lang, this::handlerFor));
    }

    @Override
    public void registerType(Plugin owner, String type, RewardHandler handler) {
        String key = type.toLowerCase(Locale.ROOT);
        if (BUILT_IN.contains(key) || RewardParser.RESERVED.contains(key)) {
            throw new IllegalArgumentException("'" + type + "' is a built-in reward word and cannot be registered.");
        }
        Registration old = handlers.put(key, new Registration(owner, handler));
        if (old != null && !old.owner().equals(owner)) {
            core.getLogger().warning("Reward type '" + key + "' of " + old.owner().getName()
                    + " was replaced by " + owner.getName() + ".");
        }
    }

    private RewardHandler handlerFor(String type) {
        Registration registration = handlers.get(type);
        return registration == null ? null : registration.handler();
    }

    @EventHandler
    public void onPluginDisable(PluginDisableEvent event) {
        handlers.values().removeIf(r -> r.owner().equals(event.getPlugin()));
    }
}
```

- [ ] **Step 3: Add `getRewardService()` to `CoreAPI`**

Add the import `import elo.mainplugins.core.api.RewardService;` and, after `getLangService()`:

```java
    /** Wspólne nagrody (patrz {@link RewardService}) - rejestruje go samo core, rzuca jak {@link #getEconomyService()}. */
    public static RewardService getRewardService() {
        RegisteredServiceProvider<RewardService> rsp = Bukkit.getServicesManager().getRegistration(RewardService.class);
        if (rsp == null) {
            throw new IllegalStateException("MainpluginsCore nie jest włączony lub nie zarejestrował jeszcze RewardService - sprawdź plugin.yml (depend: [MainpluginsCore]).");
        }
        return rsp.getProvider();
    }
```

- [ ] **Step 4: Wire it in `MainpluginsCore.onEnable`**

Add the imports `elo.mainplugins.core.api.RewardService`, `elo.mainplugins.core.reward.RewardManager`, `org.bukkit.Bukkit` and `org.bukkit.entity.Player`. Right after the `LicenseService` registration line, add:

```java
        RewardManager rewardManager = new RewardManager(this, economyManager, customItemManager, langManager);
        getServer().getServicesManager().register(RewardService.class, rewardManager, this, ServicePriority.Normal);
        getServer().getPluginManager().registerEvents(rewardManager, this);
```

Before the `@reloadlang` block, add:

```java
        if (getCommand("@rewardtest") != null) {
            getCommand("@rewardtest").setExecutor((sender, command, label, args) -> {
                if (args.length < 1) {
                    langManager.send(sender, this, "admin.rewardtest.usage");
                    return true;
                }
                Player target = Bukkit.getPlayerExact(args[0]);
                if (target == null) {
                    langManager.send(sender, this, "admin.player-not-found", java.util.Map.of("player", args[0]));
                    return true;
                }
                reloadConfig();
                rewardManager.give(target, rewardManager.parse(getConfig().getList("test-rewards"), "config.yml test-rewards"));
                langManager.send(sender, this, "admin.rewardtest.done", java.util.Map.of("player", target.getName()));
                return true;
            });
        }
```

- [ ] **Step 5: Register the command in `plugin.yml`**

Under `commands:`:

```yaml
  "@rewardtest":
    description: (Admin) Give the test-rewards list from config.yml to a player
    permission: mainplugins.core.rewardtest
    permission-message: "&cNie masz permisji do tej komendy!"
    usage: /<command> <player>
```

Under `permissions:`:

```yaml
  mainplugins.core.rewardtest:
    description: Access to /@rewardtest
    default: op
```

- [ ] **Step 6: Full build + all tests**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" package`
Expected: exit code 0. All 32 core tests pass (1 + 5 + 10 + 8 + 8), and every module's jar is in `D:\folder z mc\dist\`.

- [ ] **Step 7: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/reward/BukkitRewardSink.java mainplugins-core/src/main/java/elo/mainplugins/core/reward/RewardManager.java mainplugins-core/src/main/java/elo/mainplugins/core/CoreAPI.java mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java mainplugins-core/src/main/resources/plugin.yml; git commit -m "Core: RewardService na serwerze + /@rewardtest"
```

---

### Task 9: Manual check on the local test server

Needs the local Paper server (spec §3). Run it together with the user, and only after they agree to set the server up.

- [ ] **Step 1:** Copy `D:\folder z mc\dist\mainplugins-core-1.0-SNAPSHOT.jar` (plus any other plugin jars you want) to the test server's `plugins/` folder and start the server.
- [ ] **Step 2:** Confirm the log shows `Loaded 47 custom items from items/.` and no warnings from core. Confirm the server has `plugins/MainpluginsCore/config.yml`, `lang/en.yml`, `lang/pl.yml` and `items/` (3 files).
- [ ] **Step 3:** In game, run `/@rewardtest <your nick>`. Expected: +100$ and 2 diamonds, with 2 English chat messages.
- [ ] **Step 4:** Set `language: pl`, then run `/@reloadlang` and `/@rewardtest <nick>`. Expected: the messages are in Polish.
- [ ] **Step 5:** In `config.yml`, change `test-rewards` to:
  ```yaml
  test-rewards:
    - custom: TROFEUM_GLOWA_SMOKA
    - key: epic
      fallback:
        - money: 1000
    - item: NOT_A_BLOCK
  ```
  Then run `/@rewardtest <nick>`. Expected: you get the trophy head and +1000$ (fallback, because nothing registered `key`). The log shows one warning about `NOT_A_BLOCK`. The server does not crash.
- [ ] **Step 6:** Add an entry with `enchants: {sharpness: 5}` and `unbreakable: true` to `items/examples.yml`, run `/@reloadcustomitems`, then `/@dajcustom <id>`. Expected: the item has Sharpness V and is unbreakable.
- [ ] **Step 7:** Fill your inventory and run `/@rewardtest <nick>` again. Expected: the items drop at your feet.

---

## What comes after this plan

- **Plan 2 – compatibility (spec C + English commands from E):** Vault provider + `economy: own | vault`, PlaceholderAPI expansion + placeholders in lang texts, permission node per command, disabling/renaming/aliasing commands in config, English default command names.
- **Plan 3 – app:** shared reward editor, item editor + item picker (new `items/` folder), app language switch PL/EN, lang text editor, knowledge of installed plugins (spec D).
- **Pilot plugin plan (Crates):** first plugin moved fully onto `LangService` / item catalog / `RewardService`, including the `key` reward type.
