import * as yaml from "js-yaml";
import plNames from "./itemNames/pl.yml?raw";

// Polskie nazwy przedmiotów Minecrafta - kopia słownika z pluginu Core (names/pl.yml), ten sam, który
// gracze widzą na czacie i w wyszukiwarkach. Podmieniać razem z jarem Core, gdy słownik się zmieni.
// Na razie tylko po polsku - angielski przyjdzie z tłumaczeniem całej aplikacji.

let cache: Record<string, string> | null = null;

function names(): Record<string, string> {
  if (cache) return cache;
  try {
    const root = yaml.load(plNames) as { names?: Record<string, unknown> } | null;
    cache = Object.fromEntries(Object.entries(root?.names ?? {}).map(([k, v]) => [k.toUpperCase(), String(v)]));
  } catch {
    cache = {};
  }
  return cache;
}

/** Polska nazwa materiału (DIRT -> "Ziemia"); nieznany - czytelna wersja nazwy technicznej ("moj item"). */
export function itemDisplayName(material: string): string {
  const m = material.toUpperCase();
  return names()[m] ?? m.toLowerCase().replace(/_/g, " ");
}

/** Czy słownik zna ten materiał (do podpowiedzi przy wpisywaniu). */
export function knownItemName(material: string): string | undefined {
  return names()[material.toUpperCase()];
}
