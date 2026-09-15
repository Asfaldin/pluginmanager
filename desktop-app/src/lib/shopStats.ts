import * as yaml from "js-yaml";

// Dane Sklepu z serwera (tylko do podglądu): prices.yml (mnożniki cen dynamicznych) i stats.yml (sprzedaż).
// Klucze = klucz pozycji jak w pluginie: "DIAMOND" albo "custom:spawner_zombie".

/** prices.yml: <klucz>.multiplier. */
export function parseDynamicPrices(text: string): Record<string, number> {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "_meta") continue;
    out[key] = Number(value?.multiplier ?? 1);
  }
  return out;
}

export interface SalesStatEntry {
  key: string;
  sztukLacznie: number;
  wyplaconoLacznie: number;
  transakcji: number;
  sztukDzis: number;
  wyplaconoDzis: number;
}

/** stats.yml (ShopStats w pluginie). */
export function parseSalesStats(text: string): SalesStatEntry[] {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const out: SalesStatEntry[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === "_meta") continue;
    out.push({
      key,
      sztukLacznie: Number(value?.sztuk ?? 0),
      wyplaconoLacznie: Number(value?.wyplacono ?? 0),
      transakcji: Number(value?.transakcji ?? 0),
      sztukDzis: Number(value?.["sztuk-dzis"] ?? 0),
      wyplaconoDzis: Number(value?.["wyplacono-dzis"] ?? 0),
    });
  }
  return out;
}

/** Klucz pozycji jak w pluginie (ShopItem.key()). */
export function itemKey(ref: { item?: string; custom?: string }): string {
  return ref.custom != null ? `custom:${ref.custom.toLowerCase()}` : (ref.item ?? "STONE");
}
