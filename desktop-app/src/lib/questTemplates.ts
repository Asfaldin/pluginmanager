import bigPl from "./questTemplates/big-pl.yml?raw";
import smallEn from "./questTemplates/small-en.yml?raw";
import smallPl from "./questTemplates/small-pl.yml?raw";

// Gotowe zestawy questów do wczytania w edytorze. Małe = to, co plugin wgrywa sam przy pierwszym starcie
// (kopie defaults/quests-*.yml z pluginu). Duży = pełne questy naszego serwera (scripts/convert-big-quests.mjs).
export const QUEST_TEMPLATES: { id: "small-en" | "small-pl" | "big-pl"; label: string; text: string }[] = [
  { id: "small-en", label: "Mały, angielski - 6 kategorii, 35 zadań", text: smallEn },
  { id: "small-pl", label: "Mały, polski - 6 kategorii, 35 zadań", text: smallPl },
  { id: "big-pl", label: "Duży, polski - 17 kategorii (pełne questy naszego serwera)", text: bigPl },
];

/** Domyślny zestaw dla języka serwera (jak w pluginie). */
export function templateFor(language: string): string {
  return language === "pl" ? smallPl : smallEn;
}

/**
 * Wybór w aplikacji: dwa szablony, język według serwera. Duży jest na razie tylko po polsku
 * (tłumaczenie na angielski - zadanie na później).
 */
export function templateChoices(language: string): { id: "small" | "big"; label: string; text: string }[] {
  return [
    { id: "small", label: "Mały - 6 kategorii, 35 zadań", text: templateFor(language) },
    { id: "big", label: `Duży - 17 kategorii${language === "pl" ? "" : " (na razie po polsku)"}`, text: bigPl },
  ];
}
