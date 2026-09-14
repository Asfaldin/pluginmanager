import * as yaml from "js-yaml";
import { itemRefFromYaml as itemRef, itemRefToYaml as refOut, type ItemRef } from "./itemRef";
import { parseRewards, rewardsToYaml, type Reward } from "./rewards";

export type { ItemRef } from "./itemRef";

// plugins/MainpluginsCrates/crates.yml - skrzynki, klucze, wygrane (patrz spec pilota Skrzynek).

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
  /** Napis nad postawioną skrzynką (puste = nazwa + podpowiedź z pliku językowego pluginu). */
  hologram: string[];
  /** false = brak napisu nad tą skrzynką (hologram-enabled). */
  hologramEnabled: boolean;
}

// Ta sama podpowiedź co placed.hint w lang/en.yml i lang/pl.yml pluginu Skrzynek.
const HOLOGRAM_HINT: Record<string, string> = {
  pl: "&7Prawy klik z kluczem &8• &7Lewy klik: nagrody",
  en: "&7Right-click with a key &8• &7Left-click: rewards",
};

/** Napis, który plugin pokazuje, gdy skrzynka nie ma własnego (nazwa + podpowiedź w języku serwera). */
export function defaultHologram(c: CrateDef, language: string): string[] {
  return [c.name, HOLOGRAM_HINT[language] ?? HOLOGRAM_HINT.en];
}

export interface CratesSettings {
  /** Ile bloków nad postawioną skrzynką wisi napis (settings.hologram-height). */
  hologramHeight: number;
  /** Postawiony blok przyjmuje wygląd przedmiotu skrzynki (settings.placed-block-from-item). */
  placedBlockFromItem: boolean;
}

export interface CratesFile {
  settings: CratesSettings;
  keys: KeyDef[];
  crates: CrateDef[];
}

export const DEFAULT_HOLOGRAM_HEIGHT = 0.6;

const HEADER =
  "# Skrzynki - zarządzane przez aplikację (komentarze nie są zachowywane). Po zmianach: /@crate reload.\n";

function lore(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((l) => (l == null ? "" : String(l))) : [];
}

export function parseCratesYaml(text: string): CratesFile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (text.trim() ? yaml.load(text) : {}) as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keys = Object.entries((raw?.keys ?? {}) as Record<string, any>).map(([id, v]) => ({
    id,
    name: v?.name != null ? String(v.name) : id,
    lore: lore(v?.lore),
    item: itemRef(v?.item),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crates = Object.entries((raw?.crates ?? {}) as Record<string, any>).map(([id, v]) => ({
    id,
    name: v?.name != null ? String(v.name) : id,
    lore: lore(v?.lore),
    item: itemRef(v?.item),
    keys: Array.isArray(v?.keys) ? v.keys.map(String) : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prizes: (Array.isArray(v?.prizes) ? v.prizes : []).map((p: any) => ({
      name: p?.name != null ? String(p.name) : "Prize",
      icon: itemRef(p?.icon),
      weight: typeof p?.weight === "number" ? p.weight : 1,
      announce: p?.announce === true,
      rewards: parseRewards(p?.rewards),
    })),
    hologram: lore(v?.hologram),
    hologramEnabled: v?.["hologram-enabled"] !== false,
  }));
  const h = raw?.settings?.["hologram-height"];
  const settings: CratesSettings = {
    hologramHeight: typeof h === "number" ? h : DEFAULT_HOLOGRAM_HEIGHT,
    placedBlockFromItem: raw?.settings?.["placed-block-from-item"] !== false,
  };
  return { settings, keys, crates };
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
      ...(c.hologram.length ? { hologram: c.hologram } : {}),
      ...(c.hologramEnabled ? {} : { "hologram-enabled": false }),
      prizes: c.prizes.map((p) => ({
        name: p.name,
        icon: refOut(p.icon),
        weight: p.weight,
        ...(p.announce ? { announce: true } : {}),
        rewards: rewardsToYaml(p.rewards),
      })),
    };
  }
  const settings = {
    "hologram-height": f.settings.hologramHeight,
    "placed-block-from-item": f.settings.placedBlockFromItem,
  };
  return HEADER + yaml.dump({ settings, keys, crates }, { lineWidth: -1, noRefs: true });
}

export function chancePercent(c: CrateDef, p: Prize): number {
  const total = c.prizes.reduce((s, x) => s + Math.max(0, x.weight), 0);
  return total > 0 ? (Math.max(0, p.weight) * 100) / total : 0;
}

// Wagi liczone tak, że 10000 = 100% - szansę da się ustawić z dokładnością do 0,01%.
const WEIGHT_SCALE = 100;

/**
 * Ustawia szansę wygranej `index` w procentach. Pozostałe dzielą resztę do 100% w tych samych
 * proporcjach co wcześniej. Plugin dalej dostaje wagi (liczby całkowite >= 1).
 */
export function setChancePercent(prizes: Prize[], index: number, percent: number): Prize[] {
  if (prizes.length <= 1) return prizes.map((p) => ({ ...p, weight: 100 * WEIGHT_SCALE }));
  const minPct = 1 / WEIGHT_SCALE;
  const others = prizes.filter((_, i) => i !== index);
  const pct = Math.min(100 - minPct * others.length, Math.max(minPct, percent));
  const othersTotal = others.reduce((s, p) => s + Math.max(0, p.weight), 0);
  const rest = (100 - pct) * WEIGHT_SCALE;
  return prizes.map((p, i) => {
    if (i === index) return { ...p, weight: Math.max(1, Math.round(pct * WEIGHT_SCALE)) };
    const share = othersTotal > 0 ? Math.max(0, p.weight) / othersTotal : 1 / others.length;
    return { ...p, weight: Math.max(1, Math.round(share * rest)) };
  });
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

/** Usuwa skrzynkę razem z jej własnym kluczem „<id>_key” - chyba że ten klucz otwiera jeszcze inną skrzynkę. */
export function removeCrate(f: CratesFile, id: string): CratesFile {
  const crates = f.crates.filter((c) => c.id !== id);
  const ownKey = `${id}_key`;
  const stillUsed = crates.some((c) => c.keys.includes(ownKey));
  return { ...f, crates, keys: stillUsed ? f.keys : f.keys.filter((k) => k.id !== ownKey) };
}

/** Usuwa klucz i odpina go od wszystkich skrzynek. */
export function removeKey(f: CratesFile, id: string): CratesFile {
  return {
    ...f,
    keys: f.keys.filter((k) => k.id !== id),
    crates: f.crates.map((c) => (c.keys.includes(id) ? { ...c, keys: c.keys.filter((k) => k !== id) } : c)),
  };
}

/**
 * ID do komend (np. /@crate give gracz letnia_skrzynka) z nazwy wpisanej przez człowieka:
 * bez kolorów (&6), polskich liter i spacji; zajęte -> _2, _3...
 */
export function idFromName(name: string, taken: string[]): string {
  const base =
    name
      .replace(/&[0-9a-fk-or]/gi, "")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "crate";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Nowa skrzynka zawsze z własnym kluczem "<id>_key" (domyślnie każda skrzynka ma swój klucz). */
export function addCrate(f: CratesFile, id: string, displayName: string = id): CratesFile {
  const keyId = `${id}_key`;
  const keys = f.keys.some((k) => k.id === keyId)
    ? f.keys
    : [...f.keys, { id: keyId, name: `&e&l${displayName} Key`, lore: [], item: { item: "TRIPWIRE_HOOK" } }];
  const crate: CrateDef = {
    id,
    name: `&6&l${displayName}`,
    lore: ["&7Right-click with a key to open.", "&7Left-click to see the rewards."],
    item: { item: "CHEST" },
    keys: [keyId],
    prizes: [emptyPrize()],
    hologram: [],
    hologramEnabled: true,
  };
  return { ...f, keys, crates: [...f.crates, crate] };
}
