import * as yaml from "js-yaml";

// Wspólny mechanizm „Teksty w grze” dla każdego pluginu: teksty z lang/<język>.yml pluginu, ludzkie nazwy,
// grupy, zapis tylko zmienionych linijek. Plik pluginu na serwerze nadpisuje domyślne z jara, brakujące
// klucze biorą się z jara - więc aplikacja zmienia tylko konkretne linijki, a resztę pliku zostawia.
// Domyślne teksty = kopia lang/ z pluginu w aplikacji (podmieniać razem z jarem).

export interface TextField<G extends string = string> {
  key: string;
  group: G;
  label: string;
  /** Wstawki, które plugin podmienia w tym tekście - wzięte z domyślnego tekstu. */
  placeholders: string[];
  /** Kilka linijek (w pliku lista) - w aplikacji linijki rozdziela "\n". */
  list: boolean;
}

export type GameTexts = Record<string, string>;

type RawLang = Record<string, string | string[]>;

/** Plik lang spłaszczony do kluczy "sekcja.tekst"; listy zostają listami. Zły plik = pusty. */
export function flattenLang(text: string | null): RawLang {
  const out: RawLang = {};
  if (!text) return out;
  let root: unknown;
  try {
    root = yaml.load(text);
  } catch {
    return out;
  }
  if (!root || typeof root !== "object") return out;
  for (const [sec, section] of Object.entries(root as Record<string, unknown>)) {
    if (!section || typeof section !== "object" || Array.isArray(section)) continue;
    for (const [sub, v] of Object.entries(section as Record<string, unknown>)) {
      if (typeof v === "string") out[`${sec}.${sub}`] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[`${sec}.${sub}`] = v as string[];
    }
  }
  return out;
}

function toTexts(raw: RawLang): GameTexts {
  const out: GameTexts = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? v.join("\n") : v;
  return out;
}

/**
 * Wpisuje teksty do pliku lang, zmieniając TYLKO linijki podanych kluczy (lista = cały jej blok).
 * Komentarze, kolejność i wszystkie inne teksty zostają. Brakujący klucz dopisuje pod nagłówkiem
 * sekcji, brakującą sekcję - na końcu pliku. listKeys = klucze, które w pliku są listami.
 */
export function patchLang(text: string, texts: GameTexts, listKeys: Set<string>): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const [key, value] of Object.entries(texts)) {
    if (value == null || !key.includes(".")) continue;
    const dot = key.indexOf(".");
    const sec = key.slice(0, dot);
    const sub = key.slice(dot + 1);
    const block = listKeys.has(key)
      ? [`  ${sub}:`, ...value.split("\n").map((l) => `    - ${JSON.stringify(l)}`)]
      : [`  ${sub}: ${JSON.stringify(value)}`];
    const head = lines.findIndex((l) => l.replace(/\s+#.*$/, "").trimEnd() === `${sec}:`);
    if (head < 0) {
      lines.push(`${sec}:`, ...block);
      continue;
    }
    let end = head + 1;
    while (end < lines.length && (lines[end].trim() === "" || /^\s/.test(lines[end]))) end++;
    const keyRe = new RegExp(`^  ${sub.replace(/[-]/g, "\\-")}\\s*:`);
    const at = lines.slice(head + 1, end).findIndex((l) => keyRe.test(l));
    if (at < 0) {
      lines.splice(head + 1, 0, ...block);
      continue;
    }
    // Stary wpis razem z jego linijkami listy (wcięte głębiej niż sam klucz).
    const start = head + 1 + at;
    let stop = start + 1;
    while (stop < end && /^ {3,}\S/.test(lines[stop])) stop++;
    lines.splice(start, stop - start, ...block);
  }
  return lines.join("\n") + "\n";
}

/** Podmienia wstawki {nazwa} na wartości (do podglądu). */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([\w-]+)\}/g, (m, k: string) => values[k] ?? m);
}

/** Zestaw tekstów jednego pluginu: pola, domyślne, odczyt z serwera, zapis zmian. */
export interface TextSet<G extends string> {
  fields: TextField<G>[];
  defaults(language: string): GameTexts;
  /** Teksty z pliku lang na serwerze; czego tam brakuje - domyślne (jak w pluginie). */
  parse(text: string | null, language: string): GameTexts;
  /** Plik lang po wpisaniu podanych tekstów (patrz patchLang). */
  patch(text: string, texts: GameTexts): string;
  /** Teksty różne od `base` - tylko one idą do pliku na serwerze. */
  changed(texts: GameTexts, base: GameTexts): GameTexts;
  same(a: GameTexts, b: GameTexts): boolean;
}

/**
 * rawByLang: kopie lang/<język>.yml pluginu. labels: ludzkie nazwy (tekst bez nazwy pokaże klucz - test
 * pluginu powinien pilnować, żeby takich nie było). groupOf: do której grupy należy klucz.
 */
export function createTextSet<G extends string>(
  rawByLang: Record<string, string>,
  labels: Record<string, string>,
  groupOf: (key: string) => G,
  referenceLang = "pl",
): TextSet<G> {
  const raws: Record<string, RawLang> = Object.fromEntries(Object.entries(rawByLang).map(([l, t]) => [l, flattenLang(t)]));
  const reference = raws[referenceLang] ?? Object.values(raws)[0] ?? {};
  const fields: TextField<G>[] = Object.entries(reference).map(([key, v]) => {
    const joined = Array.isArray(v) ? v.join("\n") : v;
    const placeholders = [...new Set([...joined.matchAll(/\{([a-z-]+)\}/g)].map((m) => m[1]))];
    return { key, group: groupOf(key), label: labels[key] ?? key, placeholders, list: Array.isArray(v) };
  });
  const listKeys = new Set(fields.filter((f) => f.list).map((f) => f.key));
  const defaults = (language: string) => toTexts(raws[language] ?? raws.en ?? reference);
  return {
    fields,
    defaults,
    parse(text, language) {
      const out = defaults(language);
      const fromFile = toTexts(flattenLang(text));
      for (const f of fields) if (fromFile[f.key] != null) out[f.key] = fromFile[f.key];
      return out;
    },
    patch: (text, texts) => patchLang(text, texts, listKeys),
    changed(texts, base) {
      const out: GameTexts = {};
      for (const f of fields) if (texts[f.key] !== base[f.key] && texts[f.key] != null) out[f.key] = texts[f.key];
      return out;
    },
    same: (a, b) => fields.every((f) => a[f.key] === b[f.key]),
  };
}
