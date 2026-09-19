import * as yaml from "js-yaml";
import type { ItemRef } from "./itemRef";

// Sklep (mainplugins-shop): shop.yml + categories/<id>.yml. Czysta logika bez serwera - testy w shopYaml.test.ts.
// Ceny w plikach są za stack (amount / sell-amount sztuk); aplikacja pokazuje je domyślnie za sztukę.
// Nieznane pola zostają w `raw` i wracają do pliku przy zapisie.

type Obj = Record<string, unknown>;

export interface ShopItemDraft {
  ref: ItemRef;
  buy: number | null;
  sell: number | null;
  amount: number;
  sellAmount: number;
  name: string;
  lore: string[];
  instrument: string;
  raw: Obj;
}

export interface RotationDraft {
  enabled: boolean;
  show: number;
  everyDays: number;
  announce: boolean;
  pool: ShopItemDraft[];
  raw: Obj;
}

export interface CategoryDraft {
  id: string;
  name: string;
  icon: ItemRef;
  items: ShopItemDraft[];
  rotation: RotationDraft | null;
  raw: Obj;
}

export interface SlotEntryDraft {
  slot: number;
  role: string;
  material?: string;
  amount?: number;
}

export interface MenuScreenDraft {
  size: number;
  layout: SlotEntryDraft[];
}

export interface DynamicDraft {
  enabled: boolean;
  cycleMinutes: number;
  minMultiplier: number;
  maxMultiplier: number;
  resetDays: number;
  maxSellShare: number;
  announceEvents: boolean;
}

export interface ShopSettingsDraft {
  categoryOrder: string[];
  rounding: "whole" | "cents";
  dynamic: DynamicDraft;
  statsEnabled: boolean;
  menus: Record<string, MenuScreenDraft>;
  buttons: Record<string, string>;
  raw: Obj;
}

export const SCREENS = ["main-menu", "category-page", "buy-picker", "search-results"];
export const SCREEN_LABELS: Record<string, string> = {
  "main-menu": "Menu główne",
  "category-page": "Strona kategorii",
  "buy-picker": "Wybór ilości",
  "search-results": "Wyniki wyszukiwania",
};
export const ROLE_LABELS: Record<string, string> = {
  CATEGORY_SLOT: "Kategoria",
  ITEM_SLOT: "Przedmiot",
  AMOUNT_SLOT: "Ilość",
  NAV_BACK: "Wróć",
  NAV_PREV: "Poprzednia",
  NAV_NEXT: "Następna",
  EXIT: "Zamknij",
  SEARCH: "Szukaj",
  SORT: "Sortuj",
  FILLER: "Tło",
};
export const BUTTON_LABELS: Record<string, string> = {
  search: "Szukaj",
  exit: "Zamknij sklep",
  back: "Wróć",
  prev: "Poprzednia strona",
  next: "Następna strona",
  sort: "Sortowanie (kupno)",
  "sort-sell": "Sortowanie (skup)",
  "picker-back": "Wróć z wyboru ilości",
};

const DEFAULT_BUTTONS: Record<string, string> = {
  search: "OAK_SIGN",
  exit: "BARRIER",
  back: "COMPASS",
  prev: "SPECTRAL_ARROW",
  next: "SPECTRAL_ARROW",
  sort: "HOPPER",
  "sort-sell": "GOLD_INGOT",
  "picker-back": "ARROW",
};

function itemGrid(): SlotEntryDraft[] {
  const out: SlotEntryDraft[] = [];
  for (let row = 1; row <= 4; row++) for (let col = 1; col <= 7; col++) out.push({ slot: row * 9 + col, role: "ITEM_SLOT" });
  return out;
}

/** Ten sam układ co ShopSettings.defaultMenus() w pluginie. */
export function defaultMenus(): Record<string, MenuScreenDraft> {
  const main: SlotEntryDraft[] = [{ slot: 4, role: "SEARCH" }, { slot: 49, role: "EXIT" }];
  for (let s = 19; s <= 25; s++) main.push({ slot: s, role: "CATEGORY_SLOT" });
  for (let s = 28; s <= 34; s++) main.push({ slot: s, role: "CATEGORY_SLOT" });
  return {
    "main-menu": { size: 54, layout: main },
    "category-page": {
      size: 54,
      layout: [
        { slot: 4, role: "SORT" },
        ...itemGrid(),
        { slot: 45, role: "NAV_PREV" },
        { slot: 48, role: "NAV_BACK" },
        { slot: 50, role: "EXIT" },
        { slot: 53, role: "NAV_NEXT" },
      ],
    },
    "buy-picker": {
      size: 27,
      layout: [
        ...[1, 8, 16, 32, 64].map((amount, i) => ({ slot: 11 + i, role: "AMOUNT_SLOT", amount })),
        { slot: 22, role: "NAV_BACK" },
      ],
    },
    "search-results": { size: 54, layout: [...itemGrid(), { slot: 48, role: "NAV_BACK" }] },
  };
}

export function defaultDynamic(): DynamicDraft {
  return { enabled: true, cycleMinutes: 60, minMultiplier: 0.5, maxMultiplier: 1.5, resetDays: 14, maxSellShare: 0.9, announceEvents: true };
}

export function defaultSettings(): ShopSettingsDraft {
  return {
    categoryOrder: [],
    rounding: "cents",
    dynamic: defaultDynamic(),
    statsEnabled: false,
    menus: defaultMenus(),
    buttons: { ...DEFAULT_BUTTONS },
    raw: {},
  };
}

function obj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function without(o: Obj, keys: string[]): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) if (!keys.includes(k)) out[k] = v;
  return out;
}

const HEADER_SHOP =
  "# Mainplugins Shop - settings (edited in the PluginManager app). Items and prices are in categories/<id>.yml.\n";
const HEADER_CATEGORY =
  "# One shop category (edited in the PluginManager app). buy = price for 'amount' pieces, sell = price for 'sell-amount' pieces.\n";

// ---------- shop.yml ----------

export function parseShopSettings(text: string): ShopSettingsDraft {
  const raw = obj(text.trim() ? yaml.load(text) : {});
  const d = defaultSettings();
  const dyn = obj(raw["dynamic-prices"]);
  const menusRaw = obj(raw.menus);
  const menus: Record<string, MenuScreenDraft> = {};
  for (const s of SCREENS) {
    const m = obj(menusRaw[s]);
    const layout = Array.isArray(m.layout)
      ? m.layout.map((e) => {
          const o = obj(e);
          const entry: SlotEntryDraft = { slot: num(o.slot, 0), role: String(o.role ?? "FILLER").toUpperCase() };
          if (o.material != null) entry.material = String(o.material);
          if (o.amount != null) entry.amount = num(o.amount, 1);
          return entry;
        })
      : d.menus[s].layout;
    menus[s] = { size: num(m.size, d.menus[s].size), layout };
  }
  const buttons = { ...DEFAULT_BUTTONS };
  for (const [k, v] of Object.entries(obj(menusRaw.buttons))) if (k in buttons) buttons[k] = String(v);
  return {
    categoryOrder: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
    rounding: raw["price-rounding"] === "whole" ? "whole" : "cents",
    dynamic: {
      enabled: typeof dyn.enabled === "boolean" ? dyn.enabled : d.dynamic.enabled,
      cycleMinutes: num(dyn["cycle-minutes"], d.dynamic.cycleMinutes),
      minMultiplier: num(dyn["min-multiplier"], d.dynamic.minMultiplier),
      maxMultiplier: num(dyn["max-multiplier"], d.dynamic.maxMultiplier),
      resetDays: num(dyn["reset-days"], d.dynamic.resetDays),
      maxSellShare: num(dyn["max-sell-share"], d.dynamic.maxSellShare),
      announceEvents: typeof dyn["announce-events"] === "boolean" ? (dyn["announce-events"] as boolean) : d.dynamic.announceEvents,
    },
    statsEnabled: typeof obj(raw.stats).enabled === "boolean" ? Boolean(obj(raw.stats).enabled) : d.statsEnabled,
    menus,
    buttons,
    raw,
  };
}

export function serializeShopSettings(s: ShopSettingsDraft): string {
  const dynRaw = obj(s.raw["dynamic-prices"]);
  const menusRaw = obj(s.raw.menus);
  const menus: Obj = { ...menusRaw };
  for (const sc of SCREENS) {
    menus[sc] = {
      ...without(obj(menusRaw[sc]), ["size", "layout"]),
      size: s.menus[sc].size,
      layout: s.menus[sc].layout.map((e) => {
        const o: Obj = { slot: e.slot, role: e.role };
        if (e.material) o.material = e.material;
        if (e.role === "AMOUNT_SLOT") o.amount = e.amount ?? 1;
        return o;
      }),
    };
  }
  menus.buttons = { ...obj(menusRaw.buttons), ...s.buttons };
  const out: Obj = {
    ...without(s.raw, ["categories", "price-rounding", "dynamic-prices", "stats", "menus"]),
    categories: s.categoryOrder,
    "price-rounding": s.rounding,
    "dynamic-prices": {
      ...dynRaw,
      enabled: s.dynamic.enabled,
      "cycle-minutes": s.dynamic.cycleMinutes,
      "min-multiplier": s.dynamic.minMultiplier,
      "max-multiplier": s.dynamic.maxMultiplier,
      "reset-days": s.dynamic.resetDays,
      "max-sell-share": s.dynamic.maxSellShare,
      "announce-events": s.dynamic.announceEvents,
    },
    stats: { ...obj(s.raw.stats), enabled: s.statsEnabled },
    menus,
  };
  // Pola okien jako {slot: .., role: ..} w jednej linijce - czytelniej przy ręcznej edycji.
  return HEADER_SHOP + yaml.dump(out, { lineWidth: -1, noRefs: true, flowLevel: 4 });
}

// ---------- categories/<id>.yml ----------

const ITEM_KEYS = ["item", "custom", "buy", "sell", "amount", "sell-amount", "name", "lore", "instrument"];

function parseItem(v: unknown): ShopItemDraft {
  const o = obj(v);
  const ref: ItemRef = o.custom != null ? { custom: String(o.custom) } : { item: String(o.item ?? "STONE").toUpperCase() };
  return {
    ref,
    buy: typeof o.buy === "number" ? o.buy : null,
    sell: typeof o.sell === "number" ? o.sell : null,
    amount: Math.max(1, num(o.amount, 1)),
    sellAmount: Math.max(1, num(o["sell-amount"], 1)),
    name: o.name != null ? String(o.name) : "",
    lore: Array.isArray(o.lore) ? o.lore.map(String) : [],
    instrument: o.instrument != null ? String(o.instrument) : "",
    raw: without(o, ITEM_KEYS),
  };
}

function itemOut(i: ShopItemDraft): Obj {
  const o: Obj = i.ref.custom != null ? { custom: i.ref.custom } : { item: i.ref.item ?? "STONE" };
  if (i.buy != null) o.buy = round2(i.buy);
  if (i.amount > 1) o.amount = i.amount;
  if (i.sell != null) o.sell = round2(i.sell);
  if (i.sellAmount > 1) o["sell-amount"] = i.sellAmount;
  if (i.name.trim()) o.name = i.name;
  if (i.lore.length) o.lore = i.lore;
  if (i.instrument) o.instrument = i.instrument;
  return { ...o, ...i.raw };
}

function flow(o: Obj): string {
  return yaml.dump(o, { flowLevel: 0, lineWidth: -1, noRefs: true }).trim();
}

export function parseCategory(id: string, text: string): CategoryDraft {
  const raw = obj(text.trim() ? yaml.load(text) : {});
  const iconRaw = raw.icon;
  const icon: ItemRef =
    iconRaw && typeof iconRaw === "object" && obj(iconRaw).custom != null
      ? { custom: String(obj(iconRaw).custom) }
      : { item: typeof iconRaw === "string" ? iconRaw.toUpperCase() : typeof obj(iconRaw).item === "string" ? String(obj(iconRaw).item) : "CHEST" };
  const rot = raw.rotation != null ? obj(raw.rotation) : null;
  return {
    id,
    name: raw.name != null ? String(raw.name) : id,
    icon,
    items: Array.isArray(raw.items) ? raw.items.map(parseItem) : [],
    rotation: rot
      ? {
          enabled: typeof rot.enabled === "boolean" ? rot.enabled : true,
          show: Math.max(1, num(rot.show, 5)),
          everyDays: Math.max(1, num(rot["every-days"], 14)),
          announce: typeof rot.announce === "boolean" ? rot.announce : true,
          pool: Array.isArray(rot.pool) ? rot.pool.map(parseItem) : [],
          raw: without(rot, ["enabled", "show", "every-days", "announce", "pool"]),
        }
      : null,
    raw: without(raw, ["name", "icon", "items", "rotation"]),
  };
}

export function serializeCategory(c: CategoryDraft): string {
  const top: Obj = { name: c.name, icon: c.icon.custom != null ? { custom: c.icon.custom } : c.icon.item ?? "CHEST", ...c.raw };
  let text = HEADER_CATEGORY + yaml.dump(top, { lineWidth: -1, noRefs: true });
  text += c.items.length ? "items:\n" + c.items.map((i) => `  - ${flow(itemOut(i))}\n`).join("") : "items: []\n";
  if (c.rotation) {
    const r = c.rotation;
    text += "rotation:\n";
    text += `  enabled: ${r.enabled}\n  show: ${r.show}\n  every-days: ${r.everyDays}\n`;
    const extra = yaml.dump(r.raw, { lineWidth: -1, noRefs: true });
    if (Object.keys(r.raw).length) text += extra.split("\n").filter(Boolean).map((l) => `  ${l}`).join("\n") + "\n";
    text += r.pool.length ? "  pool:\n" + r.pool.map((i) => `    - ${flow(itemOut(i))}\n`).join("") : "  pool: []\n";
  }
  return text;
}

// ---------- ceny ----------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cena stacka -> cena za sztukę (2 miejsca). */
export function perPiece(price: number | null, lot: number): number | null {
  return price == null ? null : round2(price / Math.max(1, lot));
}

/** Cena za sztukę -> cena stacka (2 miejsca). */
export function fromPerPiece(piece: number | null, lot: number): number | null {
  return piece == null ? null : round2(piece * Math.max(1, lot));
}

/**
 * Układa przedmioty po cenie za sztukę (w pliku jest za stack): "asc" od najtańszego,
 * "desc" od najdroższego. Przedmioty bez takiej ceny zawsze lądują na końcu - w obie
 * strony, bo brak ceny to nie jest "zero". Kolejność w kategorii to kolejność w menu
 * sklepu, więc to zmienia też wygląd w grze.
 */
export function sortItems(items: ShopItemDraft[], by: "buy" | "sell", dir: "asc" | "desc" = "asc"): ShopItemDraft[] {
  const price = (i: ShopItemDraft) =>
    by === "buy" ? perPiece(i.buy, i.amount) : perPiece(i.sell, i.sellAmount);
  return [...items].sort((a, b) => {
    const pa = price(a);
    const pb = price(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return dir === "asc" ? pa - pb : pb - pa;
  });
}

/**
 * Rozpoznaje, jak lista jest już ułożona (pliki od nas przychodzą ułożone po cenie),
 * żeby aplikacja pokazała od razu właściwą strzałkę. null = kolejność własna.
 */
export function detectSort(items: ShopItemDraft[]): { by: "buy" | "sell"; dir: "asc" | "desc" } | null {
  if (items.length < 2) return null;
  const same = (a: ShopItemDraft[], b: ShopItemDraft[]) => a.every((it, i) => it === b[i]);
  for (const by of ["buy", "sell"] as const) {
    // Sama lista bez tej ceny (np. nikt nie skupuje) pasuje do każdej kolejności - nic nam nie mówi.
    const withPrice = items.filter((i) => (by === "buy" ? i.buy : i.sell) != null);
    if (withPrice.length < 2) continue;
    for (const dir of ["asc", "desc"] as const) {
      if (same(items, sortItems(items, by, dir))) return { by, dir };
    }
  }
  return null;
}

export type PriceFilter = "all" | "buy" | "sell" | "both";

/** Czy przedmiot pasuje do filtra: "buy" = tylko do kupienia, "sell" = tylko do sprzedania. */
export function matchesPriceFilter(i: ShopItemDraft, filter: PriceFilter): boolean {
  switch (filter) {
    case "buy":
      return i.buy != null && i.sell == null;
    case "sell":
      return i.sell != null && i.buy == null;
    case "both":
      return i.buy != null && i.sell != null;
    default:
      return true;
  }
}

/**
 * Która kategoria trafia w które pole menu. Plugin robi to samo: bierze pola o roli
 * CATEGORY_SLOT w kolejności z pliku i wkłada w nie kategorie po kolei, więc kolejność
 * kategorii = miejsce w menu. Pola ponad liczbę kategorii zostają puste.
 */
export function categoryBySlot(layout: SlotEntryDraft[], categoryOrder: string[]): Map<number, string | undefined> {
  const out = new Map<number, string | undefined>();
  let n = 0;
  for (const e of layout) {
    if (e.role !== "CATEGORY_SLOT") continue;
    out.set(e.slot, categoryOrder[n]);
    n++;
  }
  return out;
}

/**
 * Stawia kategorię na wskazanym miejscu w kolejności (a więc w tym polu menu), reszta
 * przesuwa się dalej. Kategoria, która wcześniej nie miała miejsca, po prostu je dostaje.
 */
export function moveCategoryTo(order: string[], id: string, index: number): string[] {
  const rest = order.filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * Zamienia miejscami dwa przedmioty na liście kategorii. Kolejność listy to kolejność
 * w oknie sklepu, więc to samo przestawia je graczowi w grze.
 */
export function swapItems(items: ShopItemDraft[], a: number, b: number): ShopItemDraft[] {
  if (a === b || a < 0 || b < 0 || a >= items.length || b >= items.length) return items;
  const out = [...items];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

// ---------- pula rotacji ----------

/**
 * Przenosi wskazane pozycje ze stałej listy kategorii do puli rotacji - pozycja
 * przestaje być dostępna zawsze i pojawia się tylko wtedy, gdy sklep ją wylosuje.
 * Kategoria bez rotacji wraca bez zmian.
 */
export function moveToPool(c: CategoryDraft, indexes: number[]): CategoryDraft {
  if (!c.rotation) return c;
  const taken = new Set(indexes);
  const moved = c.items.filter((_, i) => taken.has(i));
  if (moved.length === 0) return c;
  return {
    ...c,
    items: c.items.filter((_, i) => !taken.has(i)),
    rotation: { ...c.rotation, pool: [...c.rotation.pool, ...moved] },
  };
}

/** Wyjmuje wskazane przedmioty z puli z powrotem na stałą listę (cofnięcie przeniesienia). */
export function moveBackFromPool(c: CategoryDraft, indexes: number[]): CategoryDraft {
  if (!c.rotation) return c;
  const taken = new Set(indexes);
  const moved = c.rotation.pool.filter((_, i) => taken.has(i));
  if (moved.length === 0) return c;
  return {
    ...c,
    items: [...c.items, ...moved],
    rotation: { ...c.rotation, pool: c.rotation.pool.filter((_, i) => !taken.has(i)) },
  };
}

/** Losuje "howMany" różnych numerów z zakresu 0..count-1 (nigdy więcej, niż jest pozycji). */
export function randomPick(howMany: number, count: number, random: () => number = Math.random): number[] {
  const all = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.max(0, Math.min(howMany, all.length)));
}

/** Czy pozycja sprzedaje się w stackach (inaczej aplikacja pokazuje tylko ceny za sztukę). */
export function isLotted(i: ShopItemDraft): boolean {
  return i.amount > 1 || i.sellAmount > 1;
}

export function newItem(ref: ItemRef): ShopItemDraft {
  return { ref, buy: 10, sell: null, amount: 1, sellAmount: 1, name: "", lore: [], instrument: "", raw: {} };
}

export function newCategory(id: string, name: string): CategoryDraft {
  return { id, name, icon: { item: "CHEST" }, items: [], rotation: null, raw: {} };
}

/** Problemy przed wysłaniem (po polsku): skup >= kupno, brak cen, puste kategorie. */
export function shopProblems(settings: ShopSettingsDraft, cats: CategoryDraft[]): string[] {
  const out: string[] = [];
  for (const c of cats) {
    const all = [...c.items, ...(c.rotation?.pool ?? [])];
    all.forEach((i, n) => {
      const what = `${c.id}: ${i.ref.custom ? `custom:${i.ref.custom}` : i.ref.item} (#${n + 1})`;
      if (i.buy == null && i.sell == null) out.push(`${what} - nie ma ani ceny kupna, ani skupu (plugin go pominie).`);
      if (i.buy != null && i.sell != null && i.sell / i.sellAmount >= i.buy / i.amount) out.push(`${what} - skup za sztukę jest co najmniej taki jak kupno.`);
    });
    if (!settings.categoryOrder.includes(c.id)) out.push(`Kategoria ${c.id} nie ma miejsca w menu głównym (sprzedaż działa, ale nie ma ikonki).`);
  }
  const slots = settings.menus["main-menu"].layout.filter((e) => e.role === "CATEGORY_SLOT").length;
  if (settings.categoryOrder.length > slots) out.push(`Menu główne ma ${slots} miejsc na kategorie, a kategorii jest ${settings.categoryOrder.length}.`);
  return out;
}
