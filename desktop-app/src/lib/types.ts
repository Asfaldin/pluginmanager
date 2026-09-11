export type AuthMethod = "Password" | "PrivateKey";

// Mirrors Mainplugins/license-server's licenses.json record shape exactly (patrz
// src/db.js) - zwracane przez /api/me/licenses klientowi (appka nie ma już panelu
// admina, patrz Mainplugins/license-server/README.md dla wystawiania kluczy przez curl).
export interface LicenseRecord {
  key: string;
  // Pojedynczy plugin ("tools"), lista pakietu rozdzielona przecinkami
  // ("crates,market,spawners,dungeons") albo "*" (wszystko) - patrz licenseGrants w db.js.
  plugin: string;
  note: string;
  serverId: string | null;
  status: "active" | "revoked";
  customerId: string | null;
  subscriptionId: string | null;
  billingType: "one-time" | "subscription";
  createdAt: string;
  boundAt: string | null;
}

// Mirrors license-server's customer-facing API (patrz src/customers.js, src/catalog.js) -
// używane przez zakładkę Sklep i bramkę logowania (App.tsx/AuthContext).
export interface CustomerInfo {
  id: string;
  email: string;
  createdAt: string;
}

export interface CatalogCategory {
  id: string;
  label: string;
}

export interface CatalogPlugin {
  id: string;
  label: string;
  description: string;
  category: string | null;
  price: number | null;
  variantId: string | null;
}

export interface CatalogPackage {
  id: string;
  label: string;
  description: string;
  /** "*" (wszystko) albo lista id pluginów wchodzących w skład pakietu. */
  plugins: "*" | string[];
  price: number | null;
  subscriptionPrice: number | null;
  variantId: string | null;
  subscriptionVariantId: string | null;
}

export interface Catalog {
  storeUrl: string | null;
  categories: CatalogCategory[];
  individualPlugins: CatalogPlugin[];
  packages: CatalogPackage[];
}

/** Gdzie jest serwer: w internecie (SFTP) albo w folderze na tym komputerze. */
export type ProfileKind = "Remote" | "Local";

export interface ServerProfile {
  id: string;
  name: string;
  sftp_host: string;
  sftp_port: number;
  sftp_username: string;
  auth_method: AuthMethod;
  private_key_path: string | null;
  /** Dla serwera lokalnego: `<local_path>/plugins` - dzięki temu każda zakładka działa bez zmian. */
  remote_plugins_path: string;
  rcon_host: string;
  rcon_port: number;
  kind: ProfileKind;
  local_path: string | null;
}

/** Krótki opis, gdzie jest serwer - do list profili. */
export function profileWhere(p: ServerProfile): string {
  return p.kind === "Local" ? `Ten komputer: ${p.local_path ?? ""}` : `${p.sftp_username}@${p.sftp_host}:${p.sftp_port}`;
}

export interface RemoteEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

// Mirrors mainplugins-shop's category YAML entry shape exactly (material,
// slot, display-name, amount, buy-price, sell-price, sell-amount, custom-id,
// lore) - the format ShopManager.wczytajSklepZFolderow() actually parses.
export interface ShopItem {
  material: string;
  slot: number;
  displayName: string;
  amount: number;
  buyPrice: number;
  sellPrice: number | null;
  sellAmount: number | null;
  customId: string;
  lore: string[];
}

export interface PackMeta {
  pack_format: number;
  description: string;
}

// Mirrors mainplugins-shop's sklep-gui.yml exactly - pure GUI layout/size for
// the shop's 4 screens, independent of item content (categories/*.yml).
export type ShopSlotRole =
  | "CATEGORY_SLOT"
  | "ITEM_SLOT"
  | "AMOUNT_SLOT"
  | "NAV_BACK"
  | "NAV_PREV"
  | "NAV_NEXT"
  | "EXIT"
  | "SEARCH"
  | "SORT"
  | "FILLER";

export interface ShopSlotEntry {
  slot: number;
  role: ShopSlotRole;
  material?: string;
  amount?: number;
}

export interface ShopScreen {
  size: number;
  layout: ShopSlotEntry[];
}

export interface ShopGuiContent {
  categoryOrder: string[];
  mainMenu: ShopScreen;
  categoryPage: ShopScreen;
  buyPicker: ShopScreen;
  searchResults: ShopScreen;
}

export interface TextureStatus {
  overridden: boolean;
  width: number | null;
  height: number | null;
  preview_data_url: string | null;
}

// Mirrors mainplugins-skyblock's wyspy-gui.yml exactly. Unlike the shop's
// generic-role slots, every island button is a uniquely named "akcja" (a
// fixed server-recognized id - never renamed by the app) with its own
// content directly attached; several entries CAN legitimately share one
// slot (mutually exclusive runtime variants, e.g. USUN_WYSPE/OPUSC_WYSPE -
// the server switches between them based on player state).
export interface IslandButton {
  slot: number;
  akcja: string;
  material: string;
  materialWylaczone?: string;
  nazwa: string;
  kolor?: string;
  lore: string[];
}

export interface IslandScreen {
  size: number;
  przyciski: IslandButton[];
}

export interface IslandGuiContent {
  panelWyspy: IslandScreen;
  permisjeWyspy: IslandScreen;
  ustawieniaWyspy: IslandScreen;
  topkaWysp: IslandScreen & { slotyRankingu: number[] };
  ulepszeniaWyspy: IslandScreen;
  ulepszenieSpawnerow: IslandScreen & { slotyTypow: number[] };
  spawnerPodmenu: IslandScreen;
  czlonkowieWyspy: IslandScreen & { slotWlasciciela: number; pierwszySlotCzlonka: number; ostatniSlotCzlonka: number };
}

// Mirrors mainplugins-skyblock's wyspy-config.yml exactly.
export interface CooldownProba {
  odProby: number;
  sekundy: number;
}

export interface SpawnerType {
  id: string;
  nazwaOdmieniona: string;
  ikona: string;
  cenaWSklepie: number;
}

export interface CostCurve {
  poziomy: Record<number, number>;
  domyslny: number;
}

export interface IslandConfig {
  tworzenieWyspy: { domyslnyRozmiar: number; cooldownProb: CooldownProba[] };
  border: { przyrostNaUlepszenie: number; kosztZaBlok: number; maxRozmiar: number; odstepSiatkiWysp: number };
  teleportBezpieczenstwo: { maxGlebokoscSzukaniaWDol: number; promienSzukaniaObok: number };
  timeouty: { potwierdzenieSekundy: number; zaproszenieSekundy: number; maxLotPerlySekundy: number };
  nazwaWyspy: { maxDlugosc: number };
  wyczyszczenieTerenu: { zapasNaSchemat: number; chunkiNaTick: number };
  wartosciBlokow: Record<string, number>;
  spawnery: {
    maxPoziom: number;
    typy: SpawnerType[];
    kosztBazowyIlosc: CostCurve;
    kosztBazowySzybkosc: CostCurve;
  };
  sniffer: {
    promienZbioru: number;
    wysokoscZbioru: number;
    promienSzukaniaSkrzyni: number;
    promienWedrowania: number;
    skanOdstepSekundy: number;
    uprawy: string[];
  };
}

// Mirrors mainplugins-crates' crate-rewards*.yml entry shape (CrateManager.wczytajNagrody()).
export interface CrateReward {
  material: string;
  amount: number;
  weight: number;
  name: string;
  color: string;
  broadcast: boolean;
}

export interface WorldPoint {
  world: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface NamedWarp extends WorldPoint {
  name: string;
}

// Mirrors mainplugins-spawn's obszary.yml entry shape (ObszarManager.java).
export interface SpawnArea {
  name: string;
  world: string;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  mobyPasywne: boolean;
  mobyAgresywne: boolean;
}

export interface LocalJar {
  name: string;
  path: string;
  size: number;
  modified_unix: number;
}

export interface McVersionSummary {
  id: string;
  version_type: string;
}

export interface TexturePackProject {
  id: string;
  name: string;
  local_path: string;
  base_version: string | null;
}

export interface ItemEnchant {
  /** Klucz Minecrafta małymi literami, np. "sharpness". */
  name: string;
  level: number;
}

// Mirrors one entry of mainplugins-core's items/*.yml (katalog itemów) + nazwa pliku, z którego pochodzi.
export interface CustomItemEntry {
  id: string;
  file: string;
  material: string;
  name: string;
  lore: string[];
  model: string;
  glint: boolean;
  enchants: ItemEnchant[];
  unbreakable: boolean;
}

// Mirrors mainplugins-redstone's redstone-items.yml entry shape (custom-items.yml fields + kind).
// Lokalne "czy blok jest zasilony" (RedstonePower) jest bramką on/off dla STATION/HARVESTER -
// żaden graf/zanik sygnału. CABLE (łącze danych), STATION (dron sadzi), HARVESTER (dron zbiera
// do skrzynki), GOLEM_STATION (golem między dwiema połączonymi skrzynkami), PLANTER (sadzi
// wskazane pole), CHEST_LINKER (łączy dwie skrzynki - PPM w obie po kolei).
export type RedstoneItemKind = "CABLE" | "PLANTER" | "STATION" | "HARVESTER" | "GOLEM_STATION" | "CHEST_LINKER";

export interface RedstoneItemEntry {
  id: string;
  kind: RedstoneItemKind;
  material: string;
  name: string;
  lore: string[];
  model: string;
  glint: boolean;
}

// Mirrors mainplugins-quests' quests-content.yml exactly.
export type SlotRole = "CATEGORY_SLOT" | "FILLER" | "QUEST_SLOT" | "NAV_PREV" | "NAV_BACK" | "NAV_NEXT";

export interface SlotEntry {
  slot: number;
  role: SlotRole;
  material?: string;
}

export interface RequirementMaterial {
  material: string;
  amount: number;
  customId?: string;
  displayName?: string;
}

export type Requirement =
  | { type: "ITEM"; materials: RequirementMaterial[] }
  | { type: "FREE" }
  | { type: "MONEY"; amount: number }
  | { type: "TOOL_POSSESS"; material: string }
  | { type: "TOOL_LEVEL"; tool: "PICKAXE" | "AXE" | "SWORD"; level: number }
  | { type: "MARKET_OFFER" }
  // Trzy poniżej to LICZNIKI NARASTAJĄCE (postęp trwały, kumulowany od momentu wczytania
  // questu przez gracza - QuestManager#zarejestrujZakup/zarejestrujSprzedaz/
  // zarejestrujWystawienieNaTarg), NIE stan bieżący jak MARKET_OFFER powyżej.
  | { type: "BUY_ITEM"; material: RequirementMaterial }
  | { type: "SELL_ITEM"; material: RequirementMaterial }
  | { type: "MARKET_LISTINGS"; amount: number };

export type RewardEntry =
  | { type: "ITEM"; material: string; amount: number; silent?: boolean }
  | { type: "CUSTOM_ITEM"; id: string; amount: number; silent?: boolean }
  | { type: "MONEY"; amount: number; silent?: boolean }
  | { type: "CRATE"; tier: number; fallback?: RewardEntry[]; silent?: boolean }
  | { type: "TOOL"; tool: "PICKAXE" | "AXE" | "HOE" | "SWORD" | "SHOVEL"; silent?: boolean }
  | { type: "TITLE"; id: string; silent?: boolean };

export interface QuestEntry {
  id: number;
  title: string;
  description: string[];
  requirement: Requirement;
  rewards: RewardEntry[];
  rewardLabel?: string;
}

export interface QuestUnlock {
  category: string;
  questId: number;
}

export interface QuestCategory {
  displayName: string;
  icon: string;
  description: string;
  mainPath: boolean;
  sequential: boolean;
  unlock: QuestUnlock | null;
  pageLayout: SlotEntry[];
  quests: QuestEntry[];
}

export interface QuestsContent {
  mainMenuLayout: SlotEntry[];
  categoryOrder: string[];
  titles: Record<string, string>;
  categories: Record<string, QuestCategory>;
}

export interface DownloadResult {
  sha1: string;
  files_extracted: number;
}

// Mirrors mainplugins-menu's menu-gui.yml exactly (MenuGuiLoader.java). Unlike
// the shop/island screens, a menu button calls an arbitrary raw Bukkit command
// string directly (player.performCommand) - "komenda" is itself a free-text
// editable field, not a fixed server-recognized action id like islands' "akcja".
export interface MenuButton {
  slot: number;
  material: string;
  nazwa: string;
  lore: string[];
  komenda: string;
}

export interface MenuGuiContent {
  size: number;
  tlo: string;
  przyciski: MenuButton[];
}

// Mirrors mainplugins-ranks' ranks-config.yml exactly (RanksConfigLoader.java). The set
// of ranks itself (GRACZ/VIP/ADMIN) is fixed - baked into mainplugins-core's Rank enum
// across the whole ecosystem (ADMIN = real Bukkit op) - only their PRESENTATION
// (prefix/color) is configurable here. Per-player rank ASSIGNMENT lives in ranks.yml,
// runtime player state set via /@setranga - not part of this config, no editor for it.
export type RankId = "GRACZ" | "VIP" | "ADMIN";

export interface RankAppearance {
  prefix: string;
  kolorNicku: string;
}

export interface RanksConfig {
  wygladu: Record<RankId, RankAppearance>;
}

// Mirrors mainplugins-spawners' spawnery-typy.yml exactly (SpawnerConfigLoader.java).
// "id" is now a free-form string key (was a hardcoded enum before this system existed) -
// changing/removing an id that players already have placed breaks their saved spawner
// state (spawnery.yml, per-instance runtime data, not edited here). Must match the
// custom-id used in mainplugins-shop categories/spawnery.yml AND the id in
// mainplugins-skyblock wyspy-config.yml's spawnery.typy - nothing syncs these automatically.
export interface SpawnerTypeDef {
  id: string;
  encja: string;
  nazwaOdmieniona: string;
  nazwaPojedyncza: string;
}

// interwalSekund(poziom) = interwalSekundBazowy + interwalSekundNaPoziom * poziom
// iloscNaCykl(poziom)    = iloscNaCyklBazowa + iloscNaCyklNaPoziom * poziom
export interface SpawnerSettings {
  maxPoziom: number;
  limitKolejki: number;
  interwalSekundBazowy: number;
  interwalSekundNaPoziom: number;
  iloscNaCyklBazowa: number;
  iloscNaCyklNaPoziom: number;
  limitSpawnerowNaWyspe: number;
  promienAktywnosciGracza: number;
  narzedzieZbierania: string;
}

export interface SpawnerConfig {
  typy: SpawnerTypeDef[];
  ustawienia: SpawnerSettings;
}

// Mirrors mainplugins-dungeons' dungeons-config.yml exactly (DungeonConfigLoader.java).
// Proof-of-concept module (single boss, procedurally generated platforms) - reload only
// affects FUTURE generation/spawns, doesn't retroactively rebuild already-placed blocks.
// DUNGEON_TROFEUM_WLADCA_LOCHU (boss trophy custom-id) stays hardcoded server-side - the
// Main Path quest "Pierwszy Loch" requires exactly that id, not editable here.
export interface DungeonMiejsce {
  bazowyX: number;
  bazowyY: number;
  bazowyZ: number;
  odstepPokoi: number;
  liczbaPokoi: number;
  promienPokoju: number;
  materialPodlogiPokoju: string;
  materialScianyPokoju: string;
  wysokoscScianyPokoju: number;
  promienArenyBossa: number;
  materialPodlogiAreny: string;
  materialScianyAreny: string;
  wysokoscScianyAreny: number;
}

// ilosc/hp/obrazenia straznikow w pokoju N (liczac od 0) = bazowa + naPokoj * N
export interface DungeonPokoje {
  encja: string;
  iloscBazowa: number;
  iloscNaPokoj: number;
  hpBazowe: number;
  hpNaPokoj: number;
  obrazeniaBazowe: number;
  obrazeniaNaPokoj: number;
}

export interface DungeonBoss {
  encja: string;
  encjaSlugi: string;
  maxHp: number;
  obrazeniaAtaku: number;
  obrazeniaPocisku: number;
  okresUmiejetnosciSekundy: number;
  progPrzywolaniaSlug1: number;
  progPrzywolaniaSlug2: number;
  progSzalu: number;
  nagrodaMonety: number;
}

export interface DungeonConfig {
  miejsce: DungeonMiejsce;
  pokoje: DungeonPokoje;
  boss: DungeonBoss;
}

// Mirrors mainplugins-farming's farming-config.yml exactly (FarmingConfigLoader.java).
export interface FarmingConfig {
  zlotaMarchewkaIloscMin: number;
  zlotaMarchewkaIloscMax: number;
}

// Mirrors mainplugins-fishing's fishing-config.yml exactly (FishingConfigLoader.java).
// customId of each gatunek must match sklep.yml (kategoria ryby_wedkarskie) and the
// "Rybak" quest category's requirement custom-ids - nothing auto-syncs these.
export type FishRzadkosc = "ZWYKLA" | "NIEZWYKLA" | "RZADKA" | "EPICKA" | "LEGENDARNA";

export interface FishSpecies {
  customId: string;
  nazwa: string;
  material: string;
  kolor: string;
  rzadkosc: FishRzadkosc;
  waga: number;
}

// wartosc(trudnosc) = clamp(bazowa + naTrudnosc*trudnosc, min, max); trudnosc = rzadkosc.ordinal() (0-4)
export interface FishFormula {
  bazowa: number;
  naTrudnosc: number;
  min: number;
  max: number;
}

export interface FishMinigraConfig {
  szerokoscPaska: number;
  grawitacja: number;
  impulsKlikniecia: number;
  okresTickow: number;
  maksymalnyCzasSekund: number;
  polowaSzerokosciSuwaka: FishFormula;
  predkoscRyby: FishFormula;
  tempoNapelniania: FishFormula;
  tempoOprozniania: FishFormula;
}

export interface FishingConfig {
  gatunki: FishSpecies[];
  minigra: FishMinigraConfig;
  bonusowaSkrzynkaSzansaProcent: number;
}

// Mirrors mainplugins-hud's hud-config.yml exactly (HudConfigLoader.java).
export interface HudFakeGracz {
  nick: string;
  kasa: number;
}

export interface HudFakeWyspa {
  nick: string;
  rozmiar: number;
  czlonkowie: number;
}

export interface HudConfig {
  proTipy: string[];
  maxTop: number;
  sekundNaSlajd: number;
  coKtorySlajdRynkowy: number;
  szerokoscProTipu: number;
  szerokoscPadGracza: number;
  fakeTopGraczy: HudFakeGracz[];
  fakeTopWysp: HudFakeWyspa[];
}

// Mirrors mainplugins-chatfilter's chatfilter-config.yml exactly
// (ChatFilterConfigLoader.java). "exemptRangi" mirrors mainplugins-core's 3-value Rank
// enum (GRACZ/VIP/ADMIN) - ranks in this list skip the filter entirely. Anti-spam has no
// exempt-rangi server-side (its bypass is the mainplugins.chatfilter.bypass permission,
// not a rank, and stays hardcoded - not part of this config).
export type ChatRank = "GRACZ" | "VIP" | "ADMIN";

export interface ChatFilterConfig {
  antySpam: { enabled: boolean; cooldownSekundy: number };
  antyCaps: { enabled: boolean; minDlugosc: number; progProcent: number; exemptRangi: ChatRank[] };
  dlugoscWiadomosci: { enabled: boolean; limitZnakow: number; exemptRangi: ChatRank[] };
  antyReklama: { enabled: boolean; koncowkiDomen: string[]; exemptRangi: ChatRank[] };
  powtorzonaWiadomosc: { enabled: boolean; exemptRangi: ChatRank[] };
  powtarzajaceZnaki: { enabled: boolean; minPowtorzen: number; exemptRangi: ChatRank[] };
}

// Mirrors mainplugins-tools' ewoluujace-narzedzia.yml exactly (EvolvingToolLoader.java).
// Two families: NARZEDZIA (trigger = own action, main-hand) vs ZBROJA (trigger = taking
// damage while equipped, patrz Kategoria#jestZbroja w Javie).
export type ToolCategory = "PICKAXE" | "AXE" | "HOE" | "SWORD" | "SHOVEL" | "HELMET" | "CHESTPLATE" | "LEGGINGS" | "BOOTS";

export const ARMOR_CATEGORIES: ToolCategory[] = ["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"];

export type ToolEffectType =
  | "DUPLIKUJ_DROP"
  | "AURA_MIKSTURY"
  | "BONUS_PIENIADZE"
  | "BONUS_XP"
  | "MAGNES"
  | "PVP_BONUS_OBRAZENIA"
  | "NIENISZCZALNY"
  | "SPECJALNY_SILK_TOUCH"
  | "CZASTKI_PRZY_TRIGGERZE"
  | "OBSZAR_KRUSZENIA"
  | "ZYLA_GORNICZA"
  | "TELEKINEZA"
  | "BONUS_PRZEDMIOT"
  | "JACKPOT"
  | "PODWOJNY_ATAK"
  | "DEBUFF_PRZECIWNIKA"
  | "ODBICIE_OBRAZEN"
  | "LECZENIE"
  | "SYCENIE"
  | "PIORUN";

export interface ToolStatEntry {
  id: string;
  nazwa: string;
  bazowa: number;
  naPoziom: number;
  max: number;
  // Opcjonalne podpięcie pod prawdziwy enczant - patrz komentarz w ewoluujace-narzedzia.yml.
  // enchant pusty string = brak podpięcia (stat czysto informacyjny).
  enchant: string;
  enchantMnoznik: number;
}

export interface EnchantProgressEntry {
  enchant: string;
  // "poziom narzędzia" -> "poziom enczantu"
  progresja: Record<number, number>;
}

export interface ToolEffectEntry {
  typ: ToolEffectType;
  szansaBazowa: number;
  szansaNaPoziom: number;
  szansaMax: number;
  kwotaBazowa: number;
  kwotaNaPoziom: number;
  mikstura: string;
  poziomMikstury: number;
  czastka: string;
  dzwiek: string;
  promien: number;
  // BONUS_PRZEDMIOT: przedmiotCustomId ma pierwszeństwo (przez CustomItemService),
  // inaczej zwykły Material z przedmiotMaterial. kwotaBazowa/kwotaNaPoziom = ilość.
  przedmiotMaterial: string;
  przedmiotCustomId: string;
  // Jawna progresja POZIOM -> WARTOŚĆ - gdy niepusta, CAŁKOWICIE zastępuje odpowiedni
  // wzór liniowy (bazowa/naPoziom/max) - patrz komentarz w ewoluujace-narzedzia.yml.
  szansaProgresja: Record<number, number>;
  kwotaProgresja: Record<number, number>;
}

export interface EvolvingToolEntry {
  id: string;
  kategoria: ToolCategory;
  material: string;
  nazwa: string;
  model: string;
  glint: boolean;
  maxPoziom: number;
  expNaPoziom: number;
  staty: ToolStatEntry[];
  enchanty: EnchantProgressEntry[];
  // "poziom" -> lista efektów odblokowanych na stałe od tego poziomu
  kamienieMilowe: Record<number, ToolEffectEntry[]>;
  pasywne: ToolEffectEntry[];
  czastkiOtoczenia: string;
}

// Mirrors mainplugins-quests' generatory.yml exactly (GeneratorLoader.java) - T2-T4
// generators only, additional to the untouched, hardcoded T1 (GENERATOR_BRUK_T1/
// GENERATOR_KRUCHY_T1, still edited via CustomItemsPage since they live in custom-items.yml).
export type GeneratorMode = "PRZEPUSZCZAJACY" | "BEZPOSREDNI";
export type GeneratorTool = "PICKAXE" | "SHOVEL";

export interface GeneratorDropEntry {
  material: string;
  // null = gwarantowany/równo ważony wybór (uzywane w bazaDropy) zamiast niezależnej szansy
  szansaProcent: number | null;
  iloscMin: number;
  iloscMax: number;
}

export interface GeneratorEntry {
  id: string;
  tryb: GeneratorMode;
  materialGeneratora: string;
  materialBazowe: string;
  narzedzie: GeneratorTool;
  odnowaTickow: number;
  nazwa: string;
  lore: string[];
  bazaDropy: GeneratorDropEntry[];
  bonusDropy: GeneratorDropEntry[];
}
