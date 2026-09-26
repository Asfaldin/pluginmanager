# Shop and Market on the Foundation - Implementation Plan

> **For agentic workers:** executed INLINE by the author in this session (user decision: no subagents, cost). Steps use checkbox (`- [ ]`) syntax for tracking. Pure logic gets full code + JUnit/vitest in the plan; Bukkit/React glue is specified by behaviour, file and signature and written directly during execution (writing it twice would double the cost the user asked to avoid).

**Goal:** Rebuild `mainplugins-market` and `mainplugins-shop` on the foundation (everything in yml, lang EN/PL, catalog items, no plugin depends on another), add market expiry/mailbox/tax, and replace the app's old "Kreator sklepu" with new Shop and Market pages in the Crates/Quests style.

**Architecture:** Each plugin = pure model + parser + rules (JUnit, no server) and a thin Bukkit layer (holder, menus, manager, admin command). Market data in `listings.yml`, shop state in `prices.yml`/`rotation.yml`/`stats.yml`. Shop publishes placeholders through core `PlaceholderService` (new `resolve`) instead of core `CenyService`; Spawners publish spawner items through a `CustomItemProvider`. App: pure `lib/marketYaml.ts`, `lib/shopYaml.ts` (vitest, round-trip), templates in `lib/shopTemplates/`, pages `MarketPage.tsx`, `ShopEditorPage.tsx`.

**Tech Stack:** Java 25, Paper API 26.2, JUnit 5, Maven; React 19 + TypeScript, js-yaml, vitest, Tauri (Rust).

**Spec:** `C:\Users\Zgredek\pluginmanager\docs\superpowers\specs\2026-09-15-sklep-targ-design.md`

## Global Constraints

- Pluginy repo: `D:\folder z mc`, branch `Karol`. App repo: `C:\Users\Zgredek\pluginmanager`, branch `Karol`. Backups already exist: `kopia-sklep-targ` (Pluginy), `kopia-kreator-sklepu` (app).
- Commit after each task, short named Polish message (e.g. `Targ: parser market.yml`), ending with the attribution lines given in the session's instructions. **Do not push** until the user agrees. Never commit `NOTATKI.md`, `docs/configi-zewnetrzne/*`, the screenshot.
- Maven: `$mvn = "D:\intelia\IntelliJ IDEA 2026.2.0.1\plugins\maven-plugin\lib\maven3\bin\mvn.cmd"`, always `clean package`, PowerShell, module WITH core: `-pl mainplugins-core,<module>`.
- App: `npx vitest run`, `npx tsc --noEmit` in `desktop-app`; Rust `cargo test --lib` in `desktop-app\src-tauri` (`~/.cargo/bin` on PATH).
- Every plugin works with only core installed. Shop/Market never call Ranks, Spawners, Fishing, Quests.
- Every player/admin text in `lang/en.yml` + `lang/pl.yml` (same keys, test enforces). Log lines English, code comments short Polish.
- Bad config never throws: skip the entry with a warning naming the file and path.
- Money shown with `MoneyFormat.kompaktowo` (no `.00`, no `$`).
- Menus recognised by own `InventoryHolder`, clicks mapped by id (offer id / item index), never by title or material.
- Never the long dash (U+2014) or en dash anywhere - plain `-`.
- Never write `${` in resources except `version: ${project.version}` in `plugin.yml`.
- Test server `C:\Users\Zgredek\Desktop\Serwer` must be stopped before copying jars.

---

## File Structure

**Pluginy (`D:\folder z mc`)**

| File | Status | Responsibility |
|---|---|---|
| `mainplugins-core/.../api/MarketService.java`, `CoreAPI.getMarketService()` | delete | unused |
| `mainplugins-core/.../api/CenyService.java` | delete | replaced by placeholders |
| `mainplugins-core/.../api/PlaceholderService.java` + impl | modify | add `resolve(OfflinePlayer, String)` |
| `mainplugins-market/.../model/MarketSettings.java` | create | market.yml values |
| `mainplugins-market/.../model/Listing.java`, `MailItem.java` | create | data records |
| `mainplugins-market/.../MarketSettingsParser.java` | create | pure: yml -> settings |
| `mainplugins-market/.../MarketRules.java` | create | pure: tax, expiry, limit from permissions, slot conflicts |
| `mainplugins-market/.../ListingStore.java` | create | listings.yml + mailbox + earnings + rynek.yml migration |
| `mainplugins-market/.../MarketGuiHolder.java` | create | marks menus (MAIN, SEARCH, MAILBOX) |
| `mainplugins-market/.../MarketManager.java` | rewrite | menus, sell/buy/retract, expiry task, join summary |
| `mainplugins-market/.../MarketCommand.java` | create | `/market`, `/market sell`, `/@market` |
| `mainplugins-market/.../MainpluginsMarket.java` | rewrite | wiring |
| `mainplugins-market/src/main/resources/{market.yml,plugin.yml,lang/en.yml,lang/pl.yml}` | create/modify | |
| `mainplugins-market/pom.xml` | modify | junit |
| `mainplugins-shop/.../model/{ShopItem,Category,Rotation,ShopSettings,DynamicSettings,MenuLayout}.java` | create | shop model |
| `mainplugins-shop/.../ShopConfigParser.java` | create | pure: shop.yml + categories -> ShopConfig |
| `mainplugins-shop/.../ShopRules.java` | create | pure: lot prices, sell offer lookup, max buy |
| `mainplugins-shop/.../RotationRules.java` | create | pure: pick N with cooldown |
| `mainplugins-shop/.../DynamicPriceManager.java` | modify | settings from yml, `prices.yml`, keys by item key, no CenyService |
| `mainplugins-shop/.../RotationManager.java` | create (replaces `RotacjaManager`) | per-category rotation state `rotation.yml` |
| `mainplugins-shop/.../ShopStats.java` | rename+modify (`StatystykiSklepu`) | `stats.yml`/`stats.csv`, enabled switch |
| `mainplugins-shop/.../ShopItems.java` | create | ItemStack from ShopItem, stack -> item key |
| `mainplugins-shop/.../ShopGuiHolder.java` | create | marks menus |
| `mainplugins-shop/.../ShopManager.java` | rewrite | menus, buy, sell, search |
| `mainplugins-shop/.../ShopCommand.java` | create (replaces `SklepAdminCommand`, `StatSklepCommand`) | `/@shop` |
| `mainplugins-shop/.../ShopPlaceholders.java` | create | `reset_cen_dni`, `event_info`, `shop_trend` |
| `mainplugins-shop/.../MainpluginsShop.java` | rewrite | wiring, first-start content, old files to `old/` |
| `mainplugins-shop/.../ShopGuiLoader.java`, `gui/*` | delete | folded into parser/model |
| `mainplugins-shop/src/main/resources/defaults/{en,pl}/shop.yml`, `defaults/{en,pl}/categories/*.yml`, `lang/*`, `plugin.yml` | create/modify | small content |
| old resources `sklep.yml`, `sklep-gui.yml`, `pula-rotacyjna.yml`, `categories/*.yml` | move to app template source, delete from plugin | |
| `mainplugins-hud/.../MainpluginsPlaceholders.java` | modify | no CenyService; asks `PlaceholderService.resolve` |
| `mainplugins-spawners/.../SpawnerManager.java` (+ provider class) | modify | provider `spawner_<type>`, accepts old tags |

**App (`C:\Users\Zgredek\pluginmanager\desktop-app`)**

| File | Status | Responsibility |
|---|---|---|
| `src/lib/marketYaml.ts` + `.test.ts` | create | market.yml model, round-trip |
| `src/pages/MarketPage.tsx` | create | Market editor |
| `src/lib/shopYaml.ts` + `.test.ts` | create | shop.yml + categories model, round-trip, per-piece helpers |
| `src/lib/shopTemplates.ts`, `src/lib/shopTemplates/{small-en,small-pl,big-pl}.json` | create | templates (bundled JSON: shop.yml + categories) |
| `scripts/convert-big-shop.mjs` | create | old shop -> big-pl.json |
| `src/pages/ShopEditorPage.tsx` | create | Shop editor (tabs: Kategorie, Ustawienia, Statystyki) |
| `src/lib/shopStats.ts` | modify | new paths/keys |
| `src/pages/ItemBuilderPage.tsx`, `src/lib/shopGuiYaml.ts` | delete | replaced |
| `src/App.tsx`, `src/components/Layout.tsx` | modify | routes + nav (Sklep, Targ) |
| `src/pages/IslandsPage.tsx` | modify | note text about spawner prices |
| `src-tauri/plugin-jars/*.jar` | update | core, hud, market, shop, spawners |

---

# PART M - MARKET

### Task M1: Core cleanup + PlaceholderService.resolve

**Files:** delete `mainplugins-core/src/main/java/elo/mainplugins/core/api/MarketService.java`; modify `CoreAPI.java` (remove `getMarketService`), `api/PlaceholderService.java`, its implementation in core (find with `Grep "implements PlaceholderService"`), `mainplugins-market/.../MarketManager.java` (drop `implements MarketService` so the build stays green).

**Interfaces - Produces:**
```java
/** Wartość naszego placeholdera bez PlaceholderAPI (nazwa bez "mainplugins_"), null gdy nikt nie zna. */
String resolve(OfflinePlayer player, String name);
```
Implementation: iterate registered resolvers in registration order, return first non-null.

- [ ] Step 1: add `resolve` to interface + impl (reuse the loop the PAPI expansion already uses).
- [ ] Step 2: delete MarketService, `getMarketService`, `implements MarketService` in MarketManager.
- [ ] Step 3: `& $mvn -q clean package -pl mainplugins-core,mainplugins-market` - expect exit 0.
- [ ] Step 4: commit `Core: bez MarketService, PlaceholderService.resolve`.

### Task M2: Market model, parser, rules (pure, TDD)

**Files:** create `mainplugins-market/src/main/java/elo/mainplugins/market/model/{MarketSettings,Listing,MailItem,ButtonDef}.java`, `MarketSettingsParser.java`, `MarketRules.java`; test `src/test/java/elo/mainplugins/market/{MarketSettingsParserTest,MarketRulesTest}.java`; `pom.xml` (junit-jupiter 5.11.4 test + surefire 3.5.2, copy from quests pom).

**Interfaces - Produces:**
```java
public record ButtonDef(int slot, String material) {}
public record MarketSettings(int defaultLimit, long minPrice, long maxPrice, int expireDays,
                             boolean mailbox, int taxPercent, String title, String background,
                             Map<String, ButtonDef> buttons) {
    public static final List<Integer> OFFER_SLOTS = List.of(10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34);
    public static final List<String> BUTTON_IDS = List.of("prev","next","mine","search","close","sort","mailbox");
    public static MarketSettings defaults();   // values from spec market.yml
}
public record Listing(String id, UUID seller, String sellerName, long price, long listedAt, byte[] item) {}
public record MailItem(long addedAt, byte[] item) {}
public final class MarketSettingsParser {
    public static MarketSettings parse(ConfigurationSection root, Predicate<String> materialExists, Consumer<String> warn);
}
public final class MarketRules {
    public static long payout(long price, int taxPercent);                 // floor(price*(100-tax)/100), tax clamped 0..100
    public static boolean expired(long listedAt, long now, int expireDays); // false when expireDays <= 0
    public static int limitFor(int defaultLimit, Collection<String> permissions); // max of default and mainplugins.market.limit.<n>
}
```
Parser rules: `min-price` >= 1 (else 1 + warn), `max-price` >= min (else defaults + warn), `tax-percent` clamped 0..100 (warn when clamped), `expire-days` < 0 -> 0 + warn, unknown material -> default + warn, button slot outside 0..53 or on an OFFER_SLOT or duplicate -> button dropped + warn, missing section -> defaults silently.

- [ ] Step 1: write `MarketRulesTest`:
```java
@Test void payoutTakesTaxAndRoundsDown() {
    assertEquals(100, MarketRules.payout(100, 0));
    assertEquals(95, MarketRules.payout(100, 5));
    assertEquals(9, MarketRules.payout(10, 5));      // 9.5 -> 9
    assertEquals(0, MarketRules.payout(100, 100));
    assertEquals(100, MarketRules.payout(100, -3));  // clamp
}
@Test void expiryUsesDaysAndZeroMeansNever() {
    long day = 86_400_000L;
    assertFalse(MarketRules.expired(0, 7 * day - 1, 7));
    assertTrue(MarketRules.expired(0, 7 * day, 7));
    assertFalse(MarketRules.expired(0, 999 * day, 0));
}
@Test void limitTakesHighestPermission() {
    assertEquals(10, MarketRules.limitFor(10, List.of()));
    assertEquals(15, MarketRules.limitFor(10, List.of("mainplugins.market.limit.15", "mainplugins.market.limit.12")));
    assertEquals(10, MarketRules.limitFor(10, List.of("mainplugins.market.limit.5", "mainplugins.market.limit.x")));
}
```
- [ ] Step 2: write `MarketSettingsParserTest` (build input with `new YamlConfiguration()` + `loadFromString`):
  - empty yml -> `MarketSettings.defaults()` and no warnings;
  - full valid yml from the spec -> every field read;
  - `tax-percent: 150` -> 100 + one warning containing `tax-percent`;
  - `max-price: 0` with `min-price: 5` -> defaults for both + warning;
  - button on slot 10 (offer slot) -> button absent + warning containing `buttons.mine`;
  - two buttons on slot 45 -> second dropped + warning.
- [ ] Step 3: run `& $mvn -q clean package -pl mainplugins-core,mainplugins-market` - expect FAIL (classes missing).
- [ ] Step 4: implement records, parser, rules (small, straightforward code as specified).
- [ ] Step 5: run again - expect PASS.
- [ ] Step 6: commit `Targ: model, parser market.yml i zasady (podatek, wygasanie, limit)`.

### Task M3: ListingStore (listings.yml, mailbox, earnings, migration)

**Files:** create `ListingStore.java`; test `ListingStoreTest.java`.

**Interfaces - Produces:**
```java
public final class ListingStore {
    public ListingStore(YamlConfiguration yml);                // in-memory; caller saves (AsyncConfigSaver)
    public List<Listing> listings();                           // insertion order
    public Listing get(String id);
    public void add(Listing l);
    public Listing remove(String id);                          // null when absent
    public int countBy(UUID seller);
    public List<MailItem> mailbox(UUID player);
    public void addMail(UUID player, MailItem item);
    public MailItem takeMail(UUID player, int index);          // null when out of range
    public void addEarning(UUID seller, long amount, int count); // offline summary
    public long[] takeEarnings(UUID seller);                   // {amount, count} or null; clears
    public List<Listing> expired(long now, int expireDays);
    public void addPendingReturn(UUID player, byte[] item);   // gdy skrzynka wyłączona - oddawane przy wejściu
    public List<byte[]> takePendingReturns(UUID player);      // czyści
    /** Stary rynek.yml: przedmioty.<id>.{item(bytes),cena,sprzedawca,nick_sprzedawcy} -> oferty z listedAt=now. Zwraca liczbę. */
    public int importLegacy(Map<String, LegacyOffer> old, long now);
    public record LegacyOffer(byte[] item, long price, String seller, String sellerName) {}
}
```
Storage layout (`listings.yml`): `listings.<id>.{seller,seller-name,price,listed-at,item}` (item = Base64 of `ItemStack#serializeAsBytes`), `mailbox.<uuid>: [{added-at, item}]`, `earnings.<uuid>.{amount,count}`, `returns.<uuid>: [base64]`. The store only handles bytes/Base64 so it is testable without a server; converting `ItemStack` <-> bytes happens in MarketManager. Legacy reading (`ItemStack` from `getItemStack`) is also done in MarketManager, which passes `LegacyOffer` with bytes.

- [ ] Step 1: test round-trip: add 2 listings + 2 mail items + earnings, `saveToString()`, load new store from that string, compare; `countBy`; `remove` returns and deletes; `takeMail` out of range -> null; `takeEarnings` twice -> second null; `expired` picks only old ones; `importLegacy` keeps price/seller, skips entries with price <= 0 or bad UUID.
- [ ] Step 2: run - FAIL. Step 3: implement. Step 4: run - PASS.
- [ ] Step 5: commit `Targ: zapis ofert, skrzynki i zarobkow (listings.yml)`.

### Task M4: Market Bukkit layer, texts, commands

**Files:** create `MarketGuiHolder.java`, `MarketCommand.java`, resources `market.yml` (spec values with short EN comments), `lang/en.yml`, `lang/pl.yml`; rewrite `MarketManager.java`, `MainpluginsMarket.java`, `plugin.yml`; test `DefaultContentTest.java` (market.yml parses with no warnings; lang files same keys).

**Behaviour (MarketManager):**
- Constructor loads `market.yml` (save default resource if missing), `listings.yml`; if `rynek.yml` exists: read `przedmioty.*` via `getItemStack`, `importLegacy`, rename file to `rynek.yml.old`, log `Imported N offers from rynek.yml`.
- `openMain(Player, page)`: holder kind MAIN with page, filter "mine", sort asc/desc, map slot->listing id. Background fill, offers in `OFFER_SLOTS`, lore lines from lang (`menu.offer-price`, `menu.offer-seller`, `menu.offer-buy` / `menu.offer-yours`). Buttons from settings; `mailbox` button only when `mailbox: true`, lore shows count. `close` becomes "back to menu" (NETHER_STAR, runs `menu`) when opened from the Menu plugin (keep existing `zMenu` flag behaviour, command `/market` has no flag; Menu plugin calls `performCommand` - keep public `openMain(player, 0, fromMenu)`).
- Search: click search -> close, chat prompt (lang), `AsyncChatEvent` -> main thread -> holder SEARCH with results (max 21), "cancel"/"anuluj" word from lang key `search.cancel-word`.
- Click offer (by holder map): own offer -> two-click retract (15 s, lore hint from lang) -> item to inventory, overflow to mailbox (or ground when mailbox off). Other's offer -> check money -> take money, give `payout` to seller (online message `sold` / offline `addEarning`), give item (overflow to mailbox/ground), remove listing, message buyer.
- Mailbox menu (holder MAILBOX): items in offer slots, click -> to inventory if it fits (else message `mailbox.full`), back button.
- `sell(Player, String priceArg)`: parse long; range min..max (message with range); empty hand; `limitFor(default, effective permissions of player)`; store listing; message; open main at the new offer's page.
- Expiry task every 60 s: `expired(now, expireDays)` -> remove, to seller mailbox (mailbox on) or `addPendingReturn` (mailbox off; online seller gets it straight into the inventory, overflow on the ground); online seller gets `expired` message.
- `PlayerJoinEvent`: `takeEarnings` -> summary message; `takePendingReturns` -> inventory, overflow on the ground.
- `reload()`: re-read market.yml.
- All texts via `LangService`, money via `MoneyFormat.kompaktowo`.

**Commands:** `plugin.yml` keeps command `targ` (core `commands.yml` maps it to `market`, alias `targ`) with `usage: /<command> [sell <price>]`; subcommand accepts `sell` and `wystaw`. Admin command `@market` (`mainplugins.market.admin`, default op): `reload | list <player> | remove <player>` with tab completion. Permissions: `mainplugins.market.admin`, `mainplugins.market.limit.<n>` documented in plugin.yml description only.

- [ ] Step 1: write DefaultContentTest (market.yml -> no warnings; `lang/en.yml` keys == `lang/pl.yml` keys).
- [ ] Step 2: write resources and code as specified.
- [ ] Step 3: `& $mvn -q clean package -pl mainplugins-core,mainplugins-market` - PASS.
- [ ] Step 4: `Grep "Component.text\(\""` in market - expect only empty/technical uses (no player texts).
- [ ] Step 5: commit `Targ: menu, kupno, wycofanie, wygasanie, skrzynka, podatek, komendy, teksty PL/EN`.

### Task M5: App - Market page

**Files:** create `desktop-app/src/lib/marketYaml.ts`, `marketYaml.test.ts`, `src/pages/MarketPage.tsx`; modify `src/App.tsx` (route `market`), `src/components/Layout.tsx` (nav "Targ" next to the shop entry), jars.

**Interfaces - Produces (`marketYaml.ts`):**
```ts
export interface MarketButton { slot: number; material: string }
export interface MarketConfig {
  defaultLimit: number; minPrice: number; maxPrice: number; expireDays: number;
  mailbox: boolean; taxPercent: number; title: string; background: string;
  buttons: Record<string, MarketButton>;
  raw: Record<string, unknown>;          // whole document, keeps unknown fields
}
export const OFFER_SLOTS: number[];
export const BUTTON_IDS: string[];
export function defaultMarket(): MarketConfig;
export function parseMarketYaml(text: string): MarketConfig;
export function serializeMarketYaml(c: MarketConfig): string;
export function buttonProblems(c: MarketConfig): string[]; // offer-slot / duplicate conflicts (Polish messages)
```
- [ ] Step 1: tests: parse spec yml; round-trip keeps an unknown top-level key and unknown key inside `menu`; empty text -> defaults; `buttonProblems` finds slot 10 and duplicates.
- [ ] Step 2: run `npx vitest run src/lib/marketYaml.test.ts` - FAIL; implement; PASS.
- [ ] Step 3: MarketPage (pattern of QuestsPage: profile picker, read `MainpluginsMarket/market.yml` via `sftpReadFile`, defaults when missing): folds "Limity i ceny" (default limit + hint about `mainplugins.market.limit.<liczba>`, min/max price), "Oferty" (expire days, 0 = never; mailbox switch; tax %), "Wygląd menu" (title with MinecraftTextInput, background MaterialIcon picker, SlotGrid 54 with offer slots shown as locked and buttons draggable - reuse `SlotGrid` drag mode like QuestsPage main menu), buttons "Zapisz" / "Wyślij na serwer" (`rconSendCommand(... "@market reload")`), "Komendy" modal (`/market`, `/market sell <cena>`, `/@market reload|list|remove`), `useDirtyTracking`.
- [ ] Step 4: `npx tsc --noEmit` + `npx vitest run` - PASS.
- [ ] Step 5: build market+core jars, copy to `src-tauri/plugin-jars`, `cargo test --lib`.
- [ ] Step 6: commit (app) `Aplikacja: strona Targu` and (Pluginy, if anything changed) none.

### Task M6: Market test on server (user)

- [ ] Stop-check server, copy core + market jars, delete nothing else. User starts server and tests: sell, buy, retract, limit, full inventory -> mailbox, expiry (set `expire-days` small via app? minimum is 1 day - for the test temporarily edit `listed-at` in listings.yml by hand, or `/@market remove`), tax, offline summary, old offers imported, app page save+send.
- [ ] Fix what the user reports, commit each fix separately.

---

# PART S - SHOP

### Task S1: Shop model + parser (pure, TDD)

**Files:** create `mainplugins-shop/src/main/java/elo/mainplugins/shop/model/{ShopItem,Rotation,Category,DynamicSettings,SlotEntry,MenuScreen,ShopSettings,ShopConfig}.java`, `ShopConfigParser.java`; tests `ShopConfigParserTest.java`; `pom.xml` junit.

**Interfaces - Produces:**
```java
public record ShopItem(String material, String customId, Double buy, Double sell, int amount, int sellAmount,
                       String name, List<String> lore, String instrument) {
    /** "DIAMOND" albo "custom:spawner_zombie" - klucz cen dynamicznych i statystyk. */
    public String key();
    public boolean buyable();   // buy != null
    public boolean sellable();  // sell != null
}
public record Rotation(boolean enabled, int show, int everyDays, List<ShopItem> pool) {}
public record Category(String id, String name, String iconMaterial, String iconCustom, List<ShopItem> items, Rotation rotation) {}
public record DynamicSettings(boolean enabled, int cycleMinutes, double minMultiplier, double maxMultiplier,
                              int resetDays, double maxSellShare) { public static DynamicSettings defaults(); }
public enum SlotRole { CATEGORY_SLOT, ITEM_SLOT, AMOUNT_SLOT, NAV_BACK, NAV_PREV, NAV_NEXT, EXIT, SEARCH, SORT, FILLER }
public record SlotEntry(int slot, SlotRole role, String material, int amount) {}
public record MenuScreen(int size, List<SlotEntry> layout) {}
public enum Rounding { WHOLE, CENTS }   // price-rounding: whole | cents (default cents; unknown -> cents + warn)
public record ShopSettings(List<String> categoryOrder, Rounding rounding, DynamicSettings dynamic, boolean statsEnabled,
                           Map<String, MenuScreen> menus, Map<String, String> colors, Map<String, String> buttonMaterials) {}
public record ShopConfig(ShopSettings settings, Map<String, Category> categories) {}
public final class ShopConfigParser {
    public static ShopSettings parseSettings(ConfigurationSection shopYml, Predicate<String> materialExists, Consumer<String> warn);
    public static Category parseCategory(String id, ConfigurationSection yml, Predicate<String> materialExists, Consumer<String> warn);
    public static ShopConfig combine(ShopSettings s, Map<String, Category> cats, Consumer<String> warn); // order check
}
```
Rules: item needs `item` (known material) or `custom`; no `buy` and no `sell` -> skipped + warn; negative price -> skipped + warn; `amount`/`sell-amount` < 1 -> 1 + warn; `buy`/`sell` accept ints and decimals (round to 2 places); rotation `show` < 1 -> 1, `every-days` < 1 -> 14 (+warn); unknown category in `categories` order -> warn + ignore; category not in order -> warn (still works for `/sell`); menu screens: `main-menu`, `category-page`, `buy-picker`, `search-results` (defaults = today's `sklep-gui.yml` layout baked into `ShopSettings` defaults), slot out of range or duplicate -> dropped + warn, AMOUNT_SLOT without `amount` -> dropped + warn.

- [ ] Step 1: tests: full category from spec; custom item; decimal price `0.16`; item without prices skipped with warning naming `categories/ores.yml items[2]`; rotation parsed with pool; settings defaults on empty yml equal `ShopSettings.defaults()` and produce no warnings; `key()` values; order warnings.
- [ ] Step 2: FAIL -> implement -> PASS (`-pl mainplugins-core,mainplugins-shop`; old classes still compile side by side for now).
- [ ] Step 3: commit `Sklep: model i parser shop.yml + kategorii`.

### Task S2: Shop rules - prices, sell offer, rotation (pure, TDD)

**Files:** create `ShopRules.java`, `RotationRules.java`; tests `ShopRulesTest.java`, `RotationRulesTest.java`.

**Interfaces - Produces:**
```java
public final class ShopRules {
    /** Cena za dowolną ilość sztuk: proporcjonalnie z ceny paczki, w górę; WHOLE = do złotówki (min 1, jak dawne policzCene), CENTS = do grosza (min 0.01). */
    public static double buyPrice(ShopItem item, int pieces, Rounding rounding);
    /** Ile pełnych paczek skupu z posiadanych sztuk i ile za nie (mnożnik cen dynamicznych), w dół według rounding. */
    public static SellResult sell(ShopItem item, int ownedPieces, double multiplier, double maxSellShare, Rounding rounding);
    public record SellResult(int lots, int pieces, double money) {}
    /** Pierwsza pozycja (po kolejności kategorii) sprzedawalna dla danego klucza; null gdy brak. */
    public static ShopItem sellOffer(ShopConfig cfg, List<ShopItem> activeRotationItems, String key);
    /** Ile sztuk da się kupić za pieniądze i miejsce (w sztukach, max 64*36). */
    public static int maxBuyPieces(ShopItem item, double money, int freeSpacePieces);
}
public final class RotationRules {
    /** Losuje show pozycji z puli, pomijając te na chłodzeniu; gdy za mało - bierze też z chłodzenia. */
    public static List<Integer> pick(int poolSize, int show, Map<Integer, Integer> cooldown, Random random);
    public static Map<Integer, Integer> nextCooldown(Map<Integer, Integer> cooldown, List<Integer> picked, int rest);
}
```
Sell money = `lots * perLot`, where `perLot` copies today's `DynamicPriceManager.policzCeneSkupu` 1:1: `round(sell * multiplier)` (WHOLE: to whole, CENTS: to grosz), capped at `floor(buyPerSellLot * maxSellShare)` (same unit) when the item is buyable (`buyPerSellLot = round(buy / amount * sellAmount)`), minimum 1 (WHOLE) / 0.01 (CENTS). Checked 2026-09-15: all 13 "mineraly" items have `sell-amount: 1`, so dropping the hardcoded single-piece category changes nothing. Cooldown `rest` = 5 rotations (constant in code, as today).

- [ ] Step 1: tests (examples, CENTS unless noted): `buy 10, amount 64` -> `buyPrice(64)=10`, `buyPrice(128)=20`, `buyPrice(1)=0.16`, `buyPrice(8)=1.25`; WHOLE: `buyPrice(1)=1`, `buyPrice(8)=2`, `buyPrice(64)=10`; `buy 0.16, amount 1` -> `buyPrice(64)=10.24`; `buy 1, amount 1000` -> `buyPrice(1)=0.01`; WHOLE sell of 3.7 -> 3; `sell 4, sellAmount 16`, owned 40, mult 1.0 -> lots 2, pieces 32, money 8; mult 1.5 -> 6 per lot (buy 80/64 -> per 16 = 20, cap 18 not hit); `sell 10, buy 12, lots 1`, mult 1.5 -> 15 capped to floor(10.8)=10 (WHOLE) / 10.8 (CENTS); `sell 1`, mult 0.5 -> 1 (WHOLE, min) / 0.5 (CENTS); real case BEETROOT `buy 1500 amount 64` WHOLE -> `buyPrice(1)=24`, `buyPrice(64)=1500`; `sellOffer` prefers first category in order and matches custom keys exactly; `maxBuyPieces` limited by money and space in whole lots; rotation pick avoids cooldown, falls back when pool too small, never duplicates; `nextCooldown` decrements and adds picked.
- [ ] Step 2: FAIL -> implement -> PASS. Step 3: commit `Sklep: liczenie cen paczek, skupu i rotacji`.

### Task S3: Default content + first start + old files

**Files:** create `src/main/resources/defaults/en/shop.yml`, `defaults/en/categories/{blocks,farming,ores,mob-drops,food}.yml`, same under `defaults/pl/` (same ids and prices, Polish names), `lang/en.yml`, `lang/pl.yml`; move old `sklep.yml`, `sklep-gui.yml`, `pula-rotacyjna.yml`, `categories/*.yml` out of the plugin into `C:\Users\Zgredek\pluginmanager\desktop-app\scripts\old-shop\` (source for the big template, Task S8); test `DefaultContentTest.java`.

Small content (prices per piece, all `amount`/`sell-amount` 1): Blocks (DIRT, COBBLESTONE, STONE, SAND, GRAVEL, OAK_LOG, GLASS, BRICKS), Farming (WHEAT_SEEDS, WHEAT, CARROT, POTATO, SUGAR_CANE, PUMPKIN, MELON_SLICE, BONE_MEAL), Ores (COAL, IRON_INGOT, GOLD_INGOT, COPPER_INGOT, REDSTONE, LAPIS_LAZULI, DIAMOND, EMERALD), Mob drops (ROTTEN_FLESH, BONE, STRING, SPIDER_EYE, GUNPOWDER, ENDER_PEARL, SLIME_BALL, LEATHER), Food (BREAD, COOKED_BEEF, COOKED_PORKCHOP, COOKED_CHICKEN, BAKED_POTATO, APPLE, GOLDEN_CARROT, COOKIE). Prices taken from the old shop per piece where the item exists there (checked while writing), sell always < buy.

First start (`MainpluginsShop`): if `shop.yml` missing -> if any of `sklep.yml`, `sklep-gui.yml`, `pula-rotacyjna.yml`, `categories/` exists, move them into `old/` (log `Moved old shop files to old/`); copy `defaults/<lang>/` (lang from `LangService.language()`, fallback `en`) to the data folder. Also move old data files `ceny-dynamiczne*.yml`/`statystyki-sklepu.*`/`rotacja*.yml` (exact names checked in the old code) into `old/`.

- [ ] Step 1: DefaultContentTest: EN and PL parse with zero warnings, same category ids, same item keys and prices; `lang` keys equal; every sell < buy.
- [ ] Step 2: write files. Step 3: PASS. Step 4: commit `Sklep: tresc startowa PL/EN (Maly) i teksty`.

### Task S4: Dynamic prices, rotation manager, stats on the new model

**Files:** modify `DynamicPriceManager.java` (constructor takes `DynamicSettings`; `MINUT_NA_CYKL`, `M_MIN`, `M_MAX`, `CYKLI_DO_RESETU`, `MAX_UDZIAL_W_CENIE_KUPNA` come from settings; `enabled=false` -> multiplier always 1.0 and no cycle task; state file `prices.yml`; keys = `ShopItem.key()`; drop `implements CenyService`; keep `najwiekszeOdchylenie()`, `dniDoResetu()`, `getZablokowaneNazwy()` as plain methods); create `RotationManager.java` (state `rotation.yml`: per category `{picked: [indexes], next-at: millis, cooldown: {index: n}}`; `active(categoryId) -> List<ShopItem>`; `force(categoryId|all)`; checks every 10 min); rename `StatystykiSklepu` -> `ShopStats` (files `stats.yml`/`stats.csv`, keys = item key, no-op when disabled); delete `RotacjaManager.java`.
Core: delete `api/CenyService.java` and any registration in core. HUD: remove CenyService; `reset_cen_dni`/`event_info` cases removed (the shop answers them), `wskazowkaRynkowa()` becomes `CoreAPI.getPlaceholderService().resolve(null, "shop_trend")` (null/empty -> pro tip as today).
Create `ShopPlaceholders.java`: registers resolver answering `reset_cen_dni` (days or `-` when dynamic off), `event_info` (lang `hud.event-info` with count, empty when none), `shop_trend` (arrow + name + percent via lang `hud.trend-up`/`hud.trend-down`, null when nothing deviates).

- [ ] Step 1: build `-pl mainplugins-core,mainplugins-shop,mainplugins-hud` - PASS; existing DynamicPriceManager math unchanged (only constants -> settings).
- [ ] Step 2: commit `Sklep: ceny dynamiczne, rotacja i statystyki z shop.yml; HUD przez placeholdery; core bez CenyService`.

### Task S5: Shop Bukkit layer - items, menus, buy, sell, admin command

**Files:** create `ShopItems.java`, `ShopGuiHolder.java`, `ShopCommand.java`; rewrite `ShopManager.java`, `MainpluginsShop.java`, `plugin.yml`; delete `ShopGuiLoader.java`, `gui/*`, `SklepAdminCommand.java`, `StatSklepCommand.java`, old model code paths.

**Behaviour:**
- `ShopItems.create(ShopItem, int pieces)`: `custom` -> `CustomItemService.create(id, n)` (null -> log once + return null, menu hides the entry); else `new ItemStack(material)`; apply `name`/`lore` (legacy `&` via lang serializer), `instrument` (existing `MusicInstrument` code). `ShopItems.keyOf(ItemStack)`: `idOf` != null -> `custom:<id>` else material name.
- Main menu: category icons into CATEGORY_SLOTs in `categoryOrder`; search button; exit/back-to-menu (existing `zMenu`).
- Category page: items + active rotation items, pages over ITEM_SLOTs, sort button (buy asc / sell desc, as today), prev/next/back/exit; lore from lang: buy price per lot, sell price per lot (with dynamic arrow/percent and EVENT tag as today), click hints.
- Clicks (holder maps slot -> category id + item index): LMB -> buy picker (AMOUNT_SLOT `amount` = pieces, price `ShopRules.buyPrice`), Shift+LMB -> buy max (`maxBuyPieces`), RMB -> sell one stack, Shift+RMB -> sell all of that item. `/sell` = hand stack, `/sellall` = all of held item type (existing behaviour, `ShopRules.sell`).
- Buy: money check, space check, `economy.odejmijKase`, give items, stats + dynamic turnover hooks unchanged in meaning.
- Search: chat prompt, results menu, click behaves like category item.
- `/@shop`: `reload | info <item> | price <item> buy|sell <amount> | reset <item> | resetall | multiplier <item> <x> | event <item> <x>|off|list | rotation [force [category]] | stats`. `<item>` = item key (tab-complete from config). `price` edits the category file on disk (YamlConfiguration of that file, list index) then reloads. `resetall` keeps today's "type /@shop confirm" safety (`confirm`/`cancel`).
- plugin.yml: commands `sklep`, `sprzedaj`, `sprzedajwszystko` (remapped by core commands.yml to shop/sell/sellall), `@shop` with `mainplugins.shop.admin`; remove `@reloadsklep`, `@statsklep`, `@sklep`.
- All texts from lang, money via MoneyFormat.

- [ ] Step 1: build `-pl mainplugins-core,mainplugins-shop` - PASS with all tests.
- [ ] Step 2: `Grep` shop sources for Polish player text in `Component.text("` - expect none.
- [ ] Step 3: commit `Sklep: menu, kupno, sprzedaz, wyszukiwarka i /@shop na nowym formacie`.

### Task S6: Spawners - provider for the catalog

**Files:** modify `mainplugins-spawners/.../SpawnerManager.java` (+ new small `SpawnerItemProvider.java`), `MainpluginsSpawners.java`.

- Provider ids: `spawner_<type id lower-case>` for every type in the spawners config; `create` builds the same item as the pickup drop (lines ~315-322) but tags it with the provider id.
- Placing (line ~185): tag value `spawner_zombie` or legacy `ZOMBIE` -> strip `spawner_` prefix, look up type case-insensitively. Pickup drops now use the new tag.
- Register provider in onEnable via `CoreAPI.getCustomItemService().registerProvider(this, provider)`.
- Generators: same idea - `mainplugins-generators` registers a provider for its existing generator ids (e.g. `GENERATOR_BRUK_T1`, ids read from its config/constants; the tag value stays the same, so old items keep working). Big template uses `custom: <generator id>` for them.
- [ ] Step 1: build `-pl mainplugins-core,mainplugins-spawners,mainplugins-generators` - PASS.
- [ ] Step 2: commit `Spawnery i Generatory: przedmioty w katalogu itemow`.

---

# PART A - APP (SHOP)

### Task S7: `shopYaml.ts` (pure, vitest)

**Files:** create `desktop-app/src/lib/shopYaml.ts`, `shopYaml.test.ts`.

**Interfaces - Produces:**
```ts
import type { ItemRef } from "./itemRef";
export interface ShopItemDraft { ref: ItemRef; buy: number | null; sell: number | null; amount: number; sellAmount: number;
  name: string; lore: string[]; instrument: string; raw: Record<string, unknown> }
export interface RotationDraft { enabled: boolean; show: number; everyDays: number; pool: ShopItemDraft[] }
export interface CategoryDraft { id: string; name: string; icon: ItemRef; items: ShopItemDraft[]; rotation: RotationDraft | null; raw: Record<string, unknown> }
export interface ShopSettingsDraft { categoryOrder: string[]; rounding: "whole" | "cents"; dynamic: { enabled: boolean; cycleMinutes: number; minMultiplier: number;
  maxMultiplier: number; resetDays: number; maxSellShare: number }; statsEnabled: boolean;
  menus: Record<string, { size: number; layout: { slot: number; role: string; material?: string; amount?: number }[] }>;
  raw: Record<string, unknown> }
export function parseShopSettings(text: string): ShopSettingsDraft;
export function serializeShopSettings(s: ShopSettingsDraft): string;
export function parseCategory(id: string, text: string): CategoryDraft;
export function serializeCategory(c: CategoryDraft): string;
export function perPiece(price: number | null, lot: number): number | null;   // price / lot, 2 decimals
export function fromPerPiece(perPiece: number | null, lot: number): number | null; // perPiece * lot, 2 decimals
export function isLotted(i: ShopItemDraft): boolean;                            // amount>1 || sellAmount>1
export function newCategoryId(name: string, existing: string[]): string;      // reuse idFromName from cratesYaml
```
- [ ] Step 1: tests: parse+serialize category from spec keeps unknown item field and unknown top field; `amount`/`sell-amount` omitted when 1; decimal prices; rotation absent -> null and not written; settings defaults on empty text; unknown keys in `dynamic-prices` kept; `perPiece(10,64)=0.16`, `fromPerPiece(0.16,64)=10.24`.
- [ ] Step 2: FAIL -> implement -> PASS. Step 3: commit (app) `Aplikacja: model shop.yml i kategorii`.

### Task S8: Templates (small + big)

**Files:** create `desktop-app/scripts/convert-big-shop.mjs`, `src/lib/shopTemplates.ts`, `src/lib/shopTemplates/{small-en,small-pl,big-pl}.json`; the old shop files from Task S3 in `desktop-app/scripts/old-shop/`.

- Template JSON shape: `{ "shop.yml": "<text>", "categories": { "<id>": "<text>" } }`.
- `small-*.json`: generated from the plugin's `defaults/<lang>/` by the same script (`--small`), so app and plugin never differ.
- `big-pl.json`: from old files: each old item -> `{item|custom, buy: buy-price, sell: sell-price, amount, sell-amount, name: display-name, lore, instrument}` (drop `slot`, `display-name` only kept when it differs from the vanilla name is NOT checked - always kept as `name`); spawners `custom-id: ZOMBIE` -> `custom: spawner_zombie`; other `custom-id` values -> `custom: <id>`; `kolekcja` gets `rotation: {enabled: true, show: 5, every-days: 14, pool: <pula-rotacyjna converted: material/nazwa/cena/instrument>}`; `shop.yml` from `sklep-gui.yml` layouts + `category-order` + defaults for dynamic/stats (`stats.enabled: true`, `price-rounding: whole` for big; small templates `price-rounding: cents`).
- `shopTemplates.ts`: `templateChoices(lang)` -> `[{id:"small", label:"Mały"}, {id:"big", label:"Duży (po polsku)"}]`, `templateFor(id, lang)`.
- [ ] Step 1: run `node scripts/convert-big-shop.mjs` - writes JSON; vitest: big template parses (every category parses via `parseCategory` with no thrown error, 10 categories, `kolekcja` has rotation with pool size equal to old pool, spawner items use `spawner_`).
- [ ] Step 2: commit (app) `Aplikacja: szablony Sklepu (Maly, Duzy)`.

### Task S9: ShopEditorPage

**Files:** create `desktop-app/src/pages/ShopEditorPage.tsx`; modify `src/lib/shopStats.ts` (path `MainpluginsShop/stats.yml`, keys = item key), `src/App.tsx` (route `items` -> ShopEditorPage, keep the URL), `src/components/Layout.tsx` (label "Sklep"), `src/pages/IslandsPage.tsx:791` (text: "categories/<kategoria>.yml, pozycja custom: spawner_<typ>"); delete `ItemBuilderPage.tsx`, `lib/shopGuiYaml.ts`.

**Layout (same building blocks as QuestsPage: `Fold`, `CommandTip`, `CopyRow`, `LoreEditor`, `ItemRefPicker`, `MaterialIcon`, `MinecraftTextInput`, `SlotGrid`, `showPrompt`, `useDirtyTracking`, `loadItemCatalog`, `readSetting` for language):**
- Top: profile/server, tabs "Kategorie" | "Ustawienia" | "Statystyki", template select (when no `shop.yml` on server show the small template for server language, like Quests), "Zapisz", "Wyślij na serwer" (writes `shop.yml` + every category file + deletes category files removed in the app after a confirm, then `@shop reload`), "Komendy" modal.
- Kategorie tab: left list (order drag or up/down, add via `showPrompt` -> `newCategoryId`, delete with confirm), middle: in-game-like grid of the category items (MaterialIcon + name, click selects, "+ Dodaj przedmiot"), right folds for the selected item: "Przedmiot" (ItemRefPicker from catalog, name, lore, instrument select only for GOAT_HORN), "Cena" (checkbox "Da się kupić" + "Cena kupna za sztukę"; checkbox "Da się sprzedać" + "Cena skupu za sztukę"; switch "Sprzedawaj w paczkach" -> fields "Kupno: paczka X szt. za Y", "Skup: paczka X szt. za Y"; when switch off, per-piece values are written with amount 1). Category folds: "Nazwa i ikonka", "Rotacja" (switch, show, every days, pool list with the same item editor).
- Ustawienia tab: fold "Ceny" (switch "pełne złotówki / grosze" = `price-rounding`), folds "Ceny dynamiczne" (switch + 5 numbers with Polish hints), "Statystyki" (switch), "Wygląd menu" (4 screens, each SlotGrid with drag like Quests main menu; AMOUNT_SLOT shows its amount, editable).
- Statystyki tab: existing stats table from the old page (moved code, reads new path).
- [ ] Step 1: write page; Step 2: `npx tsc --noEmit`, `npx vitest run` - PASS.
- [ ] Step 3: commit (app) `Aplikacja: nowa strona Sklepu (kategorie, ceny, rotacja, ustawienia, statystyki)`.

### Task S10: Jars, full build, server test

- [ ] Step 1: `& $mvn -q clean package` (all modules) - PASS, all tests.
- [ ] Step 2: copy core, hud, market, shop, spawners jars to `desktop-app/src-tauri/plugin-jars`; `cargo test --lib`, `npx vitest run`, `npx tsc --noEmit` - PASS; commit (app) `Aplikacja: swieze pluginy (Sklep, Targ, core, HUD, Spawnery)`.
- [ ] Step 3: server stopped -> copy the same jars to `C:\Users\Zgredek\Desktop\Serwer\plugins`. User tests in game + app: first start moves old files to `old/`, small shop works (buy, lots in big template, sell/sellall, search, sort), dynamic prices + `/@shop` commands, rotation with the big template, stats, HUD tip + reset days, spawner bought from shop places correctly, app pages round-trip.
- [ ] Step 4: fix reports, commit each; update `docs/podsumowanie-<date>.md` for Stasik at the end (on request), memory + NOTATKI.
