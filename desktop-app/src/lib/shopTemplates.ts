import bigPlRaw from "./shopTemplates/big-pl.json?raw";
import smallEnRaw from "./shopTemplates/small-en.json?raw";
import smallPlRaw from "./shopTemplates/small-pl.json?raw";

// Gotowe sklepy do wczytania w edytorze (scripts/convert-big-shop.mjs). Mały = to, co plugin wgrywa sam przy
// pierwszym starcie (ceny za sztukę, grosze). Duży = nasz sklep (paczki, pełne złotówki, rotacja, spawnery).

export interface ShopTemplate {
  "shop.yml": string;
  categories: Record<string, string>;
}

const bigPl = JSON.parse(bigPlRaw) as ShopTemplate;
const smallEn = JSON.parse(smallEnRaw) as ShopTemplate;
const smallPl = JSON.parse(smallPlRaw) as ShopTemplate;

/** Domyślny sklep dla języka serwera (jak w pluginie). */
export function shopTemplateFor(language: string): ShopTemplate {
  return language === "pl" ? smallPl : smallEn;
}

/** Wybór w aplikacji: Mały w języku serwera, Duży na razie tylko po polsku. */
export function shopTemplateChoices(language: string): { id: "small" | "big"; label: string; template: ShopTemplate }[] {
  return [
    { id: "small", label: "Mały - 5 kategorii, ceny za sztukę", template: shopTemplateFor(language) },
    { id: "big", label: "Duży - 10 kategorii, nasz sklep (po polsku)", template: bigPl },
  ];
}
