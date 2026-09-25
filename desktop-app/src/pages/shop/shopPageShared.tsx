import type { ItemRef } from "../../lib/itemRef";
import { conventionalRoleIcon } from "../../lib/materialIcons";
import { num, plural } from "../../lib/plText";
import { defaultAnnounceTexts, type AnnounceGroup, type AnnounceTexts } from "../../lib/shopAnnounce";
import type { ShopTemplate } from "../../lib/shopTemplates";
import {
  defaultSettings,
  parseCategory,
  parseShopSettings,
  serializeCategory,
  serializeShopSettings,
  type CategoryDraft,
  type ShopSettingsDraft,
  type TuningDraft,
} from "../../lib/shopYaml";

/** Typy, stałe i drobne pomocnicze funkcje strony Sklepu - wspólne dla strony i jej okienek. */

export interface ShopFile {
  settings: ShopSettingsDraft;
  cats: CategoryDraft[];
  /** Teksty ogłoszeń na czacie - z lang/<język>.yml pluginu, nie z shop.yml. */
  texts: AnnounceTexts;
}

export type Sel = { kind: "cat" } | { kind: "item"; pool: boolean; index: number };
export type Tab = "cats" | "settings" | "stats" | "menu";
export type SettingsSection = "prices" | "dynamic" | "texts";

export const EMPTY: ShopFile = { settings: defaultSettings(), cats: [], texts: defaultAnnounceTexts("en") };

export const ANNOUNCE_GROUPS: Array<[AnnounceGroup, string]> = [
  ["rotation", "Rotacja - nowa oferta w kategorii"],
  ["reset", "Reset cen"],
  ["event", "Eventy na skup"],
];
export const GOAT_HORNS = ["ponder_goat_horn", "sing_goat_horn", "seek_goat_horn", "feel_goat_horn", "admire_goat_horn", "call_goat_horn", "yearn_goat_horn", "dream_goat_horn"];
// Ktory przycisk z "Ikonki przyciskow" odpowiada ktorej roli pola w ukladzie. "sort-sell"
// to tylko druga ikonka tego samego przycisku sortowania, wiec nie ma wlasnej roli.
export const BUTTON_ROLES: Record<string, string> = {
  search: "SEARCH",
  exit: "EXIT",
  back: "NAV_BACK",
  prev: "NAV_PREV",
  next: "NAV_NEXT",
  sort: "SORT",
  "picker-back": "NAV_BACK",
};

/**
 * Ikonka przycisku w podglądzie - taka, jaką ma w grze: z "Ikonek przycisków" (menus.buttons).
 * Powrót w wyborze ilości to osobny przycisk ("picker-back"), na innych ekranach - "back" (kompas).
 */
export function roleMaterial(role: string, sc: string, buttons: Record<string, string>): string | undefined {
  const id =
    role === "NAV_BACK"
      ? sc === "buy-picker"
        ? "picker-back"
        : "back"
      : Object.entries(BUTTON_ROLES).find(([k, r]) => r === role && k !== "back" && k !== "picker-back")?.[0];
  return (id && buttons[id]) || conventionalRoleIcon(role);
}

export const ROLES_BY_SCREEN: Record<string, string[]> = {
  "main-menu": ["CATEGORY_SLOT", "SEARCH", "EXIT", "FILLER"],
  "category-page": ["ITEM_SLOT", "ROTATION_SLOT", "SORT", "NAV_PREV", "NAV_NEXT", "NAV_BACK", "EXIT", "FILLER"],
  "buy-picker": ["AMOUNT_SLOT", "NAV_BACK", "FILLER"],
  "search-results": ["ITEM_SLOT", "NAV_BACK", "FILLER"],
};

/** Pola strojenia cen dynamicznych: nazwa w kodzie, podpis, krok, podpowiedź, jednostka i mnożnik
    (100 = w pliku ułamek 0.05, a w aplikacji pokazujemy 5 %). */
export const TUNING_FIELDS: Array<[keyof TuningDraft, string, string, (v: number) => string, string, number]> = [
  ["maxDropPerCycle", "Największy spadek skupu na cykl", "1", (v) => `W jednym cyklu skup spada najwyżej o ${num(v)}% (domyślnie 5)`, "%", 100],
  ["dropAtTop", "Ile razy mocniejszy spadek na maksimum", "0.1", (v) => `Na samej górze skup spada ${num(v)} razy szybciej (domyślnie 4,2)`, "razy", 1],
  ["recoverFromBelow", "Ile drogi wraca w cyklu ciszy", "5", (v) => `Zbita cena odrabia ${num(v)}% straty w każdym cyklu ciszy (domyślnie 80)`, "%", 100],
  ["risePerCycle", "Wzrost na cykl, gdy nikt nie sprzedaje", "0.5", (v) => `Gdy nikt nie sprzedaje, skup rośnie o ${num(v)}% na cykl (domyślnie 12,5)`, "%", 100],
  ["quietThreshold", "Poniżej jakiej części normy to cisza", "5", (v) => `Sprzedaż poniżej ${num(v)}% zwykłej liczy się jako „cisza” (domyślnie 10)`, "% normy", 100],
  ["cyclesToRise", "Ile cykli ciszy przed wzrostem", "1", (v) => `Cena zaczyna rosnąć po ${num(v)} ${v === 1 ? "cyklu" : "cyklach"} ciszy (domyślnie 2)`, "cykle", 1],
  ["cyclesFrozen", "Ile cykli cena stoi po zejściu z góry", "1", (v) => `Po zejściu z maksimum cena stoi ${num(v)} ${plural(v, "cykl", "cykle", "cykli")} (domyślnie 2)`, "cykle", 1],
  ["normLearnRate", "Jak szybko sklep zapomina stare cykle", "0.5", () => "Mniej = sklep dłużej pamięta stare cykle, więcej = szybciej zapomina (domyślnie 2)", "%", 100],
];

export function shopDir(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsShop`;
}

export function serializeAll(f: ShopFile): string {
  return serializeShopSettings(f.settings) + f.cats.map((c) => `\n#### ${c.id}\n${serializeCategory(c)}`).join("") + `\n#### texts\n${JSON.stringify(f.texts)}`;
}

/** Kategorie w kolejności z shop.yml, reszta na końcu. */
export function ordered(settings: ShopSettingsDraft, cats: CategoryDraft[]): CategoryDraft[] {
  const inOrder = settings.categoryOrder.map((id) => cats.find((c) => c.id === id)).filter((c): c is CategoryDraft => !!c);
  return [...inOrder, ...cats.filter((c) => !settings.categoryOrder.includes(c.id))];
}

export function fromTemplate(t: ShopTemplate, texts: AnnounceTexts): ShopFile {
  const settings = parseShopSettings(t["shop.yml"]);
  return { settings, cats: ordered(settings, Object.entries(t.categories).map(([id, text]) => parseCategory(id, text))), texts };
}

/** Czy dwa obiekty mają te same wartości, niezależnie od kolejności pól (do wyszarzania "Przywróć domyślne"). */
export function sameValues(a: unknown, b: unknown): boolean {
  const sorted = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])]))
      : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

export function plain(text: string): string {
  return text.replace(/&[0-9a-fk-or]/gi, "");
}

/** Nazwa przedmiotu bez własnej nazwy w sklepie. `customNames` = ludzkie nazwy custom itemów (np. "Spawner: Krowa"). */
export function refLabel(r: ItemRef, customNames: Record<string, string> = {}): string {
  if (r.custom != null) return customNames[r.custom] ?? `custom: ${r.custom}`;
  return (r.item ?? "STONE").toLowerCase().replace(/_/g, " ");
}

/** Znaczek waluty serwera (config.yml core, "currency"); ustawiany przy wczytaniu sklepu. */
let currencySign = "$";

export function setCurrencySign(sign: string) {
  currencySign = sign;
}

/** Kwota ze znaczkiem, zeby bylo widac, ze to pieniadze, a nie ilosc sztuk. */
export function money(n: number | null): string {
  if (n == null) return "-";
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + currencySign;
}
