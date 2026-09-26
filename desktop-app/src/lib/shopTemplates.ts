import bigPlRaw from "./shopTemplates/big-pl.json?raw";
import smallEnRaw from "./shopTemplates/small-en.json?raw";
import smallPlRaw from "./shopTemplates/small-pl.json?raw";
import { defaultSettings, serializeShopSettings } from "./shopYaml";

// Gotowe sklepy do wczytania w edytorze (scripts/make-big-template.ts i scripts/make-templates.ts).
// Gotowy (big) = to samo, co plugin wgrywa na nowym polskim serwerze. Do edycji (small) = prosta baza do przerobienia.
// Na razie wszystko po polsku - angielski Mały zostaje ze starej wersji, dopóki aplikacja nie dostanie tłumaczenia.

export interface ShopTemplate {
  "shop.yml": string;
  categories: Record<string, string>;
}

const bigPl = JSON.parse(bigPlRaw) as ShopTemplate;
const smallEn = JSON.parse(smallEnRaw) as ShopTemplate;
const smallPl = JSON.parse(smallPlRaw) as ShopTemplate;

/** Pusty sklep: bez kategorii, zwykły układ okien. */
export function emptyShopTemplate(): ShopTemplate {
  return { "shop.yml": serializeShopSettings(defaultSettings()), categories: {} };
}

/** To, co plugin wgrywa sam na nowym serwerze (po polsku Duży) - aplikacja pokazuje to samo, gdy sklepu jeszcze nie ma. */
export function shopTemplateFor(language: string): ShopTemplate {
  return language === "pl" ? bigPl : smallEn;
}

export type ShopTemplateId = "big" | "small" | "empty";

/** Wybór w aplikacji. */
export function shopTemplateChoices(language: string): { id: ShopTemplateId; label: string; template: ShopTemplate }[] {
  return [
    { id: "big", label: "Gotowy", template: bigPl },
    { id: "small", label: "Do edycji", template: language === "pl" ? smallPl : smallEn },
    { id: "empty", label: "Pusty", template: emptyShopTemplate() },
  ];
}

/** Szablon z pliku (zapisany przez „Zapisz sklep jako szablon”); null = to nie jest szablon sklepu. */
export function parseShopTemplateFile(text: string): ShopTemplate | null {
  try {
    const t = JSON.parse(text) as Partial<ShopTemplate>;
    if (typeof t["shop.yml"] !== "string" || !t.categories || typeof t.categories !== "object") return null;
    if (!Object.values(t.categories).every((v) => typeof v === "string")) return null;
    return { "shop.yml": t["shop.yml"], categories: t.categories as Record<string, string> };
  } catch {
    return null;
  }
}
