import * as yaml from "js-yaml";
import type { ShopGuiContent, ShopScreen, ShopSlotEntry } from "./types";

function parseScreen(raw: any): ShopScreen {
  const layout: ShopSlotEntry[] = Array.isArray(raw?.layout)
    ? raw.layout.map((e: any) => {
        const entry: ShopSlotEntry = { slot: Number(e.slot), role: e.role };
        if (e.material != null) entry.material = String(e.material);
        if (e.amount != null) entry.amount = Number(e.amount);
        return entry;
      })
    : [];
  return { size: Number(raw?.size ?? 54), layout };
}

export function parseShopGuiContent(text: string): ShopGuiContent {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  return {
    categoryOrder: Array.isArray(raw["category-order"]) ? raw["category-order"].map(String) : [],
    mainMenu: parseScreen(raw["main-menu"]),
    categoryPage: parseScreen(raw["category-page"]),
    buyPicker: parseScreen(raw["buy-picker"]),
    searchResults: parseScreen(raw["search-results"]),
  };
}

function serializeScreen(screen: ShopScreen): Record<string, any> {
  return {
    size: screen.size,
    layout: screen.layout.map((e) => {
      const out: Record<string, any> = { slot: e.slot, role: e.role };
      if (e.material) out.material = e.material;
      if (e.amount != null) out.amount = e.amount;
      return out;
    }),
  };
}

export function serializeShopGuiContent(content: ShopGuiContent): string {
  const out: Record<string, any> = {
    "main-menu": serializeScreen(content.mainMenu),
    "category-page": serializeScreen(content.categoryPage),
    "buy-picker": serializeScreen(content.buyPicker),
    "search-results": serializeScreen(content.searchResults),
    "category-order": content.categoryOrder,
  };
  return yaml.dump(out, { lineWidth: -1 });
}
