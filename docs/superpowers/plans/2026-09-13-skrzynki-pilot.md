# Crates Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `mainplugins-crates` on the foundation, with any number of crates defined in `crates.yml`, keys that are either per-crate or shared, prizes made of shared `rewards:`, a left-click preview and lang files. In the app, replace the crate editor and add the shared `RewardEditor` and `ItemRefPicker` components.

**Architecture:** The plugin has a pure model and parser (`model/*`, `CrateConfigParser`, `CrateOdds`), unit-tested with JUnit, plus a Bukkit layer (`CrateItems`, `CrateManager`, `CrateCommand`). Prizes are paid out through `RewardService`, and the plugin registers two reward types, `crate` and `key`. The old `CrateService` methods keep working for the other plugins. In the app, pure YAML modules (`lib/rewards.ts`, `lib/cratesYaml.ts`) are covered by vitest, the shared components live in `components/`, and the page is rewritten in the Custom-items style (`ci-*` CSS classes).

**Tech Stack:** Java 25, Paper API 26.2, JUnit 5; React 19 + TypeScript, js-yaml, vitest.

**Spec:** `C:\Users\Zgredek\pluginmanager\docs\superpowers\specs\2026-09-13-skrzynki-pilot-design.md`

## Global Constraints

- Pluginy repo: `D:\folder z mc`, branch `Karol`. App repo: `C:\Users\Zgredek\pluginmanager`, branch `Karol`. Commit after each task with a short named Polish message and push to `origin Karol`. Never touch `NOTATKI.md`, `docs/configi-zewnetrzne/*` or the screenshot. Always end on branch `Karol`.
- Maven: `$mvn = "D:\intelia\IntelliJ IDEA 2026.2.0.1\plugins\maven-plugin\lib\maven3\bin\mvn.cmd"`, always `clean package`. Build a module together with core: `-pl mainplugins-core,mainplugins-crates`.
- App tests: `npx vitest run` and `npx tsc --noEmit` in `desktop-app`.
- Every player/admin text goes to `lang/en.yml` + `lang/pl.yml` of the crates plugin. Defaults are English. Code comments are short and Polish. Log lines are English.
- A bad config never throws. The bad entry is skipped with a warning that names the path.
- No backward compatibility for the config format. In-world items do stay compatible: old tier tag → crate by position, old key tag → `universal_key`.
- Never write `${` in resources (Maven filtering).

---

## File Structure

**Pluginy (`D:\folder z mc`)**

| File | Status | Responsibility |
|---|---|---|
| `mainplugins-core/src/main/java/elo/mainplugins/core/api/CrateService.java` | modify | + `createCrate`, `createKey`, `crateIds`, `keyIds` |
| `mainplugins-crates/pom.xml` | modify | JUnit |
| `mainplugins-crates/src/main/java/elo/mainplugins/crates/model/ItemRef.java` | create | item reference (vanilla/custom + amount) |
| `.../crates/model/KeyDef.java`, `Prize.java`, `CrateDef.java`, `CrateConfig.java` | create | pure model |
| `.../crates/CrateConfigParser.java` | create | pure: YAML → `CrateConfig` + warnings |
| `.../crates/CrateOdds.java` | create | pure: chance %, weighted pick, legacy mapping |
| `.../crates/CrateItems.java` | create | Bukkit: build crate/key/icon items, read tags |
| `.../crates/CrateGuiHolder.java` | create | marks our inventories (click-cancel) |
| `.../crates/CrateManager.java` | rewrite | load, open (PPM), preview (LPM), animation, payout, `CrateService` |
| `.../crates/CrateCommand.java` | create | `/@crate give|key|list|reload` |
| `.../crates/MainpluginsCrates.java` | rewrite | wiring, lang, reward types |
| `.../crates/Nagroda.java` | delete | replaced by `Prize` |
| `mainplugins-crates/src/main/resources/crates.yml` | create | default 3 crates + 4 keys |
| `mainplugins-crates/src/main/resources/lang/en.yml`, `lang/pl.yml` | create | texts |
| `mainplugins-crates/src/main/resources/plugin.yml` | modify | new command |
| `mainplugins-crates/src/test/java/elo/mainplugins/crates/*Test.java` | create | JUnit |

**App (`C:\Users\Zgredek\pluginmanager\desktop-app`)**

| File | Status | Responsibility |
|---|---|---|
| `src/lib/rewards.ts` (+ `.test.ts`) | create | shared reward list model: parse ↔ YAML objects |
| `src/lib/cratesYaml.ts` (+ `.test.ts`) | create | crates.yml parse/serialize, chances, validation, new crate |
| `src/components/ItemRefPicker.tsx` | create | vanilla/custom item picker |
| `src/components/RewardEditor.tsx` | create | shared reward list editor |
| `src/pages/CrateEditorPage.tsx` | rewrite | new crate editor |
| `src/pages/ToolsHubPage.tsx` | modify | card text |
| `src-tauri/plugin-jars/*` | update | fresh jars |

---

## PART A — plugin (Pluginy repo)

### Task A1: Model + parser (pure) + JUnit

**Files:**
- Modify: `mainplugins-crates/pom.xml`
- Create: `model/ItemRef.java`, `model/KeyDef.java`, `model/Prize.java`, `model/CrateDef.java`, `model/CrateConfig.java`, `CrateConfigParser.java` (package `elo.mainplugins.crates`)
- Test: `mainplugins-crates/src/test/java/elo/mainplugins/crates/CrateConfigParserTest.java`

**Interfaces:**
- Consumes: `elo.mainplugins.core.api.Reward`; in tests `elo.mainplugins.core.reward.RewardParser(Predicate<String>, Consumer<String>)` and its `parse(List<?>, String)`.
- Produces:
  - `record ItemRef(String material, String customId, int amount)` with `isCustom()` and `static ItemRef from(Object raw)` (a Map or ConfigurationSection with `item` / `custom` / `amount`; returns null if neither is present).
  - `record KeyDef(String id, String name, List<String> lore, ItemRef item)`
  - `record Prize(String name, ItemRef icon, int weight, boolean announce, List<Reward> rewards)`
  - `record CrateDef(String id, String name, List<String> lore, ItemRef item, List<String> keys, List<Prize> prizes)` with `int totalWeight()`
  - `record CrateConfig(Map<String, KeyDef> keys, Map<String, CrateDef> crates)` (LinkedHashMap, file order) with `List<String> crateIdsInOrder()`
  - `CrateConfigParser.parse(ConfigurationSection root, BiFunction<List<?>, String, List<Reward>> rewards, Predicate<String> materialExists, Consumer<String> warn) → CrateConfig`

- [ ] **Step 1: Add JUnit to `mainplugins-crates/pom.xml`**

After the core `<dependency>`, add:

```xml
        <!-- Testy jednostkowe czystej logiki - nie trafiają do jara -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.11.4</version>
            <scope>test</scope>
        </dependency>
```

After `</dependencies>`, add:

```xml
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.5.2</version>
            </plugin>
        </plugins>
    </build>
```

- [ ] **Step 2: Write the failing test**

```java
package elo.mainplugins.crates;

import elo.mainplugins.core.api.Reward;
import elo.mainplugins.core.reward.RewardParser;
import elo.mainplugins.crates.model.CrateConfig;
import elo.mainplugins.crates.model.CrateDef;
import elo.mainplugins.crates.model.ItemRef;
import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class CrateConfigParserTest {

    private final List<String> warnings = new ArrayList<>();
    private final Set<String> materials = Set.of("ENDER_CHEST", "TRIPWIRE_HOOK", "DIAMOND", "NETHER_STAR");

    private CrateConfig parse(String yaml) throws Exception {
        YamlConfiguration y = new YamlConfiguration();
        y.loadFromString(yaml);
        RewardParser rp = new RewardParser(m -> materials.contains(m.toUpperCase()), warnings::add);
        return CrateConfigParser.parse(y, rp::parse, m -> materials.contains(m.toUpperCase()), warnings::add);
    }

    private static final String FULL = """
            keys:
              basic_key:
                name: "&eBasic Key"
                item: { item: TRIPWIRE_HOOK }
                lore: ["&7one"]
              universal_key:
                name: "&6Universal"
                item: { custom: MAGIC_KEY }
            crates:
              basic:
                name: "&6Mystery"
                item: { item: ENDER_CHEST }
                keys: [basic_key, universal_key]
                prizes:
                  - name: "&bDiamonds"
                    icon: { item: DIAMOND, amount: 4 }
                    weight: 20
                    rewards:
                      - item: DIAMOND
                        amount: 4
                  - name: "&6Legend"
                    icon: { item: NETHER_STAR }
                    weight: 1
                    announce: true
                    rewards:
                      - money: 500
                      - key: basic_key
            """;

    @Test
    void parsesKeysCratesAndPrizes() throws Exception {
        CrateConfig c = parse(FULL);
        assertEquals(List.of("basic_key", "universal_key"), List.copyOf(c.keys().keySet()));
        assertEquals(new ItemRef(null, "MAGIC_KEY", 1), c.keys().get("universal_key").item());
        CrateDef basic = c.crates().get("basic");
        assertEquals("&6Mystery", basic.name());
        assertEquals(List.of("basic_key", "universal_key"), basic.keys());
        assertEquals(2, basic.prizes().size());
        assertEquals(new ItemRef("DIAMOND", null, 4), basic.prizes().get(0).icon());
        assertEquals(List.of(new Reward("item", "DIAMOND", 4, false, List.of())), basic.prizes().get(0).rewards());
        assertTrue(basic.prizes().get(1).announce());
        assertEquals(2, basic.prizes().get(1).rewards().size());
        assertEquals(21, basic.totalWeight());
        assertEquals(List.of("basic"), c.crateIdsInOrder());
        assertTrue(warnings.isEmpty(), warnings.toString());
    }

    @Test
    void unknownKeyReferenceIsDroppedAndCrateWithoutKeysSkipped() throws Exception {
        CrateConfig c = parse("""
                keys:
                  k: { name: K, item: { item: TRIPWIRE_HOOK } }
                crates:
                  a:
                    name: A
                    item: { item: ENDER_CHEST }
                    keys: [k, nope]
                    prizes: [ { name: P, icon: { item: DIAMOND }, weight: 1, rewards: [ { money: 1 } ] } ]
                  b:
                    name: B
                    item: { item: ENDER_CHEST }
                    keys: [nope]
                    prizes: [ { name: P, icon: { item: DIAMOND }, weight: 1, rewards: [ { money: 1 } ] } ]
                """);
        assertEquals(List.of("k"), c.crates().get("a").keys());
        assertFalse(c.crates().containsKey("b"));
        // a: nieznany "nope"; b: nieznany "nope" + brak klucza
        assertEquals(3, warnings.size());
    }

    @Test
    void badPrizesAreSkippedAndCrateWithoutPrizesSkipped() throws Exception {
        CrateConfig c = parse("""
                keys:
                  k: { name: K, item: { item: TRIPWIRE_HOOK } }
                crates:
                  a:
                    name: A
                    item: { item: ENDER_CHEST }
                    keys: [k]
                    prizes:
                      - { name: ZeroWeight, icon: { item: DIAMOND }, weight: 0, rewards: [ { money: 1 } ] }
                      - { name: NoRewards, icon: { item: DIAMOND }, weight: 5, rewards: [] }
                      - { name: BadIcon, icon: { item: NOT_A_BLOCK }, weight: 5, rewards: [ { money: 1 } ] }
                """);
        assertFalse(c.crates().containsKey("a"));
        assertEquals(4, warnings.size());
    }

    @Test
    void keyWithBadItemIsSkipped() throws Exception {
        CrateConfig c = parse("keys:\n  k: { name: K, item: { item: NOT_A_BLOCK } }\ncrates: {}\n");
        assertTrue(c.keys().isEmpty());
        assertEquals(1, warnings.size());
    }

    @Test
    void emptyFileGivesEmptyConfig() throws Exception {
        CrateConfig c = parse("");
        assertTrue(c.keys().isEmpty());
        assertTrue(c.crates().isEmpty());
    }
}
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core,mainplugins-crates test "-Dtest=CrateConfigParserTest" "-Dsurefire.failIfNoSpecifiedTests=false"`
Expected: compilation FAIL, `package elo.mainplugins.crates.model does not exist`.

- [ ] **Step 4: Implement the model**

`model/ItemRef.java`:

```java
package elo.mainplugins.crates.model;

import org.bukkit.configuration.ConfigurationSection;

import java.util.Map;

/** Odwołanie do przedmiotu w crates.yml: { item: MATERIAL } albo { custom: ID }, opcjonalnie amount. */
public record ItemRef(String material, String customId, int amount) {

    public boolean isCustom() {
        return customId != null;
    }

    /** Mapa albo sekcja YAML; null, gdy nie ma ani "item", ani "custom". */
    public static ItemRef from(Object raw) {
        Map<?, ?> map;
        if (raw instanceof ConfigurationSection s) map = s.getValues(false);
        else if (raw instanceof Map<?, ?> m) map = m;
        else return null;
        Object custom = map.get("custom");
        Object item = map.get("item");
        int amount = map.get("amount") instanceof Number n ? Math.max(1, n.intValue()) : 1;
        if (custom != null) return new ItemRef(null, String.valueOf(custom), amount);
        if (item != null) return new ItemRef(String.valueOf(item).toUpperCase(), null, amount);
        return null;
    }
}
```

`model/KeyDef.java`:

```java
package elo.mainplugins.crates.model;

import java.util.List;

/** Klucz z crates.yml (sekcja keys). */
public record KeyDef(String id, String name, List<String> lore, ItemRef item) {}
```

`model/Prize.java`:

```java
package elo.mainplugins.crates.model;

import elo.mainplugins.core.api.Reward;

import java.util.List;

/** Jedna możliwa wygrana skrzynki: ikona i nazwa do animacji/podglądu, waga, co gracz dostaje. */
public record Prize(String name, ItemRef icon, int weight, boolean announce, List<Reward> rewards) {}
```

`model/CrateDef.java`:

```java
package elo.mainplugins.crates.model;

import java.util.List;

/** Skrzynka z crates.yml: wygląd, klucze, które ją otwierają, i pula wygranych. */
public record CrateDef(String id, String name, List<String> lore, ItemRef item, List<String> keys, List<Prize> prizes) {

    public int totalWeight() {
        return prizes.stream().mapToInt(Prize::weight).sum();
    }
}
```

`model/CrateConfig.java`:

```java
package elo.mainplugins.crates.model;

import java.util.List;
import java.util.Map;

/** Cały crates.yml po wczytaniu - kolejność jak w pliku (ważna dla starych skrzynek po numerze tieru). */
public record CrateConfig(Map<String, KeyDef> keys, Map<String, CrateDef> crates) {

    public List<String> crateIdsInOrder() {
        return List.copyOf(crates.keySet());
    }
}
```

- [ ] **Step 5: Implement `CrateConfigParser`**

```java
package elo.mainplugins.crates;

import elo.mainplugins.core.api.Reward;
import elo.mainplugins.crates.model.CrateConfig;
import elo.mainplugins.crates.model.CrateDef;
import elo.mainplugins.crates.model.ItemRef;
import elo.mainplugins.crates.model.KeyDef;
import elo.mainplugins.crates.model.Prize;
import org.bukkit.configuration.ConfigurationSection;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import java.util.function.Predicate;

/** Czyta crates.yml. Złe klucze/skrzynki/wygrane są pomijane z ostrzeżeniem - nigdy wyjątek. */
public final class CrateConfigParser {

    private CrateConfigParser() {}

    public static CrateConfig parse(ConfigurationSection root,
                                    BiFunction<List<?>, String, List<Reward>> rewards,
                                    Predicate<String> materialExists,
                                    Consumer<String> warn) {
        Map<String, KeyDef> keys = new LinkedHashMap<>();
        ConfigurationSection keysSec = root.getConfigurationSection("keys");
        if (keysSec != null) {
            for (String id : keysSec.getKeys(false)) {
                ConfigurationSection s = keysSec.getConfigurationSection(id);
                String where = "crates.yml keys." + id;
                ItemRef item = s == null ? null : validItem(ItemRef.from(s.get("item")), materialExists);
                if (item == null) {
                    warn.accept(where + ": missing or unknown 'item' - skipping key.");
                    continue;
                }
                keys.put(id, new KeyDef(id, s.getString("name", id), List.copyOf(s.getStringList("lore")), item));
            }
        }

        Map<String, CrateDef> crates = new LinkedHashMap<>();
        ConfigurationSection cratesSec = root.getConfigurationSection("crates");
        if (cratesSec != null) {
            for (String id : cratesSec.getKeys(false)) {
                ConfigurationSection s = cratesSec.getConfigurationSection(id);
                String where = "crates.yml crates." + id;
                if (s == null) {
                    warn.accept(where + ": not a section - skipping crate.");
                    continue;
                }
                ItemRef item = validItem(ItemRef.from(s.get("item")), materialExists);
                if (item == null) {
                    warn.accept(where + ": missing or unknown 'item' - skipping crate.");
                    continue;
                }
                List<String> crateKeys = new ArrayList<>();
                for (String k : s.getStringList("keys")) {
                    if (keys.containsKey(k)) crateKeys.add(k);
                    else warn.accept(where + ": unknown key '" + k + "' - ignoring it.");
                }
                if (crateKeys.isEmpty()) {
                    warn.accept(where + ": no valid key opens this crate - skipping crate.");
                    continue;
                }
                List<Prize> prizes = parsePrizes(s.getList("prizes"), where, rewards, materialExists, warn);
                if (prizes.isEmpty()) {
                    warn.accept(where + ": no valid prizes - skipping crate.");
                    continue;
                }
                crates.put(id, new CrateDef(id, s.getString("name", id), List.copyOf(s.getStringList("lore")),
                        item, List.copyOf(crateKeys), List.copyOf(prizes)));
            }
        }
        return new CrateConfig(Collections.unmodifiableMap(keys), Collections.unmodifiableMap(crates));
    }

    private static List<Prize> parsePrizes(List<?> raw, String where,
                                           BiFunction<List<?>, String, List<Reward>> rewards,
                                           Predicate<String> materialExists, Consumer<String> warn) {
        List<Prize> out = new ArrayList<>();
        if (raw == null) return out;
        for (int i = 0; i < raw.size(); i++) {
            String at = where + ".prizes[" + (i + 1) + "]";
            if (!(raw.get(i) instanceof Map<?, ?> m)) {
                warn.accept(at + ": not a map - skipping prize.");
                continue;
            }
            ItemRef icon = validItem(ItemRef.from(m.get("icon")), materialExists);
            if (icon == null) {
                warn.accept(at + ": missing or unknown 'icon' - skipping prize.");
                continue;
            }
            int weight = m.get("weight") instanceof Number n ? n.intValue() : 0;
            if (weight < 1) {
                warn.accept(at + ": 'weight' must be 1 or more - skipping prize.");
                continue;
            }
            List<Reward> list = m.get("rewards") instanceof List<?> l ? rewards.apply(l, at + ".rewards") : List.of();
            if (list.isEmpty()) {
                warn.accept(at + ": no valid rewards - skipping prize.");
                continue;
            }
            String name = m.get("name") != null ? String.valueOf(m.get("name")) : "Prize";
            out.add(new Prize(name, icon, weight, Boolean.TRUE.equals(m.get("announce")), List.copyOf(list)));
        }
        return out;
    }

    /** Zwykły materiał musi istnieć; custom item sprawdzany dopiero przy tworzeniu przedmiotu. */
    private static ItemRef validItem(ItemRef ref, Predicate<String> materialExists) {
        if (ref == null) return null;
        if (!ref.isCustom() && !materialExists.test(ref.material())) return null;
        return ref;
    }
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core,mainplugins-crates test "-Dtest=CrateConfigParserTest" "-Dsurefire.failIfNoSpecifiedTests=false"`
Expected: PASS (5 tests). In `badPrizesAreSkippedAndCrateWithoutPrizesSkipped` there are 4 warnings: zero weight, empty rewards, unknown icon material, and crate without prizes. Empty `rewards: []` produces no parser warning, only the prize warning. If the count differs because RewardParser warns on something, adjust only the expected count, and only after confirming the behaviour is correct.

- [ ] **Step 7: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-crates/pom.xml mainplugins-crates/src/main/java/elo/mainplugins/crates/model mainplugins-crates/src/main/java/elo/mainplugins/crates/CrateConfigParser.java mainplugins-crates/src/test; git commit -m "Skrzynki: model i czytanie crates.yml (dowolne skrzynki, klucze, wygrane z nagrodami)"
```

---

### Task A2: Odds, weighted pick, legacy mapping (pure)

**Files:**
- Create: `mainplugins-crates/src/main/java/elo/mainplugins/crates/CrateOdds.java`
- Test: `mainplugins-crates/src/test/java/elo/mainplugins/crates/CrateOddsTest.java`

**Interfaces:**
- Consumes: `CrateDef`, `Prize` (Task A1)
- Produces:
  - `CrateOdds.chancePercent(CrateDef crate, Prize prize) → double`
  - `CrateOdds.formatChance(double) → String` (one decimal, US locale, e.g. `"4.8"`)
  - `CrateOdds.pick(CrateDef crate, IntUnaryOperator randomBelow) → Prize` (`randomBelow.applyAsInt(n)` returns 0..n-1)
  - `CrateOdds.legacyCrateId(int tier, List<String> idsInOrder) → String` (null if the list is empty)

- [ ] **Step 1: Write the failing test**

```java
package elo.mainplugins.crates;

import elo.mainplugins.crates.model.CrateDef;
import elo.mainplugins.crates.model.ItemRef;
import elo.mainplugins.crates.model.Prize;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CrateOddsTest {

    private static Prize p(String name, int w) {
        return new Prize(name, new ItemRef("DIAMOND", null, 1), w, false, List.of());
    }

    private final CrateDef crate = new CrateDef("c", "C", List.of(), new ItemRef("CHEST", null, 1),
            List.of("k"), List.of(p("a", 20), p("b", 1)));

    @Test
    void chanceIsWeightOverTotal() {
        assertEquals(20.0 / 21 * 100, CrateOdds.chancePercent(crate, crate.prizes().get(0)), 1e-9);
        assertEquals("95.2", CrateOdds.formatChance(CrateOdds.chancePercent(crate, crate.prizes().get(0))));
        assertEquals("4.8", CrateOdds.formatChance(CrateOdds.chancePercent(crate, crate.prizes().get(1))));
    }

    @Test
    void pickFollowsWeights() {
        assertEquals("a", CrateOdds.pick(crate, n -> 0).name());
        assertEquals("a", CrateOdds.pick(crate, n -> 19).name());
        assertEquals("b", CrateOdds.pick(crate, n -> 20).name());
    }

    @Test
    void legacyTierMapsToCrateByPosition() {
        List<String> ids = List.of("basic", "abyss", "darkstar");
        assertEquals("basic", CrateOdds.legacyCrateId(1, ids));
        assertEquals("darkstar", CrateOdds.legacyCrateId(3, ids));
        assertEquals("basic", CrateOdds.legacyCrateId(9, ids));
        assertNull(CrateOdds.legacyCrateId(1, List.of()));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core,mainplugins-crates test "-Dtest=CrateOddsTest" "-Dsurefire.failIfNoSpecifiedTests=false"`
Expected: compilation FAIL, `cannot find symbol ... CrateOdds`.

- [ ] **Step 3: Implement**

```java
package elo.mainplugins.crates;

import elo.mainplugins.crates.model.CrateDef;
import elo.mainplugins.crates.model.Prize;

import java.util.List;
import java.util.Locale;
import java.util.function.IntUnaryOperator;

/** Szanse i losowanie wygranej (czysta logika) + mapowanie starych skrzynek po numerze tieru. */
public final class CrateOdds {

    private CrateOdds() {}

    public static double chancePercent(CrateDef crate, Prize prize) {
        int total = crate.totalWeight();
        return total <= 0 ? 0 : prize.weight() * 100.0 / total;
    }

    public static String formatChance(double percent) {
        return String.format(Locale.US, "%.1f", percent);
    }

    /** randomBelow(n) ma zwrócić liczbę 0..n-1 (w grze: ThreadLocalRandom). */
    public static Prize pick(CrateDef crate, IntUnaryOperator randomBelow) {
        int roll = randomBelow.applyAsInt(crate.totalWeight());
        int acc = 0;
        for (Prize p : crate.prizes()) {
            acc += p.weight();
            if (roll < acc) return p;
        }
        return crate.prizes().getLast();
    }

    /** Stara skrzynka z tagiem tieru 1-3 (albo stare API) -> skrzynka o tej pozycji w pliku; spoza zakresu -> pierwsza. */
    public static String legacyCrateId(int tier, List<String> idsInOrder) {
        if (idsInOrder.isEmpty()) return null;
        return tier >= 1 && tier <= idsInOrder.size() ? idsInOrder.get(tier - 1) : idsInOrder.getFirst();
    }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: the same command as Step 2. Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-crates/src/main/java/elo/mainplugins/crates/CrateOdds.java mainplugins-crates/src/test/java/elo/mainplugins/crates/CrateOddsTest.java; git commit -m "Skrzynki: szanse, losowanie wazone i mapowanie starych tierow"
```

---

### Task A3: Resources — default crates.yml, lang files, plugin.yml

**Files:**
- Create: `mainplugins-crates/src/main/resources/crates.yml`
- Create: `mainplugins-crates/src/main/resources/lang/en.yml`, `lang/pl.yml`
- Modify: `mainplugins-crates/src/main/resources/plugin.yml`
- Test: extend `CrateConfigParserTest` with `defaultFileParsesWithoutWarnings`

**Interfaces:**
- Produces:
  - crate ids `basic`, `abyss`, `darkstar`;
  - key ids `basic_key`, `abyss_key`, `darkstar_key`, `universal_key`;
  - lang keys `crate.need-key {keys}`, `crate.already-opening`, `crate.opening-title {crate}`, `crate.won {prize}`, `crate.announce {player} {prize} {crate}`, `crate.preview-title {crate}`, `crate.preview-chance {chance}`, `reward.crate {amount} {crate}`, `reward.key {amount} {key}`, `admin.usage`, `admin.player-not-found {player}`, `admin.unknown-crate {id} {list}`, `admin.unknown-key {id} {list}`, `admin.given-crate {amount} {id} {player}`, `admin.given-key {amount} {id} {player}`, `admin.list {crates} {keys}`, `admin.reloaded {crates} {keys}`.

- [ ] **Step 1: Create `crates.yml`**

```yaml
# Crates - every crate, its look, which keys open it and what you can win.
# Edit in the app (tab "Skrzynki") or here, then /@crate reload.
#   item / icon: { item: MATERIAL } or { custom: ID_FROM_ITEM_CATALOG }, optional amount
#   keys: which keys open the crate (one key may open several crates)
#   prizes: weight = chance (weight / sum of weights), rewards = what the player gets
#           (money, item, custom, command, crate, key ... - same format as everywhere)
keys:
  basic_key:
    name: "&e&lMystery Crate Key"
    item: { item: TRIPWIRE_HOOK }
    lore: ["&7Opens the Mystery Crate."]
  abyss_key:
    name: "&d&lAbyss Crate Key"
    item: { item: TRIPWIRE_HOOK }
    lore: ["&7Opens the Abyss Crate."]
  darkstar_key:
    name: "&b&lDARKSTAR Crate Key"
    item: { item: TRIPWIRE_HOOK }
    lore: ["&7Opens the DARKSTAR Crate."]
  universal_key:
    name: "&6&lUniversal Crate Key"
    item: { item: TRIPWIRE_HOOK }
    lore: ["&7Opens every crate."]

crates:
  basic:
    name: "&6&lMystery Crate"
    item: { item: ENDER_CHEST }
    lore: ["&7Right-click with a key to open.", "&7Left-click to see the rewards."]
    keys: [basic_key, universal_key]
    prizes:
      - { name: "&7Common Reward", icon: { item: DIRT, amount: 16 }, weight: 40, rewards: [ { item: DIRT, amount: 16 } ] }
      - { name: "&fIron Reward", icon: { item: IRON_INGOT, amount: 8 }, weight: 30, rewards: [ { item: IRON_INGOT, amount: 8 } ] }
      - { name: "&bDiamond Reward", icon: { item: DIAMOND, amount: 4 }, weight: 20, rewards: [ { item: DIAMOND, amount: 4 } ] }
      - { name: "&dNetherite Reward", icon: { item: NETHERITE_INGOT }, weight: 9, rewards: [ { item: NETHERITE_INGOT } ] }
      - { name: "&6&l★ LEGENDARY REWARD ★", icon: { item: NETHER_STAR }, weight: 1, announce: true, rewards: [ { item: NETHER_STAR } ] }
  abyss:
    name: "&d&lAbyss Crate"
    item: { item: SHULKER_BOX }
    lore: ["&7Right-click with a key to open.", "&7Left-click to see the rewards."]
    keys: [abyss_key, universal_key]
    prizes:
      - { name: "&fIron Reward", icon: { item: IRON_BLOCK, amount: 2 }, weight: 30, rewards: [ { item: IRON_BLOCK, amount: 2 } ] }
      - { name: "&bDiamond Reward", icon: { item: DIAMOND, amount: 4 }, weight: 25, rewards: [ { item: DIAMOND, amount: 4 } ] }
      - { name: "&aExperience Bottles", icon: { item: EXPERIENCE_BOTTLE, amount: 32 }, weight: 20, rewards: [ { item: EXPERIENCE_BOTTLE, amount: 32 } ] }
      - { name: "&dNetherite Scrap", icon: { item: NETHERITE_SCRAP, amount: 2 }, weight: 15, rewards: [ { item: NETHERITE_SCRAP, amount: 2 } ] }
      - { name: "&6&l★ ELYTRA ★", icon: { item: ELYTRA }, weight: 6, announce: true, rewards: [ { item: ELYTRA } ] }
      - { name: "&6&l★ NETHER STAR ★", icon: { item: NETHER_STAR }, weight: 4, announce: true, rewards: [ { item: NETHER_STAR } ] }
  darkstar:
    name: "&b&lDARKSTAR Crate"
    item: { item: BEACON }
    lore: ["&7Right-click with a key to open.", "&7Left-click to see the rewards."]
    keys: [darkstar_key, universal_key]
    prizes:
      - { name: "&dNetherite Ingots", icon: { item: NETHERITE_INGOT, amount: 2 }, weight: 30, rewards: [ { item: NETHERITE_INGOT, amount: 2 } ] }
      - { name: "&6Enchanted Golden Apples", icon: { item: ENCHANTED_GOLDEN_APPLE, amount: 2 }, weight: 20, rewards: [ { item: ENCHANTED_GOLDEN_APPLE, amount: 2 } ] }
      - { name: "&d&l★ TOTEM OF UNDYING ★", icon: { item: TOTEM_OF_UNDYING }, weight: 20, announce: true, rewards: [ { item: TOTEM_OF_UNDYING } ] }
      - { name: "&6&l★ ELYTRA ★", icon: { item: ELYTRA }, weight: 15, announce: true, rewards: [ { item: ELYTRA } ] }
      - { name: "&6&l★ NETHER STARS ★", icon: { item: NETHER_STAR, amount: 2 }, weight: 10, announce: true, rewards: [ { item: NETHER_STAR, amount: 2 } ] }
      - { name: "&b&l★★ BEACON ★★", icon: { item: BEACON }, weight: 5, announce: true, rewards: [ { item: BEACON } ] }
```

- [ ] **Step 2: Create lang files**

`lang/en.yml`:

```yaml
# Mainplugins Crates - English messages. Colors: &a &e ...  Placeholders: {name}
crate:
  need-key: "&cYou need a key to open this crate: {keys}&c."
  already-opening: "&cYou are already opening a crate!"
  opening-title: "&6&lOpening: {crate}"
  won: "&aYou won: {prize}&a!"
  announce: "&6{player} won {prize} &6from {crate}&6! ✦"
  preview-title: "&8Rewards: {crate}"
  preview-chance: "&7Chance: &e{chance}%"
reward:
  crate: "&aYou received &e{amount}x {crate}&a."
  key: "&aYou received &e{amount}x {key}&a."
admin:
  usage: "&eUsage: /@crate give <player> <crate> [amount] | key <player> <key> [amount] | list | reload"
  player-not-found: "&cPlayer not found: {player}"
  unknown-crate: "&cUnknown crate: {id}. Available: {list}"
  unknown-key: "&cUnknown key: {id}. Available: {list}"
  given-crate: "&aGave {amount}x crate {id} to {player}."
  given-key: "&aGave {amount}x key {id} to {player}."
  list: "&eCrates: &f{crates}\n&eKeys: &f{keys}"
  reloaded: "&aCrates reloaded: {crates} crates, {keys} keys."
```

`lang/pl.yml`:

```yaml
# Mainplugins Crates - komunikaty po polsku. Kolory: &a &e ...  Placeholdery: {nazwa}
crate:
  need-key: "&cDo otwarcia tej skrzynki potrzebujesz klucza: {keys}&c."
  already-opening: "&cJuż otwierasz skrzynkę!"
  opening-title: "&6&lOtwieranie: {crate}"
  won: "&aWylosowałeś: {prize}&a!"
  announce: "&6{player} wylosował {prize} &6ze skrzynki {crate}&6! ✦"
  preview-title: "&8Nagrody: {crate}"
  preview-chance: "&7Szansa: &e{chance}%"
reward:
  crate: "&aOtrzymujesz &e{amount}x {crate}&a."
  key: "&aOtrzymujesz &e{amount}x {key}&a."
admin:
  usage: "&eUżycie: /@crate give <gracz> <skrzynka> [ile] | key <gracz> <klucz> [ile] | list | reload"
  player-not-found: "&cNie znaleziono gracza: {player}"
  unknown-crate: "&cNieznana skrzynka: {id}. Dostępne: {list}"
  unknown-key: "&cNieznany klucz: {id}. Dostępne: {list}"
  given-crate: "&aWydano {amount}x skrzynkę {id} graczowi {player}."
  given-key: "&aWydano {amount}x klucz {id} graczowi {player}."
  list: "&eSkrzynki: &f{crates}\n&eKlucze: &f{keys}"
  reloaded: "&aSkrzynki przeładowane: {crates} skrzynek, {keys} kluczy."
```

- [ ] **Step 3: Replace `plugin.yml`**

```yaml
name: MainpluginsCrates
version: ${project.version}
main: elo.mainplugins.crates.MainpluginsCrates
api-version: '1.20'
depend: [MainpluginsCore]

commands:
  "@crate":
    description: (Admin) Crates - give crates/keys, list, reload
    usage: /<command> give <player> <crate> [amount] | key <player> <key> [amount] | list | reload
    permission: mainplugins.crates.admin
    permission-message: "&cNie masz permisji do tej komendy!"

permissions:
  mainplugins.crates.admin:
    description: Access to /@crate
    default: op
```

Note: `${project.version}` is the one allowed Maven placeholder, and it already exists in the current file.

- [ ] **Step 4: Add a test that the default file is valid**

Add to `CrateConfigParserTest` (plus the import `java.io.InputStreamReader`):

```java
    @Test
    void defaultFileParsesWithoutWarnings() throws Exception {
        YamlConfiguration y = new YamlConfiguration();
        try (var in = getClass().getClassLoader().getResourceAsStream("crates.yml")) {
            y.load(new InputStreamReader(in, java.nio.charset.StandardCharsets.UTF_8));
        }
        Set<String> all = Set.of("ENDER_CHEST", "SHULKER_BOX", "BEACON", "TRIPWIRE_HOOK", "DIRT", "IRON_INGOT",
                "DIAMOND", "NETHERITE_INGOT", "NETHER_STAR", "IRON_BLOCK", "EXPERIENCE_BOTTLE", "NETHERITE_SCRAP",
                "ELYTRA", "ENCHANTED_GOLDEN_APPLE", "TOTEM_OF_UNDYING");
        RewardParser rp = new RewardParser(m -> all.contains(m.toUpperCase()), warnings::add);
        CrateConfig c = CrateConfigParser.parse(y, rp::parse, m -> all.contains(m.toUpperCase()), warnings::add);
        assertEquals(List.of("basic", "abyss", "darkstar"), c.crateIdsInOrder());
        assertEquals(4, c.keys().size());
        assertTrue(warnings.isEmpty(), warnings.toString());
    }
```

- [ ] **Step 5: Run all crates tests**

Run: `& $mvn -q -f "D:\folder z mc\pom.xml" -pl mainplugins-core,mainplugins-crates test`
Expected: all tests pass (6 + 3 = 9). The old code still compiles, because it doesn't use the resources.

- [ ] **Step 6: Commit**

```powershell
cd "D:\folder z mc"; git add mainplugins-crates/src/main/resources mainplugins-crates/src/test/java/elo/mainplugins/crates/CrateConfigParserTest.java; git commit -m "Skrzynki: domyslny crates.yml (3 skrzynki + klucz uniwersalny), pliki jezykowe, komenda @crate"
```

---

### Task A4: Core `CrateService` + Bukkit layer (items, manager, command, wiring)

**Files:**
- Modify: `mainplugins-core/src/main/java/elo/mainplugins/core/api/CrateService.java`
- Create: `mainplugins-crates/src/main/java/elo/mainplugins/crates/CrateGuiHolder.java`, `CrateItems.java`, `CrateCommand.java`
- Rewrite: `CrateManager.java`, `MainpluginsCrates.java`
- Delete: `Nagroda.java`

**Interfaces:**
- Consumes: A1–A3; `CoreAPI.getLangService()`, `getRewardService()`, `getCustomItemService()`, `LicenseService`; `RewardService.parse`, `give`, `registerType`; `RewardHandler`; `ServerAnnounceEvent(String, Player, Map<String,String>)`
- Produces:
  - `CrateService`: `ItemStack createCrate(String id, int amount)`, `ItemStack createKey(String id, int amount)`, `Set<String> crateIds()`, `Set<String> keyIds()`; the old `stworzSkrzynke(int)` and `stworzKlucz()` stay.
  - reward types `crate` and `key`.

- [ ] **Step 1: Extend `CrateService` in core**

Before the closing `}` of the interface, add:

```java
    /** Skrzynka o danym id z crates.yml (null, gdy nieznana). */
    ItemStack createCrate(String id, int amount);

    /** Klucz o danym id z crates.yml (null, gdy nieznany). */
    ItemStack createKey(String id, int amount);

    /** Id wszystkich skrzynek, w kolejności z crates.yml. */
    java.util.Set<String> crateIds();

    /** Id wszystkich kluczy. */
    java.util.Set<String> keyIds();
```

In the javadoc of `stworzSkrzynke`, change the description to: `Stare API (po numerze tieru) - skrzynka o tej pozycji w crates.yml; nowe pluginy: createCrate(id, ilosc).` In the javadoc of `stworzKlucz`, change it to: `Stare API - klucz universal_key (albo klucz pierwszej skrzynki); nowe pluginy: createKey(id, ilosc).`

- [ ] **Step 2: Create `CrateGuiHolder`**

```java
package elo.mainplugins.crates;

import org.bukkit.Bukkit;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

/** Znacznik naszych okien (animacja, podgląd) - po nim blokujemy klikanie zamiast po tytule. */
final class CrateGuiHolder implements InventoryHolder {

    private Inventory inventory;

    Inventory create(int size, net.kyori.adventure.text.Component title) {
        inventory = Bukkit.createInventory(this, size, title);
        return inventory;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
```

- [ ] **Step 3: Create `CrateItems`**

```java
package elo.mainplugins.crates;

import elo.mainplugins.core.api.CustomItemService;
import elo.mainplugins.crates.model.CrateConfig;
import elo.mainplugins.crates.model.CrateDef;
import elo.mainplugins.crates.model.ItemRef;
import elo.mainplugins.crates.model.KeyDef;
import elo.mainplugins.crates.model.Prize;
import io.papermc.paper.datacomponent.DataComponentTypes;
import io.papermc.paper.datacomponent.item.ItemLore;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;

import java.util.ArrayList;
import java.util.List;

/** Buduje przedmioty skrzynek/kluczy/ikon i rozpoznaje je po tagach (w tym stare przedmioty sprzed pilota). */
final class CrateItems {

    private static final LegacyComponentSerializer SER = LegacyComponentSerializer.legacyAmpersand();

    private final Plugin plugin;
    private final CustomItemService items;
    private final NamespacedKey crateIdTag;
    private final NamespacedKey keyIdTag;
    // Stare tagi (przed pilotem): skrzynka z numerem tieru, jeden uniwersalny klucz.
    private final NamespacedKey legacyBox;
    private final NamespacedKey legacyTier;
    private final NamespacedKey legacyKey;

    CrateItems(Plugin plugin, CustomItemService items) {
        this.plugin = plugin;
        this.items = items;
        this.crateIdTag = new NamespacedKey(plugin, "crate_id");
        this.keyIdTag = new NamespacedKey(plugin, "key_id");
        this.legacyBox = new NamespacedKey(plugin, "crate_box");
        this.legacyTier = new NamespacedKey(plugin, "crate_tier");
        this.legacyKey = new NamespacedKey(plugin, "crate_key");
    }

    static Component text(String legacy) {
        return SER.deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }

    ItemStack crate(CrateDef c, int amount) {
        ItemStack item = base(c.item(), amount);
        style(item, c.name(), c.lore());
        tag(item, crateIdTag, c.id());
        return item;
    }

    ItemStack key(KeyDef k, int amount) {
        ItemStack item = base(k.item(), amount);
        style(item, k.name(), k.lore());
        tag(item, keyIdTag, k.id());
        return item;
    }

    /** Ikona wygranej do animacji/podglądu; extraLore dopisywane pod spodem (np. szansa). */
    ItemStack icon(Prize p, List<String> extraLore) {
        ItemStack item = base(p.icon(), Math.min(64, p.icon().amount()));
        style(item, p.name(), extraLore);
        return item;
    }

    /** Id skrzynki z przedmiotu (stara skrzynka po tierze -> pozycja w pliku), albo null. */
    String crateIdOf(ItemStack item, CrateConfig config) {
        if (item == null || !item.hasItemMeta()) return null;
        PersistentDataContainer pdc = item.getItemMeta().getPersistentDataContainer();
        String id = pdc.get(crateIdTag, PersistentDataType.STRING);
        if (id != null) return id;
        if (pdc.has(legacyBox, PersistentDataType.BYTE)) {
            Integer tier = pdc.get(legacyTier, PersistentDataType.INTEGER);
            return CrateOdds.legacyCrateId(tier != null ? tier : 1, config.crateIdsInOrder());
        }
        return null;
    }

    /** Id klucza z przedmiotu (stary klucz -> universal_key), albo null. */
    String keyIdOf(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return null;
        PersistentDataContainer pdc = item.getItemMeta().getPersistentDataContainer();
        String id = pdc.get(keyIdTag, PersistentDataType.STRING);
        if (id != null) return id;
        return pdc.has(legacyKey, PersistentDataType.BYTE) ? "universal_key" : null;
    }

    private ItemStack base(ItemRef ref, int amount) {
        if (ref.isCustom()) {
            ItemStack custom = items != null ? items.create(ref.customId(), amount) : null;
            if (custom != null) return custom;
            plugin.getLogger().warning("Custom item '" + ref.customId() + "' not found in the item catalog - using STONE.");
            return new ItemStack(Material.STONE, amount);
        }
        Material m = Material.matchMaterial(ref.material());
        return new ItemStack(m != null && m.isItem() ? m : Material.STONE, amount);
    }

    private static void style(ItemStack item, String name, List<String> lore) {
        item.setData(DataComponentTypes.CUSTOM_NAME, text(name));
        if (!lore.isEmpty()) {
            List<Component> lines = new ArrayList<>();
            for (String l : lore) lines.add(text(l));
            item.setData(DataComponentTypes.LORE, ItemLore.lore(lines));
        }
    }

    private static void tag(ItemStack item, NamespacedKey key, String value) {
        ItemMeta meta = item.getItemMeta();
        meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, value);
        item.setItemMeta(meta);
    }
}
```

- [ ] **Step 4: Rewrite `CrateManager`**

```java
package elo.mainplugins.crates;

import elo.mainplugins.core.api.CrateService;
import elo.mainplugins.core.api.CustomItemService;
import elo.mainplugins.core.api.LangService;
import elo.mainplugins.core.api.RewardService;
import elo.mainplugins.core.api.ServerAnnounceEvent;
import elo.mainplugins.crates.model.CrateConfig;
import elo.mainplugins.crates.model.CrateDef;
import elo.mainplugins.crates.model.KeyDef;
import elo.mainplugins.crates.model.Prize;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * Skrzynki z crates.yml: PPM skrzynką w ręce (z pasującym kluczem w ekwipunku) = animacja
 * "ruletki" jak w CS i wypłata przez RewardService; LPM = podgląd wygranych z szansami.
 * Implementuje też CrateService dla innych pluginów (stare metody po tierze działają dalej).
 */
public class CrateManager implements Listener, CrateService {

    // Opóźnienia (ticki) między klatkami - rosnące = zwalnianie ruletki pod koniec.
    private static final int[] OPOZNIENIA_TICK = {
            1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 11, 13, 15, 18, 21, 25
    };
    private static final int SZEROKOSC_OKNA = 9;
    private static final int WIERSZ_ANIMACJI = 9;

    private final Plugin plugin;
    private final LangService lang;
    private final RewardService rewards;
    private final CrateItems crateItems;
    private final Set<UUID> otwierajacy = new HashSet<>();
    private CrateConfig config = new CrateConfig(Map.of(), Map.of());

    public CrateManager(Plugin plugin, LangService lang, RewardService rewards, CustomItemService items) {
        this.plugin = plugin;
        this.lang = lang;
        this.rewards = rewards;
        this.crateItems = new CrateItems(plugin, items);
        reload();
    }

    public void reload() {
        File file = new File(plugin.getDataFolder(), "crates.yml");
        if (!file.exists()) plugin.saveResource("crates.yml", false);
        for (String old : List.of("crate-rewards.yml", "crate-rewards-2.yml", "crate-rewards-3.yml")) {
            if (new File(plugin.getDataFolder(), old).exists()) {
                plugin.getLogger().warning(old + " is no longer read - crates now live in crates.yml.");
            }
        }
        config = CrateConfigParser.parse(YamlConfiguration.loadConfiguration(file), rewards::parse,
                name -> Material.matchMaterial(name) != null, plugin.getLogger()::warning);
        plugin.getLogger().info("Loaded " + config.crates().size() + " crates and " + config.keys().size() + " keys.");
    }

    public CrateConfig config() {
        return config;
    }

    // ---- CrateService ----

    @Override
    public ItemStack stworzSkrzynke(int tier) {
        String id = CrateOdds.legacyCrateId(tier, config.crateIdsInOrder());
        ItemStack item = id != null ? createCrate(id, 1) : null;
        return item != null ? item : new ItemStack(Material.PAPER);
    }

    @Override
    public ItemStack stworzKlucz() {
        ItemStack item = createKey("universal_key", 1);
        if (item != null) return item;
        String first = config.crateIdsInOrder().isEmpty() ? null : config.crates().get(config.crateIdsInOrder().getFirst()).keys().getFirst();
        item = first != null ? createKey(first, 1) : null;
        return item != null ? item : new ItemStack(Material.PAPER);
    }

    @Override
    public ItemStack createCrate(String id, int amount) {
        CrateDef c = config.crates().get(id);
        return c == null ? null : crateItems.crate(c, Math.max(1, amount));
    }

    @Override
    public ItemStack createKey(String id, int amount) {
        KeyDef k = config.keys().get(id);
        return k == null ? null : crateItems.key(k, Math.max(1, amount));
    }

    @Override
    public Set<String> crateIds() {
        return new LinkedHashSet<>(config.crates().keySet());
    }

    @Override
    public Set<String> keyIds() {
        return new LinkedHashSet<>(config.keys().keySet());
    }

    // ---- Gracz ----

    @EventHandler
    public void onInteract(PlayerInteractEvent event) {
        Action a = event.getAction();
        boolean prawy = a == Action.RIGHT_CLICK_AIR || a == Action.RIGHT_CLICK_BLOCK;
        boolean lewy = a == Action.LEFT_CLICK_AIR || a == Action.LEFT_CLICK_BLOCK;
        if (!prawy && !lewy) return;

        Player player = event.getPlayer();
        ItemStack wRece = player.getInventory().getItemInMainHand();
        String crateId = crateItems.crateIdOf(wRece, config);
        CrateDef crate = crateId != null ? config.crates().get(crateId) : null;
        if (crate == null) return;
        // Zawsze anulujemy - skrzynka-blok w ręku nie może się postawić ani niszczyć bloków.
        event.setCancelled(true);

        if (lewy) {
            otworzPodglad(player, crate);
            return;
        }
        if (otwierajacy.contains(player.getUniqueId())) {
            lang.send(player, plugin, "crate.already-opening");
            return;
        }
        int slotKlucza = znajdzSlotKlucza(player, crate);
        if (slotKlucza == -1) {
            String klucze = crate.keys().stream().map(k -> config.keys().get(k).name()).collect(Collectors.joining("&7, "));
            lang.send(player, plugin, "crate.need-key", Map.of("keys", klucze));
            return;
        }
        zmniejsz(player, player.getInventory().getHeldItemSlot());
        zmniejsz(player, slotKlucza);
        rozpocznijAnimacje(player, crate);
    }

    private int znajdzSlotKlucza(Player player, CrateDef crate) {
        ItemStack[] zawartosc = player.getInventory().getContents();
        for (int i = 0; i < zawartosc.length; i++) {
            String keyId = crateItems.keyIdOf(zawartosc[i]);
            if (keyId != null && crate.keys().contains(keyId)) return i;
        }
        return -1;
    }

    private void zmniejsz(Player player, int slot) {
        ItemStack item = player.getInventory().getItem(slot);
        if (item == null) return;
        if (item.getAmount() <= 1) player.getInventory().setItem(slot, null);
        else item.setAmount(item.getAmount() - 1);
    }

    private void otworzPodglad(Player player, CrateDef crate) {
        int ile = Math.min(54, crate.prizes().size());
        int rozmiar = Math.max(9, ((ile + 8) / 9) * 9);
        Inventory gui = new CrateGuiHolder().create(rozmiar,
                lang.msg(plugin, "crate.preview-title", Map.of("crate", crate.name())));
        for (int i = 0; i < ile; i++) {
            Prize p = crate.prizes().get(i);
            String szansa = CrateOdds.formatChance(CrateOdds.chancePercent(crate, p));
            String linia = PlainTextComponentSerializer.plainText().serialize(lang.msg(plugin, "crate.preview-chance", Map.of("chance", szansa)));
            gui.setItem(i, crateItems.icon(p, List.of("&7" + linia)));
        }
        player.openInventory(gui);
    }

    private void rozpocznijAnimacje(Player player, CrateDef crate) {
        otwierajacy.add(player.getUniqueId());
        Prize wygrana = CrateOdds.pick(crate, n -> ThreadLocalRandom.current().nextInt(n));

        int liczbaKlatek = OPOZNIENIA_TICK.length;
        List<ItemStack> pasek = new ArrayList<>(liczbaKlatek + SZEROKOSC_OKNA);
        for (int i = 0; i < liczbaKlatek + SZEROKOSC_OKNA; i++) {
            Prize los = CrateOdds.pick(crate, n -> ThreadLocalRandom.current().nextInt(n));
            pasek.add(crateItems.icon(los, List.of()));
        }
        pasek.set((liczbaKlatek - 1) + 4, crateItems.icon(wygrana, List.of()));

        Inventory gui = new CrateGuiHolder().create(27, lang.msg(plugin, "crate.opening-title", Map.of("crate", crate.name())));
        ItemStack tlo = szyba(Material.BLACK_STAINED_GLASS_PANE, " ");
        for (int i = 0; i < gui.getSize(); i++) gui.setItem(i, tlo);
        gui.setItem(4, szyba(Material.YELLOW_STAINED_GLASS_PANE, "&e&l▼"));
        gui.setItem(22, szyba(Material.YELLOW_STAINED_GLASS_PANE, "&e&l▲"));
        player.openInventory(gui);
        animujKlatke(player, gui, pasek, 0, crate, wygrana);
    }

    private void animujKlatke(Player player, Inventory gui, List<ItemStack> pasek, int krok, CrateDef crate, Prize wygrana) {
        if (!player.isOnline()) {
            // Gracz wyszedł w trakcie - nagroda i tak mu się należy (skrzynka i klucz już zużyte).
            otwierajacy.remove(player.getUniqueId());
            return;
        }
        for (int i = 0; i < SZEROKOSC_OKNA; i++) gui.setItem(WIERSZ_ANIMACJI + i, pasek.get(krok + i));
        player.playSound(player.getLocation(), Sound.UI_BUTTON_CLICK, 0.6f, 1.0f);
        if (krok < OPOZNIENIA_TICK.length - 1) {
            Bukkit.getScheduler().runTaskLater(plugin, () -> animujKlatke(player, gui, pasek, krok + 1, crate, wygrana), OPOZNIENIA_TICK[krok]);
        } else {
            Bukkit.getScheduler().runTaskLater(plugin, () -> zakoncz(player, crate, wygrana), 30L);
        }
    }

    private void zakoncz(Player player, CrateDef crate, Prize wygrana) {
        otwierajacy.remove(player.getUniqueId());
        if (!player.isOnline()) return;
        player.closeInventory();
        rewards.give(player, wygrana.rewards());
        lang.send(player, plugin, "crate.won", Map.of("prize", wygrana.name()));
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f);

        if (wygrana.announce()) {
            String plainPrize = PlainTextComponentSerializer.plainText().serialize(CrateItems.text(wygrana.name()));
            String plainCrate = PlainTextComponentSerializer.plainText().serialize(CrateItems.text(crate.name()));
            // Most do mainplugins-announcer (events.crate-legendary); bez niego - wbudowane ogłoszenie.
            Bukkit.getPluginManager().callEvent(new ServerAnnounceEvent("crate-legendary", player,
                    Map.of("reward", plainPrize, "crate", plainCrate)));
            if (Bukkit.getPluginManager().getPlugin("MainpluginsAnnouncer") == null) {
                Bukkit.broadcast(lang.msg(plugin, "crate.announce",
                        Map.of("player", player.getName(), "prize", wygrana.name(), "crate", crate.name())));
            }
        }
    }

    private static ItemStack szyba(Material m, String nazwa) {
        ItemStack item = new ItemStack(m);
        item.setData(io.papermc.paper.datacomponent.DataComponentTypes.CUSTOM_NAME, CrateItems.text(nazwa));
        return item;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (event.getInventory().getHolder() instanceof CrateGuiHolder) event.setCancelled(true);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getInventory().getHolder() instanceof CrateGuiHolder) event.setCancelled(true);
    }
}
```

Note on disconnects during the animation: the old behaviour lost the prize when the player went offline mid-animation. This rewrite keeps that behaviour (`if (!player.isOnline()) return;`). If manual testing shows it matters, a follow-up can pay out on the next join. That is out of scope.

- [ ] **Step 5: Create `CrateCommand`**

```java
package elo.mainplugins.crates;

import elo.mainplugins.core.api.LangService;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** /@crate give <gracz> <skrzynka> [ile] | key <gracz> <klucz> [ile] | list | reload */
final class CrateCommand implements CommandExecutor, TabCompleter {

    private final Plugin plugin;
    private final CrateManager crates;
    private final LangService lang;

    CrateCommand(Plugin plugin, CrateManager crates, LangService lang) {
        this.plugin = plugin;
        this.crates = crates;
        this.lang = lang;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        String sub = args.length > 0 ? args[0].toLowerCase(Locale.ROOT) : "";
        switch (sub) {
            case "reload" -> {
                crates.reload();
                lang.send(sender, plugin, "admin.reloaded", Map.of(
                        "crates", String.valueOf(crates.crateIds().size()), "keys", String.valueOf(crates.keyIds().size())));
            }
            case "list" -> lang.send(sender, plugin, "admin.list", Map.of(
                    "crates", String.join(", ", crates.crateIds()), "keys", String.join(", ", crates.keyIds())));
            case "give", "key" -> give(sender, args, sub.equals("give"));
            default -> lang.send(sender, plugin, "admin.usage");
        }
        return true;
    }

    private void give(CommandSender sender, String[] args, boolean crate) {
        if (args.length < 3) {
            lang.send(sender, plugin, "admin.usage");
            return;
        }
        Player target = Bukkit.getPlayerExact(args[1]);
        if (target == null) {
            lang.send(sender, plugin, "admin.player-not-found", Map.of("player", args[1]));
            return;
        }
        int amount = 1;
        if (args.length >= 4) {
            try {
                amount = Math.max(1, Integer.parseInt(args[3]));
            } catch (NumberFormatException e) {
                lang.send(sender, plugin, "admin.usage");
                return;
            }
        }
        String id = args[2];
        ItemStack item = crate ? crates.createCrate(id, amount) : crates.createKey(id, amount);
        if (item == null) {
            lang.send(sender, plugin, crate ? "admin.unknown-crate" : "admin.unknown-key", Map.of(
                    "id", id, "list", String.join(", ", crate ? crates.crateIds() : crates.keyIds())));
            return;
        }
        target.getInventory().addItem(item).values().forEach(l -> target.getWorld().dropItemNaturally(target.getLocation(), l));
        lang.send(sender, plugin, crate ? "admin.given-crate" : "admin.given-key", Map.of(
                "amount", String.valueOf(amount), "id", id, "player", target.getName()));
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, String[] args) {
        if (args.length == 1) return filter(List.of("give", "key", "list", "reload"), args[0]);
        if (args.length == 2 && (args[0].equalsIgnoreCase("give") || args[0].equalsIgnoreCase("key"))) return null;
        if (args.length == 3 && args[0].equalsIgnoreCase("give")) return filter(new ArrayList<>(crates.crateIds()), args[2]);
        if (args.length == 3 && args[0].equalsIgnoreCase("key")) return filter(new ArrayList<>(crates.keyIds()), args[2]);
        return List.of();
    }

    private static List<String> filter(List<String> options, String prefix) {
        return options.stream().filter(o -> o.toLowerCase(Locale.ROOT).startsWith(prefix.toLowerCase(Locale.ROOT))).toList();
    }
}
```

- [ ] **Step 6: Rewrite `MainpluginsCrates` and delete `Nagroda.java`**

```java
package elo.mainplugins.crates;

import elo.mainplugins.core.CoreAPI;
import elo.mainplugins.core.api.CrateService;
import elo.mainplugins.core.api.LangService;
import elo.mainplugins.core.api.Reward;
import elo.mainplugins.core.api.RewardService;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.ServicePriority;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.Map;

public final class MainpluginsCrates extends JavaPlugin {

    private CrateManager crateManager;

    @Override
    public void onEnable() {
        // Plugin płatny - patrz javadoc LicenseService oraz license-server/README.md.
        if (!CoreAPI.getLicenseService().isLicensed("crates")) {
            getLogger().severe("Brak ważnej licencji dla mainplugins-crates - plugin zostanie wyłączony.");
            getLogger().severe("Skonfiguruj klucz w license.yml (folder danych MainpluginsCore, sekcja 'keys: crates: ...') i zrestartuj serwer.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        LangService lang = CoreAPI.getLangService();
        lang.registerDefaults(this);
        RewardService rewards = CoreAPI.getRewardService();

        crateManager = new CrateManager(this, lang, rewards, CoreAPI.getCustomItemService());
        getServer().getPluginManager().registerEvents(crateManager, this);
        getServer().getServicesManager().register(CrateService.class, crateManager, this, ServicePriority.Normal);

        // Nagrody "crate: id" i "key: id" działają teraz w nagrodach WSZYSTKICH pluginów.
        rewards.registerType(this, "crate", (player, r) -> daj(player, r, crateManager.createCrate(String.valueOf(r.value()), r.amount()), "reward.crate", "crate"));
        rewards.registerType(this, "key", (player, r) -> daj(player, r, crateManager.createKey(String.valueOf(r.value()), r.amount()), "reward.key", "key"));

        if (getCommand("@crate") != null) {
            CrateCommand cmd = new CrateCommand(this, crateManager, lang);
            getCommand("@crate").setExecutor(cmd);
            getCommand("@crate").setTabCompleter(cmd);
        }
    }

    /** false = nieznane id -> RewardService użyje fallback nagrody. */
    private boolean daj(Player player, Reward r, ItemStack item, String msgKey, String placeholder) {
        if (item == null) return false;
        player.getInventory().addItem(item).values().forEach(l -> player.getWorld().dropItemNaturally(player.getLocation(), l));
        if (!r.silent()) {
            String nazwa = placeholder.equals("crate")
                    ? crateManager.config().crates().get(String.valueOf(r.value())).name()
                    : crateManager.config().keys().get(String.valueOf(r.value())).name();
            CoreAPI.getLangService().send(player, this, msgKey, Map.of("amount", String.valueOf(r.amount()), placeholder, nazwa));
        }
        return true;
    }

    @Override
    public void onDisable() {
        getServer().getServicesManager().unregisterAll(this);
    }
}
```

Delete the old class:

```powershell
cd "D:\folder z mc"; git rm -q mainplugins-crates/src/main/java/elo/mainplugins/crates/Nagroda.java
```

- [ ] **Step 7: Full build**

Run: `& $mvn -f "D:\folder z mc\pom.xml" -fae clean package 2>&1 | Select-String "\.\.\. (SUCCESS|FAILURE)|BUILD|ERROR.*\.java"`
Expected: 20/20 SUCCESS. Core and crates tests pass. The other modules compile unchanged, because they only call the old `CrateService` methods.

- [ ] **Step 8: Commit + push**

```powershell
cd "D:\folder z mc"; git add mainplugins-core/src/main/java/elo/mainplugins/core/api/CrateService.java mainplugins-crates/src/main/java; git commit -m "Skrzynki: nowy silnik - dowolne skrzynki z crates.yml, klucze wlasne/wspolne, podglad LPM, wyplata przez RewardService, nagrody crate/key, /@crate"; git push origin Karol
```

---

### Task A5: Manual check on the test server (with the user)

The server must be stopped before copying jars. Copy `mainplugins-core` and `mainplugins-crates` from `D:\folder z mc\dist\`, then start it. Expected log: `Loaded 3 crates and 4 keys.` with no crate warnings.

- [ ] `/@crate list` → 3 crates, 4 keys.
- [ ] `/@crate give <nick> basic` + `/@crate key <nick> basic_key` → PPM opens, the animation runs and the prize is paid out.
- [ ] Opening `abyss` with only `basic_key` → the need-key message. With `universal_key` → it opens.
- [ ] LPM on a crate → preview with chances, clicks blocked.
- [ ] Edit `crates.yml`: a prize with `money: 500` + `custom: TEST_MIECZ` + `key: basic_key` → `/@crate reload` → win it → all three are paid out.
- [ ] A quest reward that gives a crate (old API) → still gives crate `basic`, which opens with the universal key.
- [ ] `/@rewardtest` with `- crate: basic` and `- key: nope` + `fallback: [{money: 100}]` in core `config.yml` → crate given, 100$ as fallback.

---

## PART B — app (pluginmanager repo)

### Task B1: `lib/rewards.ts` + `lib/cratesYaml.ts` (pure) + tests

**Files:**
- Create: `desktop-app/src/lib/rewards.ts`, `desktop-app/src/lib/rewards.test.ts`
- Create: `desktop-app/src/lib/cratesYaml.ts`, `desktop-app/src/lib/cratesYaml.test.ts`

**Interfaces:**
- Produces:
  - `rewards.ts`:
    - `type RewardType = "money" | "item" | "custom" | "command" | "crate" | "key" | "title"`
    - `interface Reward { type: string; value: string; amount: number; silent: boolean; fallback: Reward[] }`
    - `REWARD_TYPES: { type: RewardType; label: string }[]`
    - `parseRewards(raw: unknown): Reward[]`
    - `rewardsToYaml(list: Reward[]): Record<string, unknown>[]`
    - `emptyReward(type?: RewardType): Reward`
  - `cratesYaml.ts`:
    - `interface ItemRef { item?: string; custom?: string; amount?: number }`
    - `interface KeyDef { id: string; name: string; lore: string[]; item: ItemRef }`
    - `interface Prize { name: string; icon: ItemRef; weight: number; announce: boolean; rewards: Reward[] }`
    - `interface CrateDef { id: string; name: string; lore: string[]; item: ItemRef; keys: string[]; prizes: Prize[] }`
    - `interface CratesFile { keys: KeyDef[]; crates: CrateDef[] }`
    - `parseCratesYaml(text: string): CratesFile`
    - `serializeCratesYaml(f: CratesFile): string`
    - `chancePercent(c: CrateDef, p: Prize): number`
    - `validateCrates(f: CratesFile): string[]`
    - `addCrate(f: CratesFile, id: string): CratesFile` (new crate + its own `<id>_key`)
    - `emptyPrize(): Prize`

- [ ] **Step 1: Write the failing tests**

`rewards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRewards, rewardsToYaml } from "./rewards";

describe("rewards", () => {
  it("parses every type with amount, silent and fallback", () => {
    const list = parseRewards([
      { money: 500 },
      { item: "DIAMOND", amount: 3 },
      { custom: "MAGIC" },
      { command: "give {player} cake", silent: true },
      { key: "epic", fallback: [{ money: 1000 }] },
    ]);
    expect(list.map((r) => r.type)).toEqual(["money", "item", "custom", "command", "key"]);
    expect(list[0]).toEqual({ type: "money", value: "500", amount: 1, silent: false, fallback: [] });
    expect(list[1].amount).toBe(3);
    expect(list[3].silent).toBe(true);
    expect(list[4].fallback).toEqual([{ type: "money", value: "1000", amount: 1, silent: false, fallback: [] }]);
  });

  it("round-trips through YAML objects with money as a number", () => {
    const raw = [
      { money: 500 },
      { item: "DIAMOND", amount: 3 },
      { crate: "basic", fallback: [{ money: 10 }] },
      { command: "say hi", silent: true },
    ];
    const out = rewardsToYaml(parseRewards(raw));
    expect(out).toEqual(raw);
    expect(typeof out[0].money).toBe("number");
  });

  it("ignores junk entries", () => {
    expect(parseRewards("nope")).toEqual([]);
    expect(parseRewards([null, 5, { amount: 2 }])).toEqual([]);
  });
});
```

`cratesYaml.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addCrate, chancePercent, parseCratesYaml, serializeCratesYaml, validateCrates } from "./cratesYaml";

const YML = `keys:
  basic_key:
    name: "&eKey"
    item: { item: TRIPWIRE_HOOK }
    lore: ["&7x"]
crates:
  basic:
    name: "&6Mystery"
    item: { custom: MY_CHEST }
    keys: [basic_key]
    prizes:
      - name: "&bDiamonds"
        icon: { item: DIAMOND, amount: 4 }
        weight: 20
        rewards: [ { item: DIAMOND, amount: 4 } ]
      - name: "&6Legend"
        icon: { item: NETHER_STAR }
        weight: 5
        announce: true
        rewards: [ { money: 500 }, { key: basic_key } ]
`;

describe("cratesYaml", () => {
  it("parses keys, crates and prizes", () => {
    const f = parseCratesYaml(YML);
    expect(f.keys).toEqual([{ id: "basic_key", name: "&eKey", lore: ["&7x"], item: { item: "TRIPWIRE_HOOK" } }]);
    const c = f.crates[0];
    expect(c.id).toBe("basic");
    expect(c.item).toEqual({ custom: "MY_CHEST" });
    expect(c.prizes[0].icon).toEqual({ item: "DIAMOND", amount: 4 });
    expect(c.prizes[1].announce).toBe(true);
    expect(c.prizes[1].rewards.map((r) => r.type)).toEqual(["money", "key"]);
  });

  it("round-trips without losing data", () => {
    const f = parseCratesYaml(YML);
    expect(parseCratesYaml(serializeCratesYaml(f))).toEqual(f);
  });

  it("computes chances", () => {
    const c = parseCratesYaml(YML).crates[0];
    expect(chancePercent(c, c.prizes[0])).toBeCloseTo(80);
    expect(chancePercent(c, c.prizes[1])).toBeCloseTo(20);
  });

  it("adds a crate with its own key", () => {
    const f = addCrate(parseCratesYaml(YML), "spring");
    const c = f.crates.find((x) => x.id === "spring")!;
    expect(c.keys).toEqual(["spring_key"]);
    expect(f.keys.some((k) => k.id === "spring_key")).toBe(true);
  });

  it("warns about crates without prizes, keys or rewards", () => {
    const f = parseCratesYaml(YML);
    f.crates[0].prizes[0].rewards = [];
    f.crates.push({ id: "empty", name: "E", lore: [], item: { item: "CHEST" }, keys: [], prizes: [] });
    const w = validateCrates(f);
    expect(w.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd C:\Users\Zgredek\pluginmanager\desktop-app; npx vitest run src/lib/rewards.test.ts src/lib/cratesYaml.test.ts`
Expected: FAIL, `Failed to load url ./rewards`.

- [ ] **Step 3: Implement `rewards.ts`**

```ts
// Wspólny format nagród (fundament, RewardService w core): lista "rewards:" w każdym configu.
// Ten sam model w każdym edytorze aplikacji (Skrzynki teraz, Questy/Osiągnięcia później).

export type RewardType = "money" | "item" | "custom" | "command" | "crate" | "key" | "title";

export interface Reward {
  type: string;
  /** Kwota / materiał / id / komenda - zawsze tekst w aplikacji. */
  value: string;
  amount: number;
  silent: boolean;
  fallback: Reward[];
}

export const REWARD_TYPES: { type: RewardType; label: string }[] = [
  { type: "money", label: "Pieniądze" },
  { type: "item", label: "Zwykły item" },
  { type: "custom", label: "Custom item" },
  { type: "command", label: "Komenda" },
  { type: "crate", label: "Skrzynka" },
  { type: "key", label: "Klucz" },
  { type: "title", label: "Tytuł" },
];

const RESERVED = new Set(["amount", "silent", "fallback"]);

export function emptyReward(type: RewardType = "money"): Reward {
  return { type, value: type === "money" ? "100" : "", amount: 1, silent: false, fallback: [] };
}

export function parseRewards(raw: unknown): Reward[] {
  if (!Array.isArray(raw)) return [];
  const out: Reward[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const typeKey = Object.keys(obj).find((k) => !RESERVED.has(k));
    if (!typeKey) continue;
    out.push({
      type: typeKey.toLowerCase(),
      value: obj[typeKey] == null ? "" : String(obj[typeKey]),
      amount: typeof obj.amount === "number" && obj.amount >= 1 ? obj.amount : 1,
      silent: obj.silent === true,
      fallback: parseRewards(obj.fallback),
    });
  }
  return out;
}

export function rewardsToYaml(list: Reward[]): Record<string, unknown>[] {
  return list.map((r) => {
    const o: Record<string, unknown> = {};
    const num = Number(r.value);
    o[r.type] = r.type === "money" && Number.isFinite(num) ? num : r.value;
    if (r.amount > 1 && r.type !== "money" && r.type !== "command") o.amount = r.amount;
    if (r.silent) o.silent = true;
    if (r.fallback.length > 0) o.fallback = rewardsToYaml(r.fallback);
    return o;
  });
}
```

- [ ] **Step 4: Implement `cratesYaml.ts`**

```ts
import * as yaml from "js-yaml";
import { parseRewards, rewardsToYaml, type Reward } from "./rewards";

// plugins/MainpluginsCrates/crates.yml - skrzynki, klucze, wygrane (patrz spec pilota Skrzynek).

export interface ItemRef {
  item?: string;
  custom?: string;
  amount?: number;
}

export interface KeyDef {
  id: string;
  name: string;
  lore: string[];
  item: ItemRef;
}

export interface Prize {
  name: string;
  icon: ItemRef;
  weight: number;
  announce: boolean;
  rewards: Reward[];
}

export interface CrateDef {
  id: string;
  name: string;
  lore: string[];
  item: ItemRef;
  keys: string[];
  prizes: Prize[];
}

export interface CratesFile {
  keys: KeyDef[];
  crates: CrateDef[];
}

const HEADER =
  "# Skrzynki - zarządzane przez aplikację (komentarze nie są zachowywane). Po zmianach: /@crate reload.\n";

function itemRef(raw: unknown): ItemRef {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ref: ItemRef = {};
  if (o.custom != null) ref.custom = String(o.custom);
  else ref.item = o.item != null ? String(o.item) : "STONE";
  if (typeof o.amount === "number" && o.amount > 1) ref.amount = o.amount;
  return ref;
}

function lore(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((l) => (l == null ? "~" : String(l))) : [];
}

export function parseCratesYaml(text: string): CratesFile {
  const raw = (text.trim() ? yaml.load(text) : {}) as Record<string, any> | null;
  const keys = Object.entries((raw?.keys ?? {}) as Record<string, any>).map(([id, v]) => ({
    id,
    name: v?.name != null ? String(v.name) : id,
    lore: lore(v?.lore),
    item: itemRef(v?.item),
  }));
  const crates = Object.entries((raw?.crates ?? {}) as Record<string, any>).map(([id, v]) => ({
    id,
    name: v?.name != null ? String(v.name) : id,
    lore: lore(v?.lore),
    item: itemRef(v?.item),
    keys: Array.isArray(v?.keys) ? v.keys.map(String) : [],
    prizes: (Array.isArray(v?.prizes) ? v.prizes : []).map((p: any) => ({
      name: p?.name != null ? String(p.name) : "Prize",
      icon: itemRef(p?.icon),
      weight: typeof p?.weight === "number" ? p.weight : 1,
      announce: p?.announce === true,
      rewards: parseRewards(p?.rewards),
    })),
  }));
  return { keys, crates };
}

function refOut(r: ItemRef): Record<string, unknown> {
  const o: Record<string, unknown> = r.custom ? { custom: r.custom } : { item: r.item ?? "STONE" };
  if (r.amount && r.amount > 1) o.amount = r.amount;
  return o;
}

export function serializeCratesYaml(f: CratesFile): string {
  const keys: Record<string, unknown> = {};
  for (const k of f.keys) keys[k.id] = { name: k.name, item: refOut(k.item), ...(k.lore.length ? { lore: k.lore } : {}) };
  const crates: Record<string, unknown> = {};
  for (const c of f.crates) {
    crates[c.id] = {
      name: c.name,
      item: refOut(c.item),
      ...(c.lore.length ? { lore: c.lore } : {}),
      keys: c.keys,
      prizes: c.prizes.map((p) => ({
        name: p.name,
        icon: refOut(p.icon),
        weight: p.weight,
        ...(p.announce ? { announce: true } : {}),
        rewards: rewardsToYaml(p.rewards),
      })),
    };
  }
  return HEADER + yaml.dump({ keys, crates }, { lineWidth: -1, noRefs: true });
}

export function chancePercent(c: CrateDef, p: Prize): number {
  const total = c.prizes.reduce((s, x) => s + Math.max(0, x.weight), 0);
  return total > 0 ? (Math.max(0, p.weight) * 100) / total : 0;
}

/** Ostrzeżenia przed wysłaniem - to, co plugin i tak by pominął. */
export function validateCrates(f: CratesFile): string[] {
  const w: string[] = [];
  const keyIds = new Set(f.keys.map((k) => k.id));
  for (const c of f.crates) {
    if (c.prizes.length === 0) w.push(`Skrzynka „${c.id}” nie ma żadnej wygranej.`);
    if (!c.keys.some((k) => keyIds.has(k))) w.push(`Skrzynki „${c.id}” nie otwiera żaden klucz.`);
    c.prizes.forEach((p, i) => {
      if (p.rewards.length === 0) w.push(`Wygrana ${i + 1} w „${c.id}” nic nie daje graczowi.`);
    });
  }
  return w;
}

export function emptyPrize(): Prize {
  return {
    name: "&fNowa wygrana",
    icon: { item: "DIAMOND" },
    weight: 10,
    announce: false,
    rewards: [{ type: "item", value: "DIAMOND", amount: 1, silent: false, fallback: [] }],
  };
}

/** Nowa skrzynka zawsze z własnym kluczem "<id>_key" (Karol: domyślnie każda ma swój klucz). */
export function addCrate(f: CratesFile, id: string): CratesFile {
  const keyId = `${id}_key`;
  const keys = f.keys.some((k) => k.id === keyId)
    ? f.keys
    : [...f.keys, { id: keyId, name: `&e&l${id} key`, lore: [], item: { item: "TRIPWIRE_HOOK" } }];
  const crate: CrateDef = {
    id,
    name: `&6&l${id}`,
    lore: ["&7Right-click with a key to open.", "&7Left-click to see the rewards."],
    item: { item: "CHEST" },
    keys: [keyId],
    prizes: [emptyPrize()],
  };
  return { keys, crates: [...f.crates, crate] };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run`
Expected: all pass (16 old + 3 + 5 = 24).

- [ ] **Step 6: Commit + push**

```powershell
cd C:\Users\Zgredek\pluginmanager; git add desktop-app/src/lib/rewards.ts desktop-app/src/lib/rewards.test.ts desktop-app/src/lib/cratesYaml.ts desktop-app/src/lib/cratesYaml.test.ts; git commit -m "Aplikacja: wspolny model nagrod + czytanie/zapis crates.yml (z testami)"; git push origin Karol
```

---

### Task B2: Shared components `ItemRefPicker` + `RewardEditor`

**Files:**
- Create: `desktop-app/src/components/ItemRefPicker.tsx`
- Create: `desktop-app/src/components/RewardEditor.tsx`

**Interfaces:**
- Consumes: `ItemRef` (cratesYaml.ts), `Reward`, `REWARD_TYPES`, `emptyReward` (rewards.ts)
- Produces:
  - `<ItemRefPicker value={ItemRef} onChange={(r: ItemRef) => void} materials={string[]} customIds={string[]} showAmount?: boolean />`
  - `<RewardEditor value={Reward[]} onChange={(l: Reward[]) => void} materials={string[]} customIds={string[]} crateIds={string[]} keyIds={string[]} nested?: boolean />`

- [ ] **Step 1: Create `ItemRefPicker.tsx`**

```tsx
import type { ItemRef } from "../lib/cratesYaml";

interface Props {
  value: ItemRef;
  onChange: (r: ItemRef) => void;
  materials: string[];
  customIds: string[];
  showAmount?: boolean;
}

/** Wybór przedmiotu: zwykły item Minecrafta albo custom item z katalogu (items/). */
export default function ItemRefPicker({ value, onChange, materials, customIds, showAmount }: Props) {
  const custom = value.custom != null;
  const listId = custom ? "irp-custom" : "irp-materials";
  return (
    <div className="row">
      <select
        value={custom ? "custom" : "item"}
        onChange={(e) =>
          onChange(e.target.value === "custom" ? { custom: customIds[0] ?? "", amount: value.amount } : { item: "STONE", amount: value.amount })
        }
      >
        <option value="item">Zwykły item</option>
        <option value="custom">Custom item</option>
      </select>
      <input
        list={listId}
        value={custom ? value.custom : value.item ?? ""}
        onChange={(e) => onChange(custom ? { ...value, custom: e.target.value } : { ...value, item: e.target.value.toUpperCase() })}
        style={{ flex: 1 }}
      />
      <datalist id={listId}>
        {(custom ? customIds : materials).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {showAmount && (
        <input
          type="number"
          min={1}
          max={64}
          title="Ilość"
          value={value.amount ?? 1}
          onChange={(e) => onChange({ ...value, amount: Math.max(1, Number(e.target.value)) })}
          style={{ width: "4.5rem" }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `RewardEditor.tsx`**

```tsx
import { emptyReward, REWARD_TYPES, type Reward, type RewardType } from "../lib/rewards";

interface Props {
  value: Reward[];
  onChange: (list: Reward[]) => void;
  materials: string[];
  customIds: string[];
  crateIds: string[];
  keyIds: string[];
  /** Wewnątrz nagrody zastępczej - bez kolejnego poziomu fallbacku. */
  nested?: boolean;
}

const WITH_AMOUNT = new Set(["item", "custom", "crate", "key"]);

/** Wspólny edytor listy nagród (format "rewards:" z core) - ten sam w każdym edytorze aplikacji. */
export default function RewardEditor({ value, onChange, materials, customIds, crateIds, keyIds, nested }: Props) {
  function set(i: number, patch: Partial<Reward>) {
    onChange(value.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }

  function options(type: string): string[] {
    if (type === "item") return materials;
    if (type === "custom") return customIds;
    if (type === "crate") return crateIds;
    if (type === "key") return keyIds;
    return [];
  }

  function placeholder(type: string): string {
    if (type === "money") return "kwota, np. 500";
    if (type === "command") return "np. give {player} cake";
    if (type === "title") return "id tytułu";
    return "wybierz z listy";
  }

  return (
    <div>
      {value.length === 0 && <p className="muted small">Brak nagród — dodaj co najmniej jedną.</p>}
      {value.map((r, i) => (
        <div key={i} className="card" style={{ padding: "0.6rem", marginBottom: "0.5rem" }}>
          <div className="row">
            <select value={r.type} onChange={(e) => set(i, { ...emptyReward(e.target.value as RewardType), fallback: r.fallback })}>
              {REWARD_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
              {!REWARD_TYPES.some((t) => t.type === r.type) && <option value={r.type}>{r.type}</option>}
            </select>
            <input
              list={`rw-${nested ? "n" : "t"}-${i}`}
              value={r.value}
              placeholder={placeholder(r.type)}
              onChange={(e) => set(i, { value: r.type === "item" ? e.target.value.toUpperCase() : e.target.value })}
              style={{ flex: 1 }}
            />
            <datalist id={`rw-${nested ? "n" : "t"}-${i}`}>
              {options(r.type).map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            {WITH_AMOUNT.has(r.type) && (
              <input
                type="number"
                min={1}
                title="Ilość"
                value={r.amount}
                onChange={(e) => set(i, { amount: Math.max(1, Number(e.target.value)) })}
                style={{ width: "4.5rem" }}
              />
            )}
            <button type="button" onClick={() => onChange(value.filter((_, ri) => ri !== i))}>
              Usuń
            </button>
          </div>
          <div className="row">
            <label className="checkbox">
              <input type="checkbox" checked={r.silent} onChange={(e) => set(i, { silent: e.target.checked })} />
              Bez wiadomości na czacie
            </label>
            {!nested && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={r.fallback.length > 0}
                  onChange={(e) => set(i, { fallback: e.target.checked ? [emptyReward("money")] : [] })}
                />
                Nagroda zastępcza (gdy tej nie da się dać)
              </label>
            )}
          </div>
          {!nested && r.fallback.length > 0 && (
            <div style={{ marginLeft: "1.2rem" }}>
              <div className="ci-section-title">Zamiast tego</div>
              <RewardEditor
                value={r.fallback}
                onChange={(fb) => set(i, { fallback: fb })}
                materials={materials}
                customIds={customIds}
                crateIds={crateIds}
                keyIds={keyIds}
                nested
              />
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, emptyReward("money")])}>
        + Dodaj nagrodę
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit + push**

```powershell
cd C:\Users\Zgredek\pluginmanager; git add desktop-app/src/components/ItemRefPicker.tsx desktop-app/src/components/RewardEditor.tsx; git commit -m "Aplikacja: wspolny edytor nagrod i wybierak itemu (zwykly / custom)"; git push origin Karol
```

---

### Task B3: New `CrateEditorPage`

**Files:**
- Rewrite: `desktop-app/src/pages/CrateEditorPage.tsx`
- Modify: `desktop-app/src/pages/ToolsHubPage.tsx` (crates card description)

**Interfaces:**
- Consumes: everything from B1/B2; `loadItemCatalog` (itemCatalogRemote); `sftpReadFile`, `sftpWriteFile`, `rconSendCommand`; `useProfiles`; `useDirtyTracking`; `useIconPack`; `MaterialIcon`; `MinecraftTextPreview`; `MinecraftTextInput`; CSS `ci-*`.

- [ ] **Step 1: Rewrite `CrateEditorPage.tsx`**

```tsx
import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ItemRefPicker from "../components/ItemRefPicker";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import MinecraftTextPreview from "../components/MinecraftTextPreview";
import RewardEditor from "../components/RewardEditor";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import {
  addCrate,
  chancePercent,
  emptyPrize,
  parseCratesYaml,
  serializeCratesYaml,
  validateCrates,
  type CrateDef,
  type CratesFile,
  type ItemRef,
  type KeyDef,
} from "../lib/cratesYaml";
import { loadItemCatalog } from "../lib/itemCatalogRemote";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

const EMPTY: CratesFile = { keys: [], crates: [] };
type View = { kind: "crate"; id: string; prize: number | "settings" } | { kind: "keys"; key: string | null };

function cratesPath(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsCrates/crates.yml`;
}

function LoreEditor({ value, onChange }: { value: string[]; onChange: (l: string[]) => void }) {
  return (
    <div>
      {value.map((line, i) => (
        <div key={i} className="mc-message-row">
          <MinecraftTextInput value={line} onChange={(v) => onChange(value.map((l, li) => (li === i ? v : l)))} placeholder="&7Linijka opisu" />
          <button type="button" onClick={() => onChange(value.filter((_, li) => li !== i))}>
            Usuń
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, ""])}>
        + Dodaj linijkę
      </button>
    </div>
  );
}

export default function CrateEditorPage() {
  const { profiles, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [file, setFile] = useState<CratesFile>(EMPTY);
  const [serverFile, setServerFile] = useState<CratesFile>(EMPTY);
  const [view, setView] = useState<View | null>(null);
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);
  const { iconPackDir, allMaterials } = useIconPack(setStatus);

  const dirty = useMemo(() => serializeCratesYaml(file) !== serializeCratesYaml(serverFile), [file, serverFile]);
  useDirtyTracking(dirty);
  const crateIds = file.crates.map((c) => c.id);
  const keyIds = file.keys.map((k) => k.id);
  const crate = view?.kind === "crate" ? file.crates.find((c) => c.id === view.id) ?? null : null;

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setPluginsPath(p.remote_plugins_path);
    load(id, p.remote_plugins_path);
  }

  async function load(pid = profileId, path = pluginsPath) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const parsed = parseCratesYaml(await sftpReadFile(pid, cratesPath(path)));
      setFile(parsed);
      setServerFile(parsed);
      setView(parsed.crates[0] ? { kind: "crate", id: parsed.crates[0].id, prize: "settings" } : null);
    } catch (e) {
      setStatus(`Nie udało się wczytać crates.yml (${String(e)}). Czy na serwerze jest nowa wersja pluginu Skrzynek?`);
    } finally {
      setBusy(false);
    }
    loadItemCatalog(pid, path)
      .then((c) => setCustomIds(c.items.map((it) => it.id)))
      .catch(() => setCustomIds([]));
  }

  useEffect(() => {
    if (autoLoadedRef.current || !profileId || !profiles.some((p) => p.id === profileId)) return;
    autoLoadedRef.current = true;
    selectProfile(profileId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, profileId]);

  function updateCrate(id: string, patch: Partial<CrateDef>) {
    setFile({ ...file, crates: file.crates.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function updateKey(id: string, patch: Partial<KeyDef>) {
    setFile({ ...file, keys: file.keys.map((k) => (k.id === id ? { ...k, ...patch } : k)) });
  }

  function newCrate() {
    const id = window.prompt("ID nowej skrzynki (małe litery, bez spacji, np. spring):")?.trim().toLowerCase();
    if (!id) return;
    if (!/^[a-z0-9_-]+$/.test(id) || file.crates.some((c) => c.id === id)) {
      setStatus("Niepoprawne albo zajęte ID skrzynki.");
      return;
    }
    setFile(addCrate(file, id));
    setView({ kind: "crate", id, prize: "settings" });
  }

  function newKey() {
    const id = window.prompt("ID nowego klucza (np. vip_key):")?.trim().toLowerCase();
    if (!id) return;
    if (!/^[a-z0-9_-]+$/.test(id) || file.keys.some((k) => k.id === id)) {
      setStatus("Niepoprawne albo zajęte ID klucza.");
      return;
    }
    setFile({ ...file, keys: [...file.keys, { id, name: `&e&l${id}`, lore: [], item: { item: "TRIPWIRE_HOOK" } }] });
    setView({ kind: "keys", key: id });
  }

  async function publish() {
    if (!profileId || !pluginsPath) return;
    const warnings = validateCrates(file);
    if (warnings.length && !window.confirm(`Uwaga:\n- ${warnings.join("\n- ")}\n\nPlugin pominie te elementy. Wysłać mimo to?`)) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, cratesPath(pluginsPath), serializeCratesYaml(file));
      setServerFile(file);
      let msg = "Wysłano na serwer.";
      try {
        const r = await rconSendCommand(profileId, "@crate reload");
        msg += ` Przeładowano (RCON: ${r || "OK"}).`;
      } catch (e) {
        msg += ` ${String(e)}`;
      }
      setStatus(msg);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  const iconOf = (r: ItemRef) => (r.item ? <MaterialIcon material={r.item} iconPackDir={iconPackDir} /> : <span className="ci-badge">custom</span>);

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Skrzynki</h1>
      <p className="muted">
        Twoje skrzynki: wygląd, klucze, które je otwierają, i co można wygrać. Wygrana może dać kilka rzeczy naraz —
        pieniądze, itemy, inne skrzynki albo klucze.
      </p>

      <div className="row">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setFile(serverFile)} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
      </div>
      {status && <p className="status">{status}</p>}

      <div className="ci-layout">
        <aside className="card ci-cats">
          <div className="ci-section-title">Skrzynki</div>
          {file.crates.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`ci-cat${view?.kind === "crate" && view.id === c.id ? " active" : ""}`}
              onClick={() => setView({ kind: "crate", id: c.id, prize: "settings" })}
            >
              <span className="ci-item-name">
                <MinecraftTextPreview text={c.name} emptyLabel={c.id} />
              </span>
              <span className="ci-count">{c.prizes.length}</span>
            </button>
          ))}
          <button type="button" onClick={newCrate} disabled={!profileId}>
            + Nowa skrzynka
          </button>
          <div className="ci-section-title" style={{ marginTop: "1rem" }}>Klucze</div>
          <button
            type="button"
            className={`ci-cat${view?.kind === "keys" ? " active" : ""}`}
            onClick={() => setView({ kind: "keys", key: file.keys[0]?.id ?? null })}
          >
            <span>Wszystkie klucze</span>
            <span className="ci-count">{file.keys.length}</span>
          </button>
        </aside>

        <section className="card ci-list">
          {view?.kind === "crate" && crate && (
            <>
              <button
                type="button"
                className={`ci-item${view.prize === "settings" ? " active" : ""}`}
                onClick={() => setView({ ...view, prize: "settings" })}
              >
                {iconOf(crate.item)}
                <span className="ci-item-text">
                  <strong>Ustawienia skrzynki</strong>
                  <span className="muted small">nazwa, wygląd, klucze</span>
                </span>
              </button>
              <div className="ci-group">Wygrane ({crate.prizes.length})</div>
              {crate.prizes.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={`ci-item${view.prize === i ? " active" : ""}`}
                  onClick={() => setView({ ...view, prize: i })}
                >
                  {iconOf(p.icon)}
                  <span className="ci-item-text">
                    <span className="ci-item-name">
                      <MinecraftTextPreview text={p.name} />
                    </span>
                    <span className="ci-badges">
                      <span className="ci-badge">{chancePercent(crate, p).toFixed(1)}%</span>
                      {p.announce && <span className="ci-badge">ogłoszenie</span>}
                      {p.rewards.length === 0 && <span className="ci-badge warn">brak nagród</span>}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  updateCrate(crate.id, { prizes: [...crate.prizes, emptyPrize()] });
                  setView({ ...view, prize: crate.prizes.length });
                }}
              >
                + Dodaj wygraną
              </button>
            </>
          )}
          {view?.kind === "keys" && (
            <>
              {file.keys.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={`ci-item${view.key === k.id ? " active" : ""}`}
                  onClick={() => setView({ kind: "keys", key: k.id })}
                >
                  {iconOf(k.item)}
                  <span className="ci-item-text">
                    <span className="ci-item-name">
                      <MinecraftTextPreview text={k.name} emptyLabel={k.id} />
                    </span>
                    <span className="muted small">
                      otwiera: {file.crates.filter((c) => c.keys.includes(k.id)).map((c) => c.id).join(", ") || "nic"}
                    </span>
                  </span>
                </button>
              ))}
              <button type="button" onClick={newKey} disabled={!profileId}>
                + Nowy klucz
              </button>
            </>
          )}
          {!view && <p className="muted">Wybierz serwer, żeby wczytać skrzynki.</p>}
        </section>

        <section className="card form ci-editor">
          {view?.kind === "crate" && crate && view.prize === "settings" && (
            <>
              <h2>Skrzynka: {crate.id}</h2>
              <label>
                Nazwa
                <MinecraftTextInput value={crate.name} onChange={(v) => updateCrate(crate.id, { name: v })} placeholder="&6&lNazwa skrzynki" />
              </label>
              <div className="ci-section-title">Wygląd (przedmiot)</div>
              <ItemRefPicker value={crate.item} onChange={(r) => updateCrate(crate.id, { item: r })} materials={allMaterials} customIds={customIds} />
              <div className="ci-section">
                <div className="ci-section-title">Opis</div>
                <LoreEditor value={crate.lore} onChange={(l) => updateCrate(crate.id, { lore: l })} />
              </div>
              <div className="ci-section">
                <div className="ci-section-title">Otwierają ją klucze</div>
                {file.keys.map((k) => (
                  <label key={k.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={crate.keys.includes(k.id)}
                      onChange={(e) =>
                        updateCrate(crate.id, { keys: e.target.checked ? [...crate.keys, k.id] : crate.keys.filter((x) => x !== k.id) })
                      }
                    />
                    <MinecraftTextPreview text={k.name} emptyLabel={k.id} /> <span className="muted small">({k.id})</span>
                  </label>
                ))}
              </div>
              <div className="row ci-section">
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Usunąć skrzynkę ${crate.id}? (Na serwerze zniknie po „Wyślij na serwer”.)`)) return;
                    setFile({ ...file, crates: file.crates.filter((c) => c.id !== crate.id) });
                    setView(null);
                  }}
                >
                  Usuń skrzynkę
                </button>
              </div>
            </>
          )}

          {view?.kind === "crate" && crate && typeof view.prize === "number" && crate.prizes[view.prize] && (() => {
            const i = view.prize as number;
            const p = crate.prizes[i];
            const setPrize = (patch: Partial<typeof p>) =>
              updateCrate(crate.id, { prizes: crate.prizes.map((x, xi) => (xi === i ? { ...x, ...patch } : x)) });
            return (
              <>
                <h2>Wygrana {i + 1}</h2>
                <div className="ci-tooltip">
                  <MinecraftTextPreview text={p.name} />
                  <div className="ci-tip-gray">Szansa: {chancePercent(crate, p).toFixed(1)}%</div>
                </div>
                <label>
                  Nazwa (w animacji i podglądzie)
                  <MinecraftTextInput value={p.name} onChange={(v) => setPrize({ name: v })} placeholder="&bNazwa wygranej" />
                </label>
                <div className="ci-section-title">Ikona</div>
                <ItemRefPicker value={p.icon} onChange={(r) => setPrize({ icon: r })} materials={allMaterials} customIds={customIds} showAmount />
                <label>
                  Waga (im więcej, tym częściej)
                  <input type="number" min={1} value={p.weight} onChange={(e) => setPrize({ weight: Math.max(1, Number(e.target.value)) })} />
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={p.announce} onChange={(e) => setPrize({ announce: e.target.checked })} />
                  Ogłoś na czacie, gdy ktoś to wylosuje
                </label>
                <div className="ci-section">
                  <div className="ci-section-title">Co gracz dostaje</div>
                  <RewardEditor
                    value={p.rewards}
                    onChange={(l) => setPrize({ rewards: l })}
                    materials={allMaterials}
                    customIds={customIds}
                    crateIds={crateIds}
                    keyIds={keyIds}
                  />
                </div>
                <div className="row ci-section">
                  <button
                    type="button"
                    onClick={() => {
                      updateCrate(crate.id, { prizes: crate.prizes.filter((_, xi) => xi !== i) });
                      setView({ kind: "crate", id: crate.id, prize: "settings" });
                    }}
                  >
                    Usuń wygraną
                  </button>
                </div>
              </>
            );
          })()}

          {view?.kind === "keys" && view.key && file.keys.find((k) => k.id === view.key) && (() => {
            const k = file.keys.find((x) => x.id === view.key)!;
            const used = file.crates.filter((c) => c.keys.includes(k.id));
            return (
              <>
                <h2>Klucz: {k.id}</h2>
                <label>
                  Nazwa
                  <MinecraftTextInput value={k.name} onChange={(v) => updateKey(k.id, { name: v })} placeholder="&e&lNazwa klucza" />
                </label>
                <div className="ci-section-title">Wygląd (przedmiot)</div>
                <ItemRefPicker value={k.item} onChange={(r) => updateKey(k.id, { item: r })} materials={allMaterials} customIds={customIds} />
                <div className="ci-section">
                  <div className="ci-section-title">Opis</div>
                  <LoreEditor value={k.lore} onChange={(l) => updateKey(k.id, { lore: l })} />
                </div>
                <p className="muted small">Otwiera: {used.map((c) => c.id).join(", ") || "żadnej skrzynki (ustaw w ustawieniach skrzynki)"}</p>
                <div className="row ci-section">
                  <button
                    type="button"
                    disabled={used.length > 0}
                    title={used.length > 0 ? "Najpierw odepnij ten klucz od skrzynek" : undefined}
                    onClick={() => {
                      setFile({ ...file, keys: file.keys.filter((x) => x.id !== k.id) });
                      setView({ kind: "keys", key: null });
                    }}
                  >
                    Usuń klucz
                  </button>
                </div>
              </>
            );
          })()}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the crates card in `ToolsHubPage.tsx`**

Replace the crates description with:
`"Twoje skrzynki: wygląd, klucze (własne albo wspólne) i wygrane — pieniądze, itemy, klucze i więcej."`

- [ ] **Step 3: Type-check and run tests**

Run: `npx tsc --noEmit; npx vitest run`
Expected: exit 0, 24 tests pass.

- [ ] **Step 4: Commit + push**

```powershell
cd C:\Users\Zgredek\pluginmanager; git add desktop-app/src/pages/CrateEditorPage.tsx desktop-app/src/pages/ToolsHubPage.tsx; git commit -m "Aplikacja: nowy edytor Skrzynek - skrzynki, klucze, wygrane ze wspolnym edytorem nagrod"; git push origin Karol
```

---

### Task B4: Fresh jars in the app + end-to-end check

- [ ] **Step 1:** Clean build Pluginy (`Karol`) and copy the 20 jars from `dist\` (without `storage`) to `desktop-app\src-tauri\plugin-jars\`. Run `cargo test --lib` in `src-tauri`. Expected: 8 pass. Commit with `"Aplikacja: wbudowane pluginy z nowymi Skrzynkami"` and push.
- [ ] **Step 2 (with the user):** stop the MC server and copy the core + crates jars. Start it. In the app, open Skrzynki and select the test server. The 3 default crates should appear with the 4 keys and the chances. Add a prize with money + custom item + key, press „Wyślij na serwer”, then `@crate reload` in the console. In game, win it and get all three. Create a new crate „spring”, send it, reload, then `/@crate give <nick> spring` + `/@crate key <nick> spring_key` and open it.
