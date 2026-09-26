import * as yaml from "js-yaml";

// Trwające eventy (skup) i promocje (kupno) Sklepu - odczyt z plików pluginu i komendy do ich zmiany.
// Eventy są w prices.yml (<przedmiot>.locked: true, multiplier, event-until), promocje w sales.yml
// (<cel>.percent, until). Cel promocji: "all", "category:<id>" albo "item:<klucz>". 0 w until = bez końca.

export interface LiveEvent {
  key: string;
  /** Zmiana skupu w procentach, np. 50 albo -20. */
  percent: number;
  until: number;
}

export interface LiveSale {
  target: string;
  /** Zniżka na kupno w procentach, np. 20. */
  percent: number;
  until: number;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function load(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    return obj(yaml.load(text));
  } catch {
    return {};
  }
}

/** Eventy z prices.yml; wygasłe (until w przeszłości) pomija - plugin i tak zaraz je zdejmie. */
export function parseEvents(pricesYml: string | null, now = Date.now()): LiveEvent[] {
  const out: LiveEvent[] = [];
  for (const [key, v] of Object.entries(load(pricesYml))) {
    const e = obj(v);
    if (key === "_meta" || e.locked !== true) continue;
    const until = typeof e["event-until"] === "number" ? (e["event-until"] as number) : 0;
    if (until > 0 && until <= now) continue;
    const m = typeof e.multiplier === "number" ? e.multiplier : 1;
    out.push({ key, percent: Math.round((m - 1) * 100), until });
  }
  return out;
}

export function parseSales(salesYml: string | null, now = Date.now()): LiveSale[] {
  const out: LiveSale[] = [];
  for (const [target, v] of Object.entries(load(salesYml))) {
    const s = obj(v);
    const percent = typeof s.percent === "number" ? s.percent : 0;
    const until = typeof s.until === "number" ? s.until : 0;
    if (percent <= 0 || (until > 0 && until <= now)) continue;
    out.push({ target, percent, until });
  }
  return out;
}

/** Ile zostało: "2d 3h", "1h 20m", "45m" - tak samo jak pisze plugin. */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return "chwila";
}

/** Czas do komendy: "" = bez końca, inaczej np. "2h". */
export const DURATIONS: Array<[string, string]> = [
  ["", "bez końca"],
  ["30m", "30 minut"],
  ["1h", "1 godzina"],
  ["2h", "2 godziny"],
  ["6h", "6 godzin"],
  ["1d", "1 dzień"],
  ["3d", "3 dni"],
  ["7d", "7 dni"],
];

/** Własny czas: liczba + jednostka -> zapis do komendy ("45m", "5h", "10d"); zła liczba = "". */
export function customDuration(n: number, unit: "m" | "h" | "d"): string {
  const whole = Math.floor(n);
  return whole >= 1 ? `${whole}${unit}` : "";
}

/** Czas po ludzku: "" = "bez końca", "45m" = "45 minut", "1h" = "1 godzina", "10d" = "10 dni". */
export function durationText(t: string): string {
  const preset = DURATIONS.find(([v]) => v === t);
  if (preset) return preset[1];
  const m = /^(\d+)([mhd])$/.exec(t);
  if (!m) return t;
  const n = Number(m[1]);
  const forms: Record<string, [string, string, string]> = {
    m: ["minuta", "minuty", "minut"],
    h: ["godzina", "godziny", "godzin"],
    d: ["dzień", "dni", "dni"],
  };
  const [one, few, many] = forms[m[2]];
  const last = n % 10;
  const lastTwo = n % 100;
  const word = n === 1 ? one : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
  return `${n} ${word}`;
}

/** Komenda (bez "/") uruchamiająca event na skup: np. "@shop event DIAMOND +50 2h". */
export function eventCommand(key: string, percent: number, time: string): string {
  const p = Math.round(percent);
  return `@shop event ${key} ${p >= 0 ? "+" : ""}${p}${time ? ` ${time}` : ""}`;
}

/** Komenda promocji: cel to "all", id kategorii albo klucz przedmiotu. */
export function saleCommand(target: string, percent: number, time: string): string {
  return `@shop sale ${target} -${Math.abs(Math.round(percent))}${time ? ` ${time}` : ""}`;
}

/** Cel promocji z pliku (item:X, category:Y, all) -> to, co przyjmuje komenda. */
export function saleArg(target: string): string {
  if (target.startsWith("item:")) return target.slice(5);
  if (target.startsWith("category:")) return target.slice(9);
  return "all";
}
