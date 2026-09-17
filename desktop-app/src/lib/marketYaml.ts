import * as yaml from "js-yaml";

// market.yml pluginu Targu (mainplugins-market). Czysta logika bez serwera - testy w marketYaml.test.ts.
// Nieznane pola zostają w `raw` i wracają do pliku przy zapisie.

type Obj = Record<string, unknown>;

export interface MarketButton {
  slot: number;
  material: string;
}

export interface MarketConfig {
  defaultLimit: number;
  minPrice: number;
  maxPrice: number;
  expireDays: number;
  mailbox: boolean;
  taxEnabled: boolean;
  taxPercent: number;
  title: string;
  background: string;
  buttons: Record<string, MarketButton>;
  raw: Obj;
}

/** Miejsca na oferty - blok 7x3 w środku okna (jak w pluginie). */
export const OFFER_SLOTS = [10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33, 34];

export const BUTTON_IDS = ["prev", "next", "search", "mine", "close", "sort", "mailbox"];

export const BUTTON_LABELS: Record<string, string> = {
  prev: "Poprzednia strona",
  next: "Następna strona",
  search: "Szukaj",
  mine: "Moje oferty",
  close: "Zamknij / wróć do menu",
  sort: "Sortowanie",
  mailbox: "Do odebrania",
};

const DEFAULT_BUTTONS: Record<string, MarketButton> = {
  prev: { slot: 45, material: "SPECTRAL_ARROW" },
  next: { slot: 53, material: "SPECTRAL_ARROW" },
  search: { slot: 46, material: "OAK_SIGN" },
  mine: { slot: 47, material: "HOPPER" },
  close: { slot: 49, material: "BARRIER" },
  sort: { slot: 51, material: "COMPARATOR" },
  mailbox: { slot: 52, material: "CHEST" },
};

const HEADER = "# Mainplugins Market - settings (edited in the PluginManager app). Texts are in lang/en.yml and lang/pl.yml.\n";

export function defaultMarket(): MarketConfig {
  return {
    defaultLimit: 10,
    minPrice: 1,
    maxPrice: 10000000,
    expireDays: 7,
    mailbox: true,
    taxEnabled: false,
    taxPercent: 5,
    title: "",
    background: "GRAY_STAINED_GLASS_PANE",
    buttons: structuredClone(DEFAULT_BUTTONS),
    raw: {},
  };
}

function obj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function parseMarketYaml(text: string): MarketConfig {
  const raw = obj(text.trim() ? yaml.load(text) : {});
  const d = defaultMarket();
  const menu = obj(raw.menu);
  const rawButtons = obj(menu.buttons);
  const buttons: Record<string, MarketButton> = {};
  for (const id of BUTTON_IDS) {
    const b = obj(rawButtons[id]);
    buttons[id] = {
      slot: num(b.slot, d.buttons[id].slot),
      material: typeof b.material === "string" ? b.material : d.buttons[id].material,
    };
  }
  return {
    defaultLimit: num(obj(raw.limits).default, d.defaultLimit),
    minPrice: num(raw["min-price"], d.minPrice),
    maxPrice: num(raw["max-price"], d.maxPrice),
    expireDays: num(raw["expire-days"], d.expireDays),
    mailbox: typeof raw.mailbox === "boolean" ? raw.mailbox : d.mailbox,
    // Stare pliki mialy samo tax-percent (0 = brak podatku) - czytamy oba zapisy.
    taxEnabled:
      typeof obj(raw.tax).enabled === "boolean" ? (obj(raw.tax).enabled as boolean) : num(raw["tax-percent"], 0) > 0,
    taxPercent: num(obj(raw.tax).percent, num(raw["tax-percent"], d.taxPercent)),
    title: typeof menu.title === "string" ? menu.title : d.title,
    background: typeof menu.background === "string" ? menu.background : d.background,
    buttons,
    raw,
  };
}

export function serializeMarketYaml(c: MarketConfig): string {
  const menu = obj(c.raw.menu);
  const rawButtons = obj(menu.buttons);
  const buttons: Obj = { ...rawButtons };
  for (const id of BUTTON_IDS) buttons[id] = { ...obj(rawButtons[id]), slot: c.buttons[id].slot, material: c.buttons[id].material };
  const out: Obj = {
    ...c.raw,
    limits: { ...obj(c.raw.limits), default: c.defaultLimit },
    "min-price": c.minPrice,
    "max-price": c.maxPrice,
    "expire-days": c.expireDays,
    mailbox: c.mailbox,
    tax: { enabled: c.taxEnabled, percent: c.taxPercent },
    menu: { ...menu, title: c.title, background: c.background, buttons },
  };
  return HEADER + yaml.dump(out, { lineWidth: -1, noRefs: true, flowLevel: 3 });
}

/** Problemy, przez które plugin pominie przycisk albo ustawienie (po polsku, do pokazania przed wysłaniem). */
export function marketProblems(c: MarketConfig): string[] {
  const out: string[] = [];
  const used = new Map<number, string>();
  for (const id of BUTTON_IDS) {
    const b = c.buttons[id];
    const name = BUTTON_LABELS[id];
    if (b.slot < 0 || b.slot > 53) out.push(`Przycisk „${name}” ma pole spoza okna (${b.slot}).`);
    else if (OFFER_SLOTS.includes(b.slot)) out.push(`Przycisk „${name}” stoi na polu ofert (${b.slot}) - nie pokaże się.`);
    else if (used.has(b.slot)) out.push(`Przyciski „${used.get(b.slot)}” i „${name}” są na tym samym polu (${b.slot}).`);
    else used.set(b.slot, name);
  }
  if (c.defaultLimit < 1) out.push("Limit ofert musi wynosić co najmniej 1.");
  if (c.minPrice < 1 || c.maxPrice < c.minPrice) out.push("Ceny: najniższa musi być co najmniej 1 i nie większa od najwyższej.");
  if (c.taxPercent < 0 || c.taxPercent > 100) out.push("Podatek musi być od 0 do 100%.");
  if (c.expireDays < 0) out.push("Wygasanie nie może być ujemne (0 = nigdy).");
  return out;
}
