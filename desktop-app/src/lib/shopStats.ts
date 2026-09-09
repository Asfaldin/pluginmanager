import * as yaml from "js-yaml";
import type { ShopItem } from "./types";

// Mirrors DynamicPriceManager's ceny-dynamiczne.yml exactly (verified against
// DynamicPriceManager.java: field is "mnoznik", keyed by custom-id or vanilla
// Material name - same key function as ShopManager#kluczCeny).
export function parseDynamicPrices(text: string): Record<string, number> {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "_meta") continue;
    out[key] = Number(value?.mnoznik ?? 1);
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

// Mirrors StatystykiSklepu's statystyki-sklepu.yml exactly.
export function parseSalesStats(text: string): SalesStatEntry[] {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const out: SalesStatEntry[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === "_meta") continue;
    out.push({
      key,
      sztukLacznie: Number(value.sztuk ?? 0),
      wyplaconoLacznie: Number(value.wyplacono ?? 0),
      transakcji: Number(value.transakcji ?? 0),
      sztukDzis: Number(value["sztuk-dzis"] ?? 0),
      wyplaconoDzis: Number(value["wyplacono-dzis"] ?? 0),
    });
  }
  return out;
}

export function shopItemKey(item: ShopItem): string {
  return item.customId.trim() || item.material;
}

// Mirrors ShopManager#policzCene(1, buyPrice, amount) exactly. The
// "buy-price" field in categories/*.yml is the price for a whole lot of
// "amount" items, NOT a per-item price - the real in-game lore always shows
// the per-item price ("Kupno: X $ za szt."), so showing the raw buy-price
// field unqualified looks like a completely different (and "fake") number.
export function buyPricePerUnit(item: ShopItem): number {
  return Math.max(1, Math.ceil(item.buyPrice / item.amount));
}

// Mirrors DynamicPriceManager#policzCeneSkupu exactly (MAX_UDZIAL_W_CENIE_KUPNA = 0.90).
export function computeEffectiveSellPrice(baseSellPrice: number, mnoznik: number, buyPriceForSameLot: number): number {
  let cena = Math.round(baseSellPrice * mnoznik);
  if (buyPriceForSameLot > 0) {
    const sufit = Math.floor(buyPriceForSameLot * 0.9);
    if (cena > sufit) cena = sufit;
  }
  return Math.max(1, cena);
}

export interface EffectiveSellInfo {
  effective: number;
  mnoznik: number;
}

export function effectiveSellInfoFor(item: ShopItem, dynamicPrices: Record<string, number>): EffectiveSellInfo | null {
  if (item.sellPrice == null) return null;
  const mnoznik = dynamicPrices[shopItemKey(item)];
  if (mnoznik == null) return null;
  const sellAmount = item.sellAmount ?? item.amount;
  const buyForLot = Math.round((item.buyPrice / item.amount) * sellAmount);
  return { effective: computeEffectiveSellPrice(item.sellPrice, mnoznik, buyForLot), mnoznik };
}
