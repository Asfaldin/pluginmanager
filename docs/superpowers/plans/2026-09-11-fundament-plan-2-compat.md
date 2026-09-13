# Foundation Plan 2 - Compatibility: PlaceholderAPI, Vault, commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Core gets three compatibility pieces:
- it exposes `%mainplugins_...%` placeholders to PlaceholderAPI (other plugins add theirs through core), and our lang texts accept placeholders;
- it works with Vault in both directions (our money visible to other plugins, or our plugins using someone else's money);
- every Mainplugins command can be renamed, aliased or disabled in `commands.yml` and always has a permission node. Player commands default to English names, and the Polish names stay as aliases.

**Architecture:** As in Plan 1, the pure logic (placeholder registry, Vault-backed balance maths, `commands.yml` parsing, permission node naming) is unit-tested without a server. Anything that touches PlaceholderAPI or Vault classes lives in a separate `*Hook` class that runs only when that plugin is enabled, so core still works without them. Command renaming runs once, on `ServerLoadEvent` (after every plugin is enabled), by re-registering our `PluginCommand` objects in the Bukkit `CommandMap`.

**Tech Stack:** Java 25, Paper API 26.2 (`26.2.build.112-stable`), PlaceholderAPI 2.11.6 (provided), VaultAPI 1.7.1 via JitPack (provided), JUnit 5.

**Spec:** `C:\Users\Zgredek\pluginmanager\docs\superpowers\specs\2026-09-11-fundament-design.md` (part C, and the "English commands" point of part E), plus the "Etap 2 – ustalenia" section at its end.

## Global Constraints

- Code repo: `D:\folder z mc`, branch `Karol`. Commit after every task. Stage **only** the files listed in the task. Never stage `docs/configi-zewnetrzne/*` or `docs/Zrzut ekranu 2026-08-31 164214.png`. **No push.**
- Build from PowerShell. `$mvn = "D:\intelia\IntelliJ IDEA 2026.2.0.1\plugins\maven-plugin\lib\maven3\bin\mvn.cmd"`. Core tests: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test`. Always build jars with `clean package` (stale resources otherwise stay in the jar).
- `mainplugins-spawn` does not compile before this plan either: `ObszarService` was never committed by its author. Ignore that module's failure and do not fix it.
- Player/admin texts go through `LangService` with keys in core `lang/en.yml` **and** `lang/pl.yml`. Server log lines are English. Code comments are short and Polish.
- PlaceholderAPI, Vault and EssentialsX are **optional**: core must start and work normally without them (`softdepend`). Never reference their classes outside the `*Hook` / adapter classes named below.
- Existing placeholder names used by the HUD/TAB setup (`kasa`, `saldo`, `ranga`, `top_gracz_linia_N`, …) must keep working unchanged.
- Maven resource filtering is ON, so never write `${` in any `.yml` resource.
- Third-party command names win a clash: if another plugin already owns a label, ours stays reachable as `/<plugin>:<name>` and a warning tells the admin to rename it in `commands.yml`.

---

## File Structure

Paths relative to `D:\folder z mc\`.

| File | Status | Responsibility |
|---|---|---|
| `mainplugins-core/pom.xml` | modify | + PlaceholderAPI, VaultAPI (provided), JitPack repo |
| `mainplugins-core/src/main/resources/plugin.yml` | modify | `softdepend: [PlaceholderAPI, Vault]` |
| `mainplugins-core/src/main/java/elo/mainplugins/core/api/PlaceholderService.java` | create | public contract |
| `mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PlaceholderRegistry.java` | create | pure: resolver chain |
| `mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PapiHook.java` | create | only file touching PlaceholderAPI classes |
| `mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PlaceholderManager.java` | create | `PlaceholderService` impl |
| `mainplugins-core/src/main/java/elo/mainplugins/core/lang/LangManager.java` | modify | apply placeholders when sending to a player |
| `mainplugins-hud/src/main/java/elo/mainplugins/hud/MainpluginsPlaceholders.java` | modify | no longer a PAPI expansion, just a resolver |
| `mainplugins-hud/src/main/java/elo/mainplugins/hud/MainpluginsHUD.java` | modify | registers resolver in core |
| `mainplugins-hud/pom.xml` | modify | drop PlaceholderAPI dependency |
| `mainplugins-core/src/main/java/elo/mainplugins/core/economy/BalanceBackend.java` | create | tiny "someone else's money" contract |
| `mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultBackedEconomy.java` | create | pure: `EconomyService` on a `BalanceBackend` |
| `mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultHook.java` | create | only file touching Vault classes (both directions) |
| `mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultEconomyProvider.java` | create | our economy as a Vault `Economy` |
| `mainplugins-core/src/main/resources/config.yml` | modify | `economy: own` |
| `mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandSetting.java` | create | one parsed `commands.yml` entry |
| `mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandSettingsParser.java` | create | pure: parse + validate |
| `mainplugins-core/src/main/java/elo/mainplugins/core/command/PermissionNodes.java` | create | pure: default node + default level |
| `mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandRemapper.java` | create | Bukkit: apply settings on `ServerLoadEvent` |
| `mainplugins-core/src/main/resources/commands.yml` | create | English defaults |
| `mainplugins-core/src/main/java/elo/mainplugins/core/CoreAPI.java` | modify | `getPlaceholderService()` |
| `mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java` | modify | wiring |
| `mainplugins-core/src/test/java/elo/mainplugins/core/...` | create | unit tests |

---

### Task 1: Placeholder registry (pure) + dependencies

**Files:**
- Modify: `mainplugins-core/pom.xml`
- Modify: `mainplugins-core/src/main/resources/plugin.yml`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PlaceholderRegistry.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/placeholder/PlaceholderRegistryTest.java`

**Interfaces:**
- Produces: `PlaceholderRegistry<O>` (the owner type is generic so tests do not need a real `Plugin`):
  - `void register(O owner, BiFunction<OfflinePlayer, String, String> resolver)`
  - `void unregister(O owner)`
  - `String resolve(OfflinePlayer player, String params)`: asks resolvers in registration order and returns the first non-null value; a resolver that throws is skipped with one warning; returns `null` when nobody knows the name.
  - Constructor: `new PlaceholderRegistry<>(Consumer<String> warn)`

- [ ] **Step 1: Add dependencies and the JitPack repo to `mainplugins-core/pom.xml`**

Inside `<dependencies>`, next to junit, add:

```xml
        <!-- Opcjonalne pluginy zewnętrzne - tylko do kompilacji, NIE pakowane do jara -->
        <dependency>
            <groupId>me.clip</groupId>
            <artifactId>placeholderapi</artifactId>
            <version>2.11.6</version>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>com.github.MilkBowl</groupId>
            <artifactId>VaultAPI</artifactId>
            <version>1.7.1</version>
            <scope>provided</scope>
            <exclusions>
                <exclusion>
                    <groupId>*</groupId>
                    <artifactId>*</artifactId>
                </exclusion>
            </exclusions>
        </dependency>
```

Before `<dependencies>`, add:

```xml
    <repositories>
        <!-- VaultAPI jest publikowane tylko przez JitPack -->
        <repository>
            <id>jitpack.io</id>
            <url>https://jitpack.io</url>
        </repository>
    </repositories>
```

- [ ] **Step 2: Add softdepend to core `plugin.yml`**

Below the line `api-version: '1.20'` add:

```yaml
softdepend: [PlaceholderAPI, Vault]
```

- [ ] **Step 3: Write the failing test**

```java
package elo.mainplugins.core.placeholder;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PlaceholderRegistryTest {

    private final List<String> warnings = new ArrayList<>();
    private final PlaceholderRegistry<String> registry = new PlaceholderRegistry<>(warnings::add);

    @Test
    void firstResolverThatKnowsTheNameWins() {
        registry.register("core", (p, name) -> name.equals("money") ? "100" : null);
        registry.register("hud", (p, name) -> name.equals("money") ? "HUD" : name.equals("kasa") ? "1k" : null);
        assertEquals("100", registry.resolve(null, "money"));
        assertEquals("1k", registry.resolve(null, "kasa"));
    }

    @Test
    void unknownNameGivesNull() {
        registry.register("core", (p, name) -> null);
        assertNull(registry.resolve(null, "nope"));
    }

    @Test
    void unregisterRemovesOnlyThatOwner() {
        registry.register("core", (p, name) -> name.equals("a") ? "core" : null);
        registry.register("hud", (p, name) -> name.equals("b") ? "hud" : null);
        registry.unregister("hud");
        assertEquals("core", registry.resolve(null, "a"));
        assertNull(registry.resolve(null, "b"));
    }

    @Test
    void throwingResolverIsSkippedWithOneWarning() {
        registry.register("bad", (p, name) -> { throw new IllegalStateException("boom"); });
        registry.register("core", (p, name) -> "ok");
        assertEquals("ok", registry.resolve(null, "x"));
        assertEquals("ok", registry.resolve(null, "x"));
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("bad"));
    }
}
```

- [ ] **Step 4: Run and confirm it fails**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=PlaceholderRegistryTest`
Expected: compilation FAIL, `cannot find symbol ... PlaceholderRegistry`. If the failure is instead `Could not resolve dependencies ... VaultAPI`, JitPack is unreachable: STOP and report.

- [ ] **Step 5: Implement**

```java
package elo.mainplugins.core.placeholder;

import org.bukkit.OfflinePlayer;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiFunction;
import java.util.function.Consumer;

/**
 * Czysta logika placeholderów %mainplugins_<nazwa>%: lista "tłumaczy" od pluginów,
 * pytanych po kolei - pierwszy, który zna nazwę, wygrywa. Tłumacz rzucający wyjątek
 * jest pomijany (jedno ostrzeżenie na właściciela), żeby jeden błąd nie psuł całego TAB-a.
 */
public final class PlaceholderRegistry<O> {

    private record Entry<O>(O owner, BiFunction<OfflinePlayer, String, String> resolver) {}

    private final List<Entry<O>> entries = new CopyOnWriteArrayList<>();
    private final Set<Object> warned = ConcurrentHashMap.newKeySet();
    private final Consumer<String> warn;

    public PlaceholderRegistry(Consumer<String> warn) {
        this.warn = warn;
    }

    public void register(O owner, BiFunction<OfflinePlayer, String, String> resolver) {
        entries.add(new Entry<>(owner, resolver));
    }

    public void unregister(O owner) {
        List<Entry<O>> doUsuniecia = new ArrayList<>();
        for (Entry<O> e : entries) if (e.owner().equals(owner)) doUsuniecia.add(e);
        entries.removeAll(doUsuniecia);
    }

    public String resolve(OfflinePlayer player, String params) {
        for (Entry<O> e : entries) {
            try {
                String value = e.resolver().apply(player, params);
                if (value != null) return value;
            } catch (RuntimeException ex) {
                if (warned.add(e.owner())) {
                    warn.accept("Placeholder resolver of " + e.owner() + " failed: " + ex + " - skipping it.");
                }
            }
        }
        return null;
    }
}
```

- [ ] **Step 6: Run and confirm it passes**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=PlaceholderRegistryTest`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/pom.xml mainplugins-core/src/main/resources/plugin.yml mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PlaceholderRegistry.java mainplugins-core/src/test/java/elo/mainplugins/core/placeholder/PlaceholderRegistryTest.java; git commit -m "Core: rejestr placeholderow + zaleznosci PlaceholderAPI/Vault (opcjonalne)"
```

---

### Task 2: PlaceholderService in core + placeholders in lang texts + HUD moved onto core

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/api/PlaceholderService.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PapiHook.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PlaceholderManager.java`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/lang/LangManager.java`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/CoreAPI.java`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java`
- Modify: `mainplugins-hud/src/main/java/elo/mainplugins/hud/MainpluginsPlaceholders.java`
- Modify: `mainplugins-hud/src/main/java/elo/mainplugins/hud/MainpluginsHUD.java`
- Modify: `mainplugins-hud/pom.xml`

**Interfaces:**
- Consumes: `PlaceholderRegistry` (Task 1), `MoneyFormat.pelna` / `MoneyFormat.kompaktowo`
- Produces:
  - `PlaceholderService`: `void register(Plugin owner, BiFunction<OfflinePlayer,String,String> resolver)`, `String apply(Player player, String text)`
  - `CoreAPI.getPlaceholderService()` throws when missing
  - Core placeholders: `%mainplugins_money%` (full, e.g. `1,500`) and `%mainplugins_money_short%` (compact, e.g. `1.5tys`)
  - `new LangManager(JavaPlugin core, PlaceholderService placeholders)` (constructor changed)

- [ ] **Step 1: Create `PlaceholderService`**

```java
package elo.mainplugins.core.api;

import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.util.function.BiFunction;

/**
 * Placeholdery %mainplugins_<nazwa>% dla PlaceholderAPI (TAB, scoreboardy innych pluginów).
 * Core wystawia jedną ekspansję "mainplugins"; pluginy dokładają swoje nazwy przez
 * {@link #register} - resolver dostaje (gracz lub null, nazwa) i zwraca wartość albo null,
 * gdy nazwy nie zna. Bez PlaceholderAPI na serwerze wszystko działa, tylko nikt nie pyta.
 */
public interface PlaceholderService {

    /** Wyrejestrowywany automatycznie, gdy plugin się wyłącza. */
    void register(Plugin owner, BiFunction<OfflinePlayer, String, String> resolver);

    /** Podmienia w tekście wszystkie %...% (nasze i innych pluginów). Bez PlaceholderAPI zwraca tekst bez zmian. */
    String apply(Player player, String text);
}
```

- [ ] **Step 2: Create `PapiHook` (the only class that touches PlaceholderAPI)**

```java
package elo.mainplugins.core.placeholder;

import me.clip.placeholderapi.PlaceholderAPI;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

/**
 * JEDYNE miejsce z klasami PlaceholderAPI - ładowane tylko, gdy PlaceholderAPI jest
 * włączony (patrz PlaceholderManager), więc bez niego core nie dostaje NoClassDefFoundError.
 */
final class PapiHook {

    private PapiHook() {}

    static void registerExpansion(Plugin core, PlaceholderRegistry<Plugin> registry) {
        new PlaceholderExpansion() {
            @Override
            public String getIdentifier() {
                return "mainplugins";
            }

            @Override
            public String getAuthor() {
                return "Mainplugins";
            }

            @Override
            public String getVersion() {
                return core.getPluginMeta().getVersion();
            }

            @Override
            public boolean persist() {
                return true;
            }

            @Override
            public String onRequest(OfflinePlayer player, String params) {
                return registry.resolve(player, params.toLowerCase(java.util.Locale.ROOT));
            }
        }.register();
    }

    static String setPlaceholders(Player player, String text) {
        return PlaceholderAPI.setPlaceholders(player, text);
    }
}
```

- [ ] **Step 3: Create `PlaceholderManager`**

```java
package elo.mainplugins.core.placeholder;

import elo.mainplugins.core.api.EconomyService;
import elo.mainplugins.core.api.PlaceholderService;
import elo.mainplugins.core.util.MoneyFormat;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.server.PluginDisableEvent;
import org.bukkit.plugin.Plugin;

import java.util.function.BiFunction;
import java.util.function.Supplier;

/** Implementacja {@link PlaceholderService} + wbudowane placeholdery core (money, money_short). */
public final class PlaceholderManager implements PlaceholderService, Listener {

    private final PlaceholderRegistry<Plugin> registry;
    private final boolean papi;

    /** economy przez Supplier - ekonomia (własna lub Vault) powstaje w core później niż ten serwis. */
    public PlaceholderManager(Plugin core, Supplier<EconomyService> economy) {
        this.registry = new PlaceholderRegistry<>(core.getLogger()::warning);
        this.papi = Bukkit.getPluginManager().isPluginEnabled("PlaceholderAPI");

        registry.register(core, (player, name) -> {
            if (player == null) return null;
            return switch (name) {
                case "money" -> MoneyFormat.pelna(economy.get().getKasa(player.getUniqueId()));
                case "money_short" -> MoneyFormat.kompaktowo(economy.get().getKasa(player.getUniqueId()));
                default -> null;
            };
        });

        if (papi) {
            PapiHook.registerExpansion(core, registry);
            core.getLogger().info("PlaceholderAPI found - %mainplugins_...% placeholders are available.");
        }
    }

    @Override
    public void register(Plugin owner, BiFunction<OfflinePlayer, String, String> resolver) {
        registry.register(owner, resolver);
    }

    @Override
    public String apply(Player player, String text) {
        return papi && player != null && text.indexOf('%') >= 0 ? PapiHook.setPlaceholders(player, text) : text;
    }

    @EventHandler
    public void onPluginDisable(PluginDisableEvent event) {
        registry.unregister(event.getPlugin());
    }
}
```

- [ ] **Step 4: Make `LangManager` apply placeholders when sending to a player**

Add the imports `elo.mainplugins.core.api.PlaceholderService` and `org.bukkit.entity.Player`. Add the field `private final PlaceholderService placeholders;` and change the constructor to:

```java
    public LangManager(JavaPlugin core, PlaceholderService placeholders) {
        this.core = core;
        this.placeholders = placeholders;
        this.language = readLanguage();
    }
```

Replace the existing `msg(...)` and `send(...)` methods with:

```java
    private String text(Plugin owner, String key, Map<String, String> placeholdersMap) {
        MessageCatalog catalog = catalogs.get(owner.getName());
        if (catalog == null) {
            core.getLogger().warning(owner.getName() + " asked for message '" + key
                    + "' without calling LangService.registerDefaults first.");
            return key;
        }
        return catalog.resolve(key, placeholdersMap);
    }

    @Override
    public Component msg(Plugin owner, String key, Map<String, String> placeholdersMap) {
        return SERIALIZER.deserialize(text(owner, key, placeholdersMap));
    }

    @Override
    public void send(CommandSender to, Plugin owner, String key, Map<String, String> placeholdersMap) {
        String text = text(owner, key, placeholdersMap);
        if (to instanceof Player player) text = placeholders.apply(player, text);
        to.sendMessage(SERIALIZER.deserialize(text));
    }
```

- [ ] **Step 5: Add `getPlaceholderService()` to `CoreAPI`**

Import `elo.mainplugins.core.api.PlaceholderService` and add:

```java
    /** Placeholdery PlaceholderAPI (patrz {@link PlaceholderService}) - rejestruje go samo core, rzuca jak {@link #getEconomyService()}. */
    public static PlaceholderService getPlaceholderService() {
        RegisteredServiceProvider<PlaceholderService> rsp = Bukkit.getServicesManager().getRegistration(PlaceholderService.class);
        if (rsp == null) {
            throw new IllegalStateException("MainpluginsCore nie jest włączony lub nie zarejestrował jeszcze PlaceholderService - sprawdź plugin.yml (depend: [MainpluginsCore]).");
        }
        return rsp.getProvider();
    }
```

- [ ] **Step 6: Wire in `MainpluginsCore.onEnable`**

Import `elo.mainplugins.core.api.PlaceholderService` and `elo.mainplugins.core.placeholder.PlaceholderManager`. Add a field `private EconomyService economyService;`. Replace the block that starts with `saveDefaultConfig();` and ends with `langManager.registerDefaults(this);` by:

```java
        saveDefaultConfig();
        PlaceholderManager placeholderManager = new PlaceholderManager(this, () -> economyService);
        getServer().getServicesManager().register(PlaceholderService.class, placeholderManager, this, ServicePriority.Normal);
        getServer().getPluginManager().registerEvents(placeholderManager, this);

        langManager = new LangManager(this, placeholderManager);
        getServer().getServicesManager().register(LangService.class, langManager, this, ServicePriority.Normal);
        langManager.registerDefaults(this);
```

Right after `economyManager = new EconomyManager(this);` add `economyService = economyManager;`. Task 4 changes this line.

- [ ] **Step 7: Move HUD placeholders onto core**

In `mainplugins-hud/src/main/java/elo/mainplugins/hud/MainpluginsPlaceholders.java`:
- delete the import `me.clip.placeholderapi.expansion.PlaceholderExpansion`;
- change `public class MainpluginsPlaceholders extends PlaceholderExpansion {` to `public class MainpluginsPlaceholders {`;
- delete the four methods `getIdentifier()`, `getAuthor()`, `getVersion()` and `persist()` (together with their `@Override` lines and comments);
- delete the `@Override` line above `public String onRequest(OfflinePlayer player, String params)`;
- change the first javadoc line `Ekspansja PlaceholderAPI - zastepuje stary...` to `Placeholdery HUD-a (rejestrowane w PlaceholderService core) - zastepuje stary...`.

Replace `MainpluginsHUD.onEnable()` with:

```java
    @Override
    public void onEnable() {
        EconomyService economyService = CoreAPI.getEconomyService();
        HudConfig config = HudConfigLoader.load(this);

        placeholders = new MainpluginsPlaceholders(economyService, config);
        CoreAPI.getPlaceholderService().register(this, placeholders::onRequest);
        if (!Bukkit.getPluginManager().isPluginEnabled("PlaceholderAPI")) {
            getLogger().warning("PlaceholderAPI nie jest wgrany - placeholdery %mainplugins_...% "
                    + "(top gracze/wyspy, Twoja kasa/wyspa) nie beda dzialac. Zainstaluj "
                    + "PlaceholderAPI i plugin TAB, zeby dzialal Tab graczy.");
        }

        if (getCommand("@reloadhud") != null) {
            getCommand("@reloadhud").setExecutor((sender, command, label, args) -> {
                placeholders.aktualizujKonfiguracje(HudConfigLoader.load(this));
                sender.sendMessage("§aHud-config.yml zostało przeładowane.");
                return true;
            });
        }
    }
```

In `mainplugins-hud/pom.xml`, delete the whole `placeholderapi` `<dependency>` block, including its comment.

- [ ] **Step 8: Build core + HUD and run tests**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core,mainplugins-hud clean package`
Expected: exit 0, all core tests pass (34 from Plan 1 + 4 = 38 total).

- [ ] **Step 9: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/api/PlaceholderService.java mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PapiHook.java mainplugins-core/src/main/java/elo/mainplugins/core/placeholder/PlaceholderManager.java mainplugins-core/src/main/java/elo/mainplugins/core/lang/LangManager.java mainplugins-core/src/main/java/elo/mainplugins/core/CoreAPI.java mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java mainplugins-hud/src/main/java/elo/mainplugins/hud/MainpluginsPlaceholders.java mainplugins-hud/src/main/java/elo/mainplugins/hud/MainpluginsHUD.java mainplugins-hud/pom.xml; git commit -m "Core: PlaceholderService (money, money_short) + placeholdery w tekstach; HUD rejestruje swoje przez core"
```

---

### Task 3: VaultBackedEconomy (pure) - our plugins on someone else's money

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/economy/BalanceBackend.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultBackedEconomy.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/economy/VaultBackedEconomyTest.java`

**Interfaces:**
- Produces:
  - `BalanceBackend`: `double balance(UUID)`, `boolean withdraw(UUID, double)`, `boolean deposit(UUID, double)`
  - `VaultBackedEconomy implements EconomyService`, built with `new VaultBackedEconomy(BalanceBackend)`. Everything goes through grosze. `getTop` returns an empty list and `getPozycjaWRankingu` returns `-1`: the ranking is unavailable in this mode (spec, "Etap 2 – ustalenia").

- [ ] **Step 1: Write the failing test**

```java
package elo.mainplugins.core.economy;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class VaultBackedEconomyTest {

    private static final UUID A = UUID.randomUUID();

    /** Atrapa cudzej ekonomii: trzyma saldo jako double, jak prawdziwe pluginy. */
    private static final class FakeBackend implements BalanceBackend {
        final Map<UUID, Double> balances = new HashMap<>();
        public double balance(UUID uuid) { return balances.getOrDefault(uuid, 0.0); }
        public boolean withdraw(UUID uuid, double amount) {
            if (balance(uuid) < amount) return false;
            balances.put(uuid, balance(uuid) - amount);
            return true;
        }
        public boolean deposit(UUID uuid, double amount) {
            balances.put(uuid, balance(uuid) + amount);
            return true;
        }
    }

    private final FakeBackend backend = new FakeBackend();
    private final VaultBackedEconomy economy = new VaultBackedEconomy(backend);

    @Test
    void readsBalanceInGrosze() {
        backend.balances.put(A, 12.34);
        assertEquals(1234, economy.getGrosze(A));
        assertEquals(12.34, economy.getKasa(A), 0.0001);
    }

    @Test
    void addAndSubtract() {
        economy.dodajGrosze(A, 500);
        economy.dodajGrosze(A, -200);
        assertEquals(300, economy.getGrosze(A));
    }

    @Test
    void subtractingMoreThanBalanceStopsAtZero() {
        backend.balances.put(A, 1.0);
        economy.dodajGrosze(A, -500);
        assertEquals(0, economy.getGrosze(A));
    }

    @Test
    void setGoesUpAndDownAndClampsAtZero() {
        economy.setGrosze(A, 1000);
        assertEquals(1000, economy.getGrosze(A));
        economy.setGrosze(A, 250);
        assertEquals(250, economy.getGrosze(A));
        economy.setGrosze(A, -5);
        assertEquals(0, economy.getGrosze(A));
    }

    @Test
    void takeOnlyWhenAffordable() {
        backend.balances.put(A, 5.0);
        assertFalse(economy.pobierzGrosze(A, 600));
        assertEquals(500, economy.getGrosze(A));
        assertTrue(economy.pobierzGrosze(A, 500));
        assertEquals(0, economy.getGrosze(A));
        assertTrue(economy.maWystarczajaco(A, 0));
    }

    @Test
    void rankingIsNotAvailable() {
        backend.balances.put(A, 100.0);
        assertEquals(List.of(), economy.getTop(10));
        assertEquals(-1, economy.getPozycjaWRankingu(A));
    }
}
```

- [ ] **Step 2: Run and confirm it fails**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=VaultBackedEconomyTest`
Expected: compilation FAIL, `cannot find symbol ... BalanceBackend`.

- [ ] **Step 3: Implement**

`BalanceBackend.java`:

```java
package elo.mainplugins.core.economy;

import java.util.UUID;

/** Minimalny kontrakt "cudzych pieniędzy" (np. Vault) - pozwala testować VaultBackedEconomy bez serwera. */
public interface BalanceBackend {

    double balance(UUID uuid);

    boolean withdraw(UUID uuid, double amount);

    boolean deposit(UUID uuid, double amount);
}
```

`VaultBackedEconomy.java`:

```java
package elo.mainplugins.core.economy;

import elo.mainplugins.core.api.EconomyService;
import elo.mainplugins.core.api.TopGracz;

import java.util.List;
import java.util.UUID;

/**
 * EconomyService na cudzych pieniądzach (tryb "economy: vault"). Wszystko liczone w
 * groszach jak w EconomyManager. Ranking najbogatszych w tym trybie nie istnieje -
 * Vault go nie udostępnia (getTop pusty, pozycja -1), świadoma decyzja ze spec.
 */
public final class VaultBackedEconomy implements EconomyService {

    private final BalanceBackend backend;

    public VaultBackedEconomy(BalanceBackend backend) {
        this.backend = backend;
    }

    @Override
    public long getGrosze(UUID uuid) {
        return Math.round(backend.balance(uuid) * 100);
    }

    @Override
    public void setGrosze(UUID uuid, long grosze) {
        long roznica = Math.max(0, grosze) - getGrosze(uuid);
        if (roznica > 0) backend.deposit(uuid, roznica / 100.0);
        else if (roznica < 0) backend.withdraw(uuid, -roznica / 100.0);
    }

    @Override
    public void dodajGrosze(UUID uuid, long grosze) {
        if (grosze > 0) {
            backend.deposit(uuid, grosze / 100.0);
        } else if (grosze < 0) {
            long doZabrania = Math.min(-grosze, getGrosze(uuid));
            if (doZabrania > 0) backend.withdraw(uuid, doZabrania / 100.0);
        }
    }

    @Override
    public boolean pobierzGrosze(UUID uuid, long grosze) {
        if (grosze <= 0) return true;
        if (getGrosze(uuid) < grosze) return false;
        return backend.withdraw(uuid, grosze / 100.0);
    }

    @Override
    public double getKasa(UUID uuid) {
        return getGrosze(uuid) / 100.0;
    }

    @Override
    public void setKasa(UUID uuid, double ilosc) {
        setGrosze(uuid, Math.round(ilosc * 100));
    }

    @Override
    public void dodajKase(UUID uuid, double ilosc) {
        dodajGrosze(uuid, Math.round(ilosc * 100));
    }

    @Override
    public void odejmijKase(UUID uuid, double ilosc) {
        dodajGrosze(uuid, -Math.round(ilosc * 100));
    }

    @Override
    public boolean maWystarczajaco(UUID uuid, double ilosc) {
        return getGrosze(uuid) >= Math.round(ilosc * 100);
    }

    @Override
    public List<TopGracz> getTop(int limit) {
        return List.of();
    }

    @Override
    public int getPozycjaWRankingu(UUID uuid) {
        return -1;
    }
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test -Dtest=VaultBackedEconomyTest`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/economy/BalanceBackend.java mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultBackedEconomy.java mainplugins-core/src/test/java/elo/mainplugins/core/economy/VaultBackedEconomyTest.java; git commit -m "Core: EconomyService na cudzych pieniadzach (logika w groszach, bez rankingu)"
```

---

### Task 4: Vault hook - both directions + `economy:` setting

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultEconomyProvider.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultHook.java`
- Modify: `mainplugins-core/src/main/resources/config.yml`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java`

**Interfaces:**
- Consumes: `EconomyService`, `VaultBackedEconomy`, `BalanceBackend` (Task 3), `MoneyFormat.pelna`
- Produces:
  - `VaultHook.registerProvider(Plugin core, EconomyService economy)`: our economy as the Vault `Economy`, `ServicePriority.High`
  - `VaultHook.backend(Plugin core) → BalanceBackend`: looks up another plugin's Vault economy lazily on every call; warns once when there is none
  - config `economy: own | vault` (default `own`)

- [ ] **Step 1: Check the real VaultAPI interface before writing the adapter**

Run:
```powershell
$jar = (Get-ChildItem "$env:USERPROFILE\.m2\repository\com\github\MilkBowl\VaultAPI\1.7.1" -Filter "VaultAPI-1.7.1.jar").FullName; & "C:\Program Files\Java\jdk-25\bin\javap.exe" -cp $jar net.milkbowl.vault.economy.Economy
```
Expected: the method list matches the `@Override` methods in Step 2. If a signature differs, follow the jar and fit the adapter code to it.

- [ ] **Step 2: Create `VaultEconomyProvider`**

```java
package elo.mainplugins.core.economy;

import elo.mainplugins.core.api.EconomyService;
import elo.mainplugins.core.util.MoneyFormat;
import net.milkbowl.vault.economy.Economy;
import net.milkbowl.vault.economy.EconomyResponse;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;

import java.util.List;
import java.util.UUID;

/**
 * Nasza ekonomia widziana przez Vault (tryb "economy: own") - inne pluginy (aukcje,
 * prace...) mogą czytać i zmieniać salda naszych graczy. Banki nieobsługiwane.
 * Wersje metod po nazwie gracza (deprecated w Vault) mapujemy przez OfflinePlayer.
 */
final class VaultEconomyProvider implements Economy {

    private final EconomyService economy;

    VaultEconomyProvider(EconomyService economy) {
        this.economy = economy;
    }

    private static UUID id(OfflinePlayer player) {
        return player.getUniqueId();
    }

    @SuppressWarnings("deprecation")
    private static UUID id(String name) {
        return Bukkit.getOfflinePlayer(name).getUniqueId();
    }

    private EconomyResponse withdraw(UUID uuid, double amount) {
        if (amount < 0) return new EconomyResponse(0, economy.getKasa(uuid), EconomyResponse.ResponseType.FAILURE, "Negative amount");
        boolean ok = economy.pobierzGrosze(uuid, Math.round(amount * 100));
        return new EconomyResponse(ok ? amount : 0, economy.getKasa(uuid),
                ok ? EconomyResponse.ResponseType.SUCCESS : EconomyResponse.ResponseType.FAILURE,
                ok ? null : "Insufficient funds");
    }

    private EconomyResponse deposit(UUID uuid, double amount) {
        if (amount < 0) return new EconomyResponse(0, economy.getKasa(uuid), EconomyResponse.ResponseType.FAILURE, "Negative amount");
        economy.dodajGrosze(uuid, Math.round(amount * 100));
        return new EconomyResponse(amount, economy.getKasa(uuid), EconomyResponse.ResponseType.SUCCESS, null);
    }

    private static EconomyResponse noBanks() {
        return new EconomyResponse(0, 0, EconomyResponse.ResponseType.NOT_IMPLEMENTED, "Banks are not supported");
    }

    @Override public boolean isEnabled() { return true; }
    @Override public String getName() { return "Mainplugins"; }
    @Override public boolean hasBankSupport() { return false; }
    @Override public int fractionalDigits() { return 2; }
    @Override public String format(double amount) { return MoneyFormat.pelna(amount) + "$"; }
    @Override public String currencyNamePlural() { return "$"; }
    @Override public String currencyNameSingular() { return "$"; }

    @Override public boolean hasAccount(String playerName) { return true; }
    @Override public boolean hasAccount(OfflinePlayer player) { return true; }
    @Override public boolean hasAccount(String playerName, String worldName) { return true; }
    @Override public boolean hasAccount(OfflinePlayer player, String worldName) { return true; }

    @Override public double getBalance(String playerName) { return economy.getKasa(id(playerName)); }
    @Override public double getBalance(OfflinePlayer player) { return economy.getKasa(id(player)); }
    @Override public double getBalance(String playerName, String world) { return getBalance(playerName); }
    @Override public double getBalance(OfflinePlayer player, String world) { return getBalance(player); }

    @Override public boolean has(String playerName, double amount) { return economy.maWystarczajaco(id(playerName), amount); }
    @Override public boolean has(OfflinePlayer player, double amount) { return economy.maWystarczajaco(id(player), amount); }
    @Override public boolean has(String playerName, String worldName, double amount) { return has(playerName, amount); }
    @Override public boolean has(OfflinePlayer player, String worldName, double amount) { return has(player, amount); }

    @Override public EconomyResponse withdrawPlayer(String playerName, double amount) { return withdraw(id(playerName), amount); }
    @Override public EconomyResponse withdrawPlayer(OfflinePlayer player, double amount) { return withdraw(id(player), amount); }
    @Override public EconomyResponse withdrawPlayer(String playerName, String worldName, double amount) { return withdrawPlayer(playerName, amount); }
    @Override public EconomyResponse withdrawPlayer(OfflinePlayer player, String worldName, double amount) { return withdrawPlayer(player, amount); }

    @Override public EconomyResponse depositPlayer(String playerName, double amount) { return deposit(id(playerName), amount); }
    @Override public EconomyResponse depositPlayer(OfflinePlayer player, double amount) { return deposit(id(player), amount); }
    @Override public EconomyResponse depositPlayer(String playerName, String worldName, double amount) { return depositPlayer(playerName, amount); }
    @Override public EconomyResponse depositPlayer(OfflinePlayer player, String worldName, double amount) { return depositPlayer(player, amount); }

    @Override public EconomyResponse createBank(String name, String player) { return noBanks(); }
    @Override public EconomyResponse createBank(String name, OfflinePlayer player) { return noBanks(); }
    @Override public EconomyResponse deleteBank(String name) { return noBanks(); }
    @Override public EconomyResponse bankBalance(String name) { return noBanks(); }
    @Override public EconomyResponse bankHas(String name, double amount) { return noBanks(); }
    @Override public EconomyResponse bankWithdraw(String name, double amount) { return noBanks(); }
    @Override public EconomyResponse bankDeposit(String name, double amount) { return noBanks(); }
    @Override public EconomyResponse isBankOwner(String name, String playerName) { return noBanks(); }
    @Override public EconomyResponse isBankOwner(String name, OfflinePlayer player) { return noBanks(); }
    @Override public EconomyResponse isBankMember(String name, String playerName) { return noBanks(); }
    @Override public EconomyResponse isBankMember(String name, OfflinePlayer player) { return noBanks(); }
    @Override public List<String> getBanks() { return List.of(); }

    @Override public boolean createPlayerAccount(String playerName) { return true; }
    @Override public boolean createPlayerAccount(OfflinePlayer player) { return true; }
    @Override public boolean createPlayerAccount(String playerName, String worldName) { return true; }
    @Override public boolean createPlayerAccount(OfflinePlayer player, String worldName) { return true; }
}
```

- [ ] **Step 3: Create `VaultHook`**

```java
package elo.mainplugins.core.economy;

import elo.mainplugins.core.api.EconomyService;
import net.milkbowl.vault.economy.Economy;
import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.ServicePriority;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * JEDYNE miejsce (obok VaultEconomyProvider) z klasami Vault - wołane tylko, gdy
 * plugin Vault jest włączony, więc bez niego core nie dostaje NoClassDefFoundError.
 */
public final class VaultHook {

    private VaultHook() {}

    /** Tryb "own": nasza ekonomia jako Vault Economy (priorytet High - wygrywa z np. EssentialsX). */
    public static void registerProvider(Plugin core, EconomyService economy) {
        Bukkit.getServicesManager().register(Economy.class, new VaultEconomyProvider(economy), core, ServicePriority.High);
        core.getLogger().info("Vault found - Mainplugins economy is now available to other plugins.");
    }

    /**
     * Tryb "vault": cudza ekonomia szukana przy KAŻDYM wywołaniu - plugin z pieniędzmi
     * (np. EssentialsX) może się włączyć później niż core. Brak = saldo 0 + jedno ostrzeżenie.
     */
    public static BalanceBackend backend(Plugin core) {
        AtomicBoolean warned = new AtomicBoolean();
        return new BalanceBackend() {
            private Economy economy() {
                RegisteredServiceProvider<Economy> rsp = Bukkit.getServicesManager().getRegistration(Economy.class);
                if (rsp == null && warned.compareAndSet(false, true)) {
                    core.getLogger().warning("economy: vault is set, but no plugin provides a Vault economy (e.g. EssentialsX) - balances read as 0.");
                }
                return rsp == null ? null : rsp.getProvider();
            }

            @Override
            public double balance(UUID uuid) {
                Economy e = economy();
                return e == null ? 0 : e.getBalance(Bukkit.getOfflinePlayer(uuid));
            }

            @Override
            public boolean withdraw(UUID uuid, double amount) {
                Economy e = economy();
                return e != null && e.withdrawPlayer(Bukkit.getOfflinePlayer(uuid), amount).transactionSuccess();
            }

            @Override
            public boolean deposit(UUID uuid, double amount) {
                Economy e = economy();
                return e != null && e.depositPlayer(Bukkit.getOfflinePlayer(uuid), amount).transactionSuccess();
            }
        };
    }
}
```

- [ ] **Step 4: Add the setting to `config.yml`**

Insert after the `language: en` line:

```yaml

# Whose money Mainplugins uses:
#   own   - our own economy (default). If Vault is installed, other plugins can use it too.
#   vault - money of another plugin through Vault (e.g. EssentialsX). Needs Vault + that plugin.
#           The "richest players" ranking is not available in this mode.
economy: own
```

- [ ] **Step 5: Choose the economy in `MainpluginsCore.onEnable`**

Import `elo.mainplugins.core.economy.VaultBackedEconomy` and `elo.mainplugins.core.economy.VaultHook`. Replace these lines:

```java
        economyManager = new EconomyManager(this);
        economyService = economyManager;
        getServer().getServicesManager().register(EconomyService.class, economyManager, this, ServicePriority.Normal);
```

with:

```java
        boolean vault = getServer().getPluginManager().isPluginEnabled("Vault");
        String mode = getConfig().getString("economy", "own");
        if ("vault".equalsIgnoreCase(mode) && vault) {
            economyService = new VaultBackedEconomy(VaultHook.backend(this));
            getLogger().info("Economy mode: vault (money of another plugin).");
        } else {
            if ("vault".equalsIgnoreCase(mode)) {
                getLogger().severe("economy: vault is set, but Vault is not installed - using our own economy instead.");
            }
            economyManager = new EconomyManager(this);
            economyService = economyManager;
            if (vault) VaultHook.registerProvider(this, economyManager);
        }
        getServer().getServicesManager().register(EconomyService.class, economyService, this, ServicePriority.Normal);
```

In the rest of `onEnable`, replace every **argument** `economyManager` passed to `new MoneyAddCommand(...)`, `new MoneyUndoCommand(...)`, `new PayCommand(...)`, `new PortfelCommand(...)` and `new RewardManager(...)` with `economyService`. Leave `onDisable` as it is: it already checks `economyManager != null`.

- [ ] **Step 6: Build**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core clean package`
Expected: exit 0, all tests pass.

- [ ] **Step 7: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultEconomyProvider.java mainplugins-core/src/main/java/elo/mainplugins/core/economy/VaultHook.java mainplugins-core/src/main/resources/config.yml mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java; git commit -m "Core: Vault w obie strony (nasza kasa dla innych / nasze pluginy na cudzej kasie) + ustawienie economy"
```

---

### Task 5: `commands.yml` parsing + permission nodes (pure)

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandSetting.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandSettingsParser.java`
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/command/PermissionNodes.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/command/CommandSettingsParserTest.java`
- Test: `mainplugins-core/src/test/java/elo/mainplugins/core/command/PermissionNodesTest.java`

**Interfaces:**
- Produces:
  - `record CommandSetting(String command, boolean enabled, String name, List<String> aliases)`: `command` is the original name from plugin.yml; `name` and `aliases` are lower-case.
  - `CommandSettingsParser.parse(ConfigurationSection root, Consumer<String> warn) → Map<String, CommandSetting>` (key = original name, lower-case). A missing `name` means the original name. A name/alias that is not `[a-z0-9_-]+` is dropped with a warning. A label claimed by two entries is kept for the first and dropped with a warning in the later one.
  - `PermissionNodes.nodeFor(String pluginName, String command) → String` (`MainpluginsShop`, `sklep` → `mainplugins.shop.command.sklep`; `@reloadsklep` → `mainplugins.shop.command.admin.reloadsklep`)
  - `PermissionNodes.isAdmin(String command) → boolean` (starts with `@`)

- [ ] **Step 1: Write the failing tests**

`CommandSettingsParserTest.java`:

```java
package elo.mainplugins.core.command;

import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CommandSettingsParserTest {

    private final List<String> warnings = new ArrayList<>();

    private Map<String, CommandSetting> parse(String yaml) throws Exception {
        YamlConfiguration y = new YamlConfiguration();
        y.loadFromString(yaml);
        return CommandSettingsParser.parse(y, warnings::add);
    }

    @Test
    void readsNameAliasesAndEnabled() throws Exception {
        Map<String, CommandSetting> s = parse("""
                commands:
                  przelej:
                    name: Pay
                    aliases: [przelej, PRZELEW]
                  "@reloadsklep":
                    enabled: false
                """);
        assertEquals(new CommandSetting("przelej", true, "pay", List.of("przelej", "przelew")), s.get("przelej"));
        assertEquals(new CommandSetting("@reloadsklep", false, "@reloadsklep", List.of()), s.get("@reloadsklep"));
        assertTrue(warnings.isEmpty());
    }

    @Test
    void invalidLabelIsDropped() throws Exception {
        Map<String, CommandSetting> s = parse("commands:\n  sklep:\n    name: \"my shop\"\n    aliases: [ok, \"bad one\"]\n");
        assertEquals(new CommandSetting("sklep", true, "sklep", List.of("ok")), s.get("sklep"));
        assertEquals(2, warnings.size());
    }

    @Test
    void labelUsedTwiceIsKeptForFirstOnly() throws Exception {
        Map<String, CommandSetting> s = parse("""
                commands:
                  przelej:
                    name: pay
                  portfel:
                    name: balance
                    aliases: [pay, money]
                """);
        assertEquals(List.of("money"), s.get("portfel").aliases());
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("pay"));
    }

    @Test
    void missingSectionGivesEmptyMap() throws Exception {
        assertEquals(Map.of(), parse("other: 1\n"));
    }
}
```

`PermissionNodesTest.java`:

```java
package elo.mainplugins.core.command;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PermissionNodesTest {

    @Test
    void playerAndAdminNodes() {
        assertEquals("mainplugins.shop.command.sklep", PermissionNodes.nodeFor("MainpluginsShop", "sklep"));
        assertEquals("mainplugins.shop.command.admin.reloadsklep", PermissionNodes.nodeFor("MainpluginsShop", "@reloadsklep"));
        assertEquals("mainplugins.core.command.przelej", PermissionNodes.nodeFor("MainpluginsCore", "przelej"));
    }

    @Test
    void adminIsAtPrefix() {
        assertTrue(PermissionNodes.isAdmin("@dajcustom"));
        assertFalse(PermissionNodes.isAdmin("sklep"));
    }
}
```

- [ ] **Step 2: Run and confirm they fail**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test "-Dtest=CommandSettingsParserTest,PermissionNodesTest"`
Expected: compilation FAIL, `cannot find symbol ... CommandSetting`.

- [ ] **Step 3: Implement**

`CommandSetting.java`:

```java
package elo.mainplugins.core.command;

import java.util.List;

/** Jeden wpis commands.yml: oryginalna nazwa z plugin.yml -> nowa nazwa, aliasy, włączona/wyłączona. */
public record CommandSetting(String command, boolean enabled, String name, List<String> aliases) {

    public CommandSetting {
        aliases = List.copyOf(aliases);
    }
}
```

`CommandSettingsParser.java`:

```java
package elo.mainplugins.core.command;

import org.bukkit.configuration.ConfigurationSection;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/** Czyta commands.yml. Złe nazwy i nazwy zajęte przez wcześniejszy wpis są pomijane z ostrzeżeniem. */
public final class CommandSettingsParser {

    private static final Pattern LABEL = Pattern.compile("@?[a-z0-9_-]+");

    private CommandSettingsParser() {}

    public static Map<String, CommandSetting> parse(ConfigurationSection root, Consumer<String> warn) {
        Map<String, CommandSetting> out = new LinkedHashMap<>();
        ConfigurationSection commands = root.getConfigurationSection("commands");
        if (commands == null) return out;

        Set<String> taken = new HashSet<>();
        for (String key : commands.getKeys(false)) {
            String command = key.toLowerCase(Locale.ROOT);
            ConfigurationSection s = commands.getConfigurationSection(key);
            if (s == null) {
                warn.accept("commands.yml: '" + key + "' is not a section - skipping.");
                continue;
            }
            String name = label(s.getString("name", command), key, warn);
            if (name == null) name = command;
            if (!taken.add(name)) {
                warn.accept("commands.yml: '/" + name + "' is already used by another entry - '" + key + "' keeps its original name.");
                name = command;
                taken.add(name);
            }
            List<String> aliases = new ArrayList<>();
            for (String raw : s.getStringList("aliases")) {
                String alias = label(raw, key, warn);
                if (alias == null) continue;
                if (!taken.add(alias)) {
                    warn.accept("commands.yml: alias '/" + alias + "' of '" + key + "' is already used - skipping it.");
                    continue;
                }
                aliases.add(alias);
            }
            out.put(command, new CommandSetting(command, s.getBoolean("enabled", true), name, aliases));
        }
        return out;
    }

    private static String label(String raw, String key, Consumer<String> warn) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (!LABEL.matcher(value).matches()) {
            warn.accept("commands.yml: '" + raw + "' in '" + key + "' is not a valid command name (letters, digits, _ and - only) - skipping it.");
            return null;
        }
        return value;
    }
}
```

`PermissionNodes.java`:

```java
package elo.mainplugins.core.command;

import java.util.Locale;

/** Domyślne uprawnienie komendy bez własnego: mainplugins.<plugin>.command[.admin].<nazwa>. */
public final class PermissionNodes {

    private PermissionNodes() {}

    public static String nodeFor(String pluginName, String command) {
        String plugin = pluginName.toLowerCase(Locale.ROOT).replaceFirst("^mainplugins", "");
        String cmd = command.toLowerCase(Locale.ROOT);
        return "mainplugins." + plugin + ".command." + (isAdmin(cmd) ? "admin." + cmd.substring(1) : cmd);
    }

    public static boolean isAdmin(String command) {
        return command.startsWith("@");
    }
}
```

- [ ] **Step 4: Run and confirm they pass**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core test "-Dtest=CommandSettingsParserTest,PermissionNodesTest"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandSetting.java mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandSettingsParser.java mainplugins-core/src/main/java/elo/mainplugins/core/command/PermissionNodes.java mainplugins-core/src/test/java/elo/mainplugins/core/command/CommandSettingsParserTest.java mainplugins-core/src/test/java/elo/mainplugins/core/command/PermissionNodesTest.java; git commit -m "Core: czytanie commands.yml i domyslne uprawnienia komend"
```

---

### Task 6: CommandRemapper + English defaults

**Files:**
- Create: `mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandRemapper.java`
- Create: `mainplugins-core/src/main/resources/commands.yml`
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java`

**Interfaces:**
- Consumes: `CommandSettingsParser`, `CommandSetting`, `PermissionNodes` (Task 5)
- Produces: `new CommandRemapper(Plugin core)`, a `Listener` that applies `commands.yml` once on `ServerLoadEvent`

- [ ] **Step 1: Create `commands.yml`**

```yaml
# Rename or turn off any Mainplugins command.
# Key = the command's original name. For each one you can set:
#   name     - the main name players type
#   aliases  - extra names that also work
#   enabled  - false = the command is removed from the server
# If another plugin already uses a name, that plugin keeps it and ours stays
# available as /<plugin>:<name> (the server log says which ones - rename them here).
# Every command also gets a permission (mainplugins.<plugin>.command.<name>) for LuckPerms.
# Changes need a server restart.
commands:
  przelej:
    name: pay
    aliases: [przelej]
  portfel:
    name: balance
    aliases: [portfel, money, bal, p]
  sklep:
    name: shop
    aliases: [sklep, buy]
  sprzedaj:
    name: sell
    aliases: [sprzedaj]
  sprzedajwszystko:
    name: sellall
    aliases: [sprzedajwszystko]
  targ:
    name: market
    aliases: [targ]
  zadania:
    name: quests
    aliases: [zadania, quest]
  osiagniecia:
    name: achievements
    aliases: [osiagniecia, ach, osiag]
  teleportuj:
    name: tpa
    aliases: [teleportuj]
  tpakceptuj:
    name: tpaccept
    aliases: [tpakceptuj]
  tpodrzuc:
    name: tpdeny
    aliases: [tpodrzuc]
  dom:
    name: home
    aliases: [dom]
  komendy:
    name: commands
    aliases: [komendy, pomoc, help]
  wycisz:
    name: mute
    aliases: [wycisz]
  wedka:
    name: rod
    aliases: [wedka]
  rybtop:
    name: fishtop
    aliases: [rybtop]
  rybiemenu:
    name: fishmenu
    aliases: [rybiemenu, rmenu]
  rybpasek:
    name: fishbar
    aliases: [rybpasek]
  tpboss:
    name: boss
    aliases: [tpboss]
  tpdun:
    name: dungeon
    aliases: [tpdun]
```

- [ ] **Step 2: Create `CommandRemapper`**

```java
package elo.mainplugins.core.command;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandMap;
import org.bukkit.command.PluginCommand;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.server.ServerLoadEvent;
import org.bukkit.permissions.Permission;
import org.bukkit.permissions.PermissionDefault;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Po starcie serwera (wszystkie pluginy włączone) nakłada commands.yml na komendy
 * pluginów Mainplugins*: zmiana nazwy, aliasy, wyłączenie, plus domyślne uprawnienie
 * dla komend, które go nie mają. Executor komendy się nie zmienia - tylko pod jakimi
 * nazwami jest zarejestrowana w CommandMap.
 */
public final class CommandRemapper implements Listener {

    private final Plugin core;

    public CommandRemapper(Plugin core) {
        this.core = core;
    }

    @EventHandler
    public void onServerLoad(ServerLoadEvent event) {
        File file = new File(core.getDataFolder(), "commands.yml");
        if (!file.exists()) core.saveResource("commands.yml", false);
        Map<String, CommandSetting> settings =
                CommandSettingsParser.parse(YamlConfiguration.loadConfiguration(file), core.getLogger()::warning);

        CommandMap map = Bukkit.getCommandMap();
        Map<String, Command> known = map.getKnownCommands();
        Set<PluginCommand> ours = new LinkedHashSet<>();
        for (Command c : known.values()) {
            if (c instanceof PluginCommand pc && pc.getPlugin().getName().startsWith("Mainplugins")) ours.add(pc);
        }

        for (PluginCommand cmd : ours) {
            ensurePermission(cmd);
            CommandSetting setting = settings.get(cmd.getName().toLowerCase(Locale.ROOT));
            if (setting != null) apply(map, known, cmd, setting);
        }
        Bukkit.getOnlinePlayers().forEach(Player::updateCommands);
    }

    private void ensurePermission(PluginCommand cmd) {
        if (cmd.getPermission() != null) return;
        String node = PermissionNodes.nodeFor(cmd.getPlugin().getName(), cmd.getName());
        if (Bukkit.getPluginManager().getPermission(node) == null) {
            Bukkit.getPluginManager().addPermission(new Permission(node,
                    PermissionNodes.isAdmin(cmd.getName()) ? PermissionDefault.OP : PermissionDefault.TRUE));
        }
        cmd.setPermission(node);
    }

    private void apply(CommandMap map, Map<String, Command> known, PluginCommand cmd, CommandSetting setting) {
        List<String> labels = new ArrayList<>();
        for (Map.Entry<String, Command> e : known.entrySet()) {
            if (e.getValue() == cmd) labels.add(e.getKey());
        }
        labels.forEach(known::remove);
        cmd.unregister(map);

        if (!setting.enabled()) {
            core.getLogger().info("Command /" + setting.command() + " is turned off in commands.yml.");
            return;
        }
        cmd.setAliases(setting.aliases());
        cmd.setLabel(setting.name());
        String prefix = cmd.getPlugin().getName().toLowerCase(Locale.ROOT);
        if (!map.register(setting.name(), prefix, cmd)) {
            core.getLogger().warning("/" + setting.name() + " is already used by another plugin - ours is available as /"
                    + prefix + ":" + setting.name() + ". Rename it in commands.yml.");
        }
    }
}
```

- [ ] **Step 3: Register the listener in `MainpluginsCore.onEnable`**

Import `elo.mainplugins.core.command.CommandRemapper`. Before the final `getLogger().info("MainpluginsCore włączony ...")` line add:

```java
        getServer().getPluginManager().registerEvents(new CommandRemapper(this), this);
```

- [ ] **Step 4: Full build**

Run: `& $mvn -f "D:\folder z mc\pom.xml" -fae clean package 2>&1 | Select-String "Mainplugins .*(SUCCESS|FAILURE)|Tests run:.*Fail"`
Expected: every module SUCCESS except `Mainplugins - Spawn` (known, pre-existing). Core runs 50 tests (34 + 4 + 6 + 6), all with `Failures: 0, Errors: 0`.

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/command/CommandRemapper.java mainplugins-core/src/main/resources/commands.yml mainplugins-core/src/main/java/elo/mainplugins/core/MainpluginsCore.java; git commit -m "Core: commands.yml - angielskie nazwy komend graczy, aliasy, wylaczanie, uprawnienia"
```

---

### Task 7: Manual check on the test server

Test server: `C:\Users\Zgredek\Desktop\Serwer`. The server must be **stopped** while jars are replaced (Windows locks them). Copy the jars only with the user's OK. Installing PlaceholderAPI / Vault / EssentialsX means downloading third-party plugins, so ask the user first and let them choose.

- [ ] **Step 1 (no extra plugins):** Copy the fresh `mainplugins-core` and `mainplugins-hud` jars from `D:\folder z mc\dist\` to the server, then start it. Expected: no errors from core; `plugins/MainpluginsCore/commands.yml` exists.
- [ ] **Step 2:** In game: `/pay`, `/balance`, `/przelej`, `/portfel` all work. `/tpa <nick>` sends a teleport request. `/tp` is the vanilla command. Tab-complete shows the new names.
- [ ] **Step 3:** In `commands.yml`, set `enabled: false` under `wycisz`, then restart. Expected: `/mute` and `/wycisz` are unknown commands, and the log says the command is turned off.
- [ ] **Step 4 (only if the user installs PlaceholderAPI):** `/papi parse me %mainplugins_money%` shows your balance, e.g. `1,100`. `%mainplugins_kasa%` still works (it comes from HUD).
- [ ] **Step 5 (only if the user installs Vault):** the log says `Vault found - Mainplugins economy is now available to other plugins.` With EssentialsX as well, `/eco give <nick> 50` (Essentials) changes `/balance` (ours).
- [ ] **Step 6 (optional, Vault + EssentialsX):** set `economy: vault` and restart. `/balance` shows the EssentialsX balance, and the log says `Economy mode: vault`.
