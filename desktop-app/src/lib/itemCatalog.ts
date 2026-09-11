import * as yaml from "js-yaml";
import type { CustomItemEntry, ItemEnchant } from "./types";

// Katalog itemów mainplugins-core: folder plugins/MainpluginsCore/items/, każdy *.yml
// ma sekcję "items:". Czysta logika (bez serwera) - czytanie i zapis jednego pliku,
// wykrywanie duplikatów i tego, które pliki trzeba wysłać po edycji.

export const ITEMS_FOLDER = "MainpluginsCore/items";
export const DEFAULT_FILE = "my-items.yml";

const HEADER =
  "# Katalog itemów - zarządzany przez aplikację (komentarze nie są zachowywane).\n" +
  "# Wydawanie: /@dajcustom <id> [gracz] [ilość]. Przeładowanie: /@reloadcustomitems.";

// Linijka lore będąca samym "~" to w YAML null - przywracamy najbardziej prawdopodobny tekst.
function loreLine(raw: unknown): string {
  return raw == null ? "~" : String(raw);
}

function parseEnchants(raw: unknown): ItemEnchant[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>)
    .map(([name, level]) => ({ name: name.toLowerCase(), level: Number(level) }))
    .filter((e) => Number.isFinite(e.level) && e.level >= 1);
}

export function parseItemsFile(file: string, text: string): CustomItemEntry[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const items = (raw.items ?? {}) as Record<string, any>;
  return Object.entries(items).map(([id, v]) => ({
    id,
    file,
    material: v?.material ?? "STONE",
    name: v?.name ?? "",
    lore: Array.isArray(v?.lore) ? v.lore.map(loreLine) : [],
    model: v?.model ?? "",
    glint: Boolean(v?.glint ?? false),
    enchants: parseEnchants(v?.enchants),
    unbreakable: Boolean(v?.unbreakable ?? false),
  }));
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function serializeItemsFile(items: CustomItemEntry[]): string {
  if (items.length === 0) return `${HEADER}\nitems: {}\n`;
  const lines = [HEADER, "items:"];
  for (const item of items) {
    lines.push(`  ${item.id}:`);
    lines.push(`    material: ${item.material}`);
    if (item.name.trim()) lines.push(`    name: ${quote(item.name)}`);
    if (item.lore.length > 0) {
      lines.push("    lore:");
      for (const line of item.lore) lines.push(`      - ${quote(line)}`);
    }
    if (item.model.trim()) lines.push(`    model: ${quote(item.model.trim())}`);
    if (item.glint) lines.push("    glint: true");
    if (item.enchants.length > 0) {
      lines.push("    enchants:");
      for (const e of item.enchants) lines.push(`      ${e.name.toLowerCase()}: ${e.level}`);
    }
    if (item.unbreakable) lines.push("    unbreakable: true");
  }
  return lines.join("\n") + "\n";
}

/** Id użyte więcej niż raz (bez rozróżniania wielkości liter - tak szuka plugin). */
export function duplicateIds(items: CustomItemEntry[]): string[] {
  const seen = new Map<string, string>();
  const dups = new Set<string>();
  for (const it of items) {
    const key = it.id.toLowerCase();
    if (seen.has(key)) dups.add(seen.get(key)!);
    else seen.set(key, it.id);
  }
  return [...dups];
}

function byFile(items: CustomItemEntry[]): Map<string, CustomItemEntry[]> {
  const map = new Map<string, CustomItemEntry[]>();
  for (const it of items) map.set(it.file, [...(map.get(it.file) ?? []), it]);
  return map;
}

/** Pliki, których zawartość po edycji różni się od stanu z serwera (też opróżnione i nowe). */
export function changedFiles(before: CustomItemEntry[], after: CustomItemEntry[]): string[] {
  const a = byFile(before);
  const b = byFile(after);
  const files = new Set([...a.keys(), ...b.keys()]);
  return [...files].filter((f) => serializeItemsFile(a.get(f) ?? []) !== serializeItemsFile(b.get(f) ?? []));
}

export function itemsOfFile(items: CustomItemEntry[], file: string): CustomItemEntry[] {
  return items.filter((it) => it.file === file);
}

const CATEGORY_NAMES: Record<string, string> = {
  "my-items.yml": "Moje itemy",
  "fishing.yml": "Łowienie",
  "quests.yml": "Questy",
  "examples.yml": "Przykłady",
};

/** Plik katalogu jako kategoria w aplikacji: znane pliki po polsku, reszta = nazwa bez .yml. */
export function categoryLabel(file: string): string {
  const known = CATEGORY_NAMES[file.toLowerCase()];
  if (known) return known;
  const base = file.replace(/\.yml$/i, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Uzupełnia pola, których nie mają stare zapisane presety (sprzed folderu items/). */
export function normalizeEntry(e: CustomItemEntry): CustomItemEntry {
  return {
    ...e,
    file: e.file || DEFAULT_FILE,
    lore: e.lore ?? [],
    model: e.model ?? "",
    glint: Boolean(e.glint),
    enchants: e.enchants ?? [],
    unbreakable: Boolean(e.unbreakable),
  };
}
