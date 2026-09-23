import * as yaml from "js-yaml";

// Teksty ogłoszeń Sklepu na czacie. Plugin trzyma je w lang/<język>.yml (plik na serwerze
// nadpisuje domyślne z jara, brakujące klucze biorą się z jara), więc aplikacja zmienia
// tylko te konkretne linijki, a resztę pliku zostawia nietkniętą.

export type AnnounceGroup = "rotation" | "reset" | "event";

export interface AnnounceField {
  key: string;
  group: AnnounceGroup;
  label: string;
  /** Wstawki, które plugin podmienia w tym tekście. */
  placeholders: string[];
}

export const ANNOUNCE_FIELDS: AnnounceField[] = [
  { key: "rotation.broadcast-header", group: "rotation", label: "Nagłówek", placeholders: ["category", "days"] },
  { key: "rotation.broadcast-item", group: "rotation", label: "Linijka z każdym przedmiotem", placeholders: ["item", "price", "amount"] },
  { key: "rotation.broadcast-footer", group: "rotation", label: "Stopka", placeholders: ["category", "days"] },
  { key: "dynamic.reset-broadcast", group: "reset", label: "Ceny wróciły do normy", placeholders: [] },
  { key: "event.broadcast-up", group: "event", label: "Skup drożej (bez końca)", placeholders: ["item", "percent"] },
  { key: "event.broadcast-up-timed", group: "event", label: "Skup drożej (na czas)", placeholders: ["item", "percent", "time"] },
  { key: "event.broadcast-down", group: "event", label: "Skup taniej (bez końca)", placeholders: ["item", "percent"] },
  { key: "event.broadcast-down-timed", group: "event", label: "Skup taniej (na czas)", placeholders: ["item", "percent", "time"] },
  { key: "event.broadcast-off", group: "event", label: "Koniec eventu na przedmiot", placeholders: ["item"] },
  { key: "event.broadcast-all-off", group: "event", label: "Koniec wszystkich eventów", placeholders: [] },
];

export const PLACEHOLDER_LABELS: Record<string, string> = {
  category: "nazwa kategorii",
  days: "ile dni",
  item: "nazwa przedmiotu",
  price: "cena",
  amount: "ilość sztuk",
  percent: "procent",
  time: "czas trwania",
};

/** Co dokładnie wstawi sklep w miejsce każdej ramki - do okienka "?" przy tekstach. */
export const PLACEHOLDER_HELP: Record<string, string> = {
  category: "nazwa kategorii, w której wylosowała się nowa oferta (np. Bloki, Kolekcja)",
  days: "za ile dni oferta się zmieni (ustawienie „Co ile dni nowa oferta” w kategorii)",
  item: "nazwa przedmiotu (w ogłoszeniu rotacji - każdy wylosowany po kolei, w evencie - ten z komendy)",
  price: "cena przedmiotu w sklepie",
  amount: "ile sztuk dostaje się za tę cenę",
  percent: "o ile procent zmienia się skup w evencie (liczba z komendy /@shop event)",
  time: "jak długo trwa event (np. 2h, 30m, 3d - z komendy)",
};

/** Przykładowe wartości do podglądu w Ustawieniach. */
export const SAMPLE_VALUES: Record<string, string> = {
  category: "&e&lKolekcja",
  days: "14",
  item: "Płyta: Cat",
  price: "20000",
  amount: "1",
  percent: "50",
  time: "2h",
};

export type AnnounceTexts = Record<string, string>;

// Domyślne teksty - te same co w lang/en.yml i lang/pl.yml pluginu Sklepu.
const DEFAULTS: Record<string, AnnounceTexts> = {
  en: {
    "rotation.broadcast-header": "&d&l★ NEW OFFER: {category} ★",
    "rotation.broadcast-item": "&8  • &f{item}  &6{price}$ &7for {amount} pcs",
    "rotation.broadcast-footer": "&7Check /shop - the offer is gone in {days} days!",
    "dynamic.reset-broadcast": "&6Shop prices are back to normal!",
    "event.broadcast-up": "&d&l★ EVENT! &7The shop pays &a{percent}% &7more for &f{item}&7! &8(/shop)",
    "event.broadcast-up-timed": "&d&l★ EVENT! &7The shop pays &a{percent}% &7more for &f{item} &7for &f{time}&7! &8(/shop)",
    "event.broadcast-down": "&d&l★ EVENT! &7The shop pays &c{percent}% &7less for &f{item}&7! &8(/shop)",
    "event.broadcast-down-timed": "&d&l★ EVENT! &7The shop pays &c{percent}% &7less for &f{item} &7for &f{time}&7! &8(/shop)",
    "event.broadcast-off": "&7The event on &f{item} &7is over - the sell price is back to normal.",
    "event.broadcast-all-off": "&d&l★ Events are over! &7All sell prices are back to normal.",
  },
  pl: {
    "rotation.broadcast-header": "&d&l★ NOWA OFERTA: {category} ★",
    "rotation.broadcast-item": "&8  • &f{item}  &6{price}$ &7za {amount} szt.",
    "rotation.broadcast-footer": "&7Sprawdź /sklep - oferta znika za {days} dni!",
    "dynamic.reset-broadcast": "&6Ceny w sklepie wróciły do wartości bazowych!",
    "event.broadcast-up": "&d&l★ EVENT! &7Sklep skupuje &f{item} &7drożej o &a{percent}%&7! &8(/sklep)",
    "event.broadcast-up-timed": "&d&l★ EVENT! &7Sklep skupuje &f{item} &7drożej o &a{percent}% &7przez &f{time}&7! &8(/sklep)",
    "event.broadcast-down": "&d&l★ EVENT! &7Sklep skupuje &f{item} &7taniej o &c{percent}%&7! &8(/sklep)",
    "event.broadcast-down-timed": "&d&l★ EVENT! &7Sklep skupuje &f{item} &7taniej o &c{percent}% &7przez &f{time}&7! &8(/sklep)",
    "event.broadcast-off": "&7Event na &f{item} &7zakończony - skup wraca do normy.",
    "event.broadcast-all-off": "&d&l★ Koniec eventów! &7Wszystkie ceny skupu wróciły do normy.",
  },
};

export function defaultAnnounceTexts(language: string): AnnounceTexts {
  return { ...(DEFAULTS[language] ?? DEFAULTS.en) };
}

/** Teksty z pliku lang na serwerze; czego tam brakuje, bierze się z domyślnych (jak w pluginie). */
export function parseAnnounceTexts(text: string | null, language: string): AnnounceTexts {
  const out = defaultAnnounceTexts(language);
  if (!text) return out;
  let root: unknown;
  try {
    root = yaml.load(text);
  } catch {
    return out;
  }
  for (const f of ANNOUNCE_FIELDS) {
    const [sec, sub] = f.key.split(".");
    const section = root && typeof root === "object" ? (root as Record<string, unknown>)[sec] : undefined;
    const v = section && typeof section === "object" ? (section as Record<string, unknown>)[sub] : undefined;
    if (typeof v === "string") out[f.key] = v;
  }
  return out;
}

/** Podmienia wstawki {nazwa} na wartości (do podglądu). */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/**
 * Wpisuje teksty do pliku lang, zmieniając TYLKO linijki tych kluczy. Komentarze, kolejność
 * i wszystkie inne teksty zostają. Brakujący klucz dopisuje pod nagłówkiem sekcji, brakującą
 * sekcję - na końcu pliku.
 */
export function patchLangFile(text: string, texts: AnnounceTexts): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const f of ANNOUNCE_FIELDS) {
    const value = texts[f.key];
    if (value == null) continue;
    const [sec, sub] = f.key.split(".");
    const line = `  ${sub}: ${JSON.stringify(value)}`;
    const head = lines.findIndex((l) => l.replace(/\s+#.*$/, "").trimEnd() === `${sec}:`);
    if (head < 0) {
      lines.push(`${sec}:`, line);
      continue;
    }
    let end = head + 1;
    while (end < lines.length && (lines[end].trim() === "" || /^\s/.test(lines[end]))) end++;
    const keyRe = new RegExp(`^\\s+${sub.replace(/[-]/g, "\\-")}\\s*:`);
    const at = lines.slice(head + 1, end).findIndex((l) => keyRe.test(l));
    if (at >= 0) lines[head + 1 + at] = line;
    else lines.splice(head + 1, 0, line);
  }
  return lines.join("\n") + "\n";
}

export function sameTexts(a: AnnounceTexts, b: AnnounceTexts): boolean {
  return ANNOUNCE_FIELDS.every((f) => a[f.key] === b[f.key]);
}
