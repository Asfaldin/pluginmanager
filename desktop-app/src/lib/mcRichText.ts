import { MC_COLORS, parseMinecraftText } from "./minecraftColors";

// Model pola tekstowego "jak w Wordzie": tekst z kodami & (&d&l...) rozbity na pojedyncze znaki,
// każdy z własnym stylem. Pole pokazuje kolory, a do pliku zawsze idzie zwykły tekst z kodami,
// bo tylko to czyta plugin. Wstawki typu {category} są jednym "klockiem" (token).

export interface McStyle {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export type McUnit = { ch: string; style: McStyle } | { token: string; style: McStyle };

export type McFlag = "bold" | "italic" | "underline" | "strikethrough" | "obfuscated";

const FLAGS: Array<[McFlag, string]> = [
  ["bold", "l"],
  ["italic", "o"],
  ["underline", "n"],
  ["strikethrough", "m"],
  ["obfuscated", "k"],
];

function clean(s: McStyle): McStyle {
  const out: McStyle = {};
  if (s.color) out.color = s.color;
  for (const [f] of FLAGS) if (s[f]) out[f] = true;
  return out;
}

export function sameStyle(a: McStyle, b: McStyle): boolean {
  if ((a.color ?? "").toLowerCase() !== (b.color ?? "").toLowerCase()) return false;
  return FLAGS.every(([f]) => !!a[f] === !!b[f]);
}

export function isToken(u: McUnit): u is { token: string; style: McStyle } {
  return "token" in u;
}

/** Tekst z kodami & -> znaki ze stylami. `tokens` = wstawki pokazywane jako klocki (np. "{category}"). */
export function parseUnits(text: string, tokens: string[] = []): McUnit[] {
  const units: McUnit[] = [];
  for (const seg of parseMinecraftText(text)) {
    const style = clean({
      color: seg.color,
      bold: seg.bold,
      italic: seg.italic,
      underline: seg.underline,
      strikethrough: seg.strikethrough,
      obfuscated: seg.obfuscated,
    });
    let i = 0;
    while (i < seg.text.length) {
      const tok = tokens.find((t) => t && seg.text.startsWith(t, i));
      if (tok) {
        units.push({ token: tok, style });
        i += tok.length;
      } else {
        units.push({ ch: seg.text[i], style });
        i++;
      }
    }
  }
  return units;
}

function colorCode(color: string): string {
  const hit = MC_COLORS.find(([, hex]) => hex.toLowerCase() === color.toLowerCase());
  return hit ? `&${hit[0]}` : `&#${color.replace(/^#/, "")}`;
}

function flagCodes(s: McStyle, only?: (f: McFlag) => boolean): string {
  return FLAGS.filter(([f]) => s[f] && (!only || only(f)))
    .map(([, c]) => `&${c}`)
    .join("");
}

/** Znaki ze stylami -> tekst z kodami &. Kody tylko tam, gdzie styl się zmienia. */
export function serializeUnits(units: McUnit[]): string {
  let out = "";
  let prev: McStyle = {};
  // Wstawka (np. {category}) wnosi WŁASNE kolory - nazwa kategorii "&e&lKolekcja" zmienia kolor
  // wszystkiego za nią. Dlatego po wstawce styl następnego znaku wypisujemy zawsze od nowa.
  let afterToken = false;
  for (const u of units) {
    const next = u.style;
    if (afterToken && !isToken(u)) {
      out += next.color ? colorCode(next.color) + flagCodes(next) : "&r" + flagCodes(next);
      prev = next;
      afterToken = false;
    } else if (!sameStyle(prev, next)) {
      const lostFlag = FLAGS.some(([f]) => prev[f] && !next[f]);
      const colorChanged = (prev.color ?? "").toLowerCase() !== (next.color ?? "").toLowerCase();
      if (next.color) {
        // W Minecrafcie kod koloru kasuje pogrubienie itd., więc po nim wypisujemy style od nowa.
        if (colorChanged || lostFlag) out += colorCode(next.color) + flagCodes(next);
        else out += flagCodes(next, (f) => !prev[f]);
      } else if (prev.color || lostFlag) {
        out += "&r" + flagCodes(next);
      } else {
        out += flagCodes(next, (f) => !prev[f]);
      }
      prev = next;
    }
    out += isToken(u) ? u.token : u.ch;
    if (isToken(u)) afterToken = true;
  }
  return out;
}

/** Styl, którym pisze się w miejscu kursora - jak w Wordzie: styl znaku przed kursorem. */
export function styleAt(units: McUnit[], at: number): McStyle {
  return { ...(units[at - 1]?.style ?? units[at]?.style ?? {}) };
}

export function replaceRange(units: McUnit[], start: number, end: number, inserted: McUnit[]): McUnit[] {
  return [...units.slice(0, start), ...inserted, ...units.slice(end)];
}

export function charsWithStyle(text: string, style: McStyle): McUnit[] {
  return text.split("").map((ch) => ({ ch, style: { ...style } }));
}

/** Nadaje styl zaznaczonemu kawałkowi. "reset" = zwykły tekst bez koloru i stylu. */
export function styleRange(units: McUnit[], start: number, end: number, patch: Partial<McStyle> | "reset"): McUnit[] {
  return units.map((u, i) => {
    if (i < start || i >= end) return u;
    const style = patch === "reset" ? {} : clean({ ...u.style, ...patch });
    return { ...u, style };
  });
}

/** Włącza albo wyłącza pogrubienie itd. - wyłącza, jeśli cały zaznaczony kawałek już je ma. */
export function toggleFlag(units: McUnit[], start: number, end: number, flag: McFlag): McUnit[] {
  const all = units.slice(start, end).every((u) => u.style[flag]);
  return styleRange(units, start, end, { [flag]: !all });
}

function isSpace(u: McUnit | undefined): boolean {
  return !!u && !isToken(u) && /\s/.test(u.ch);
}

/** Początek słowa przed kursorem (Ctrl+Backspace). */
export function wordStart(units: McUnit[], at: number): number {
  let i = at;
  while (i > 0 && isSpace(units[i - 1])) i--;
  while (i > 0 && !isSpace(units[i - 1])) i--;
  return i;
}

/** Koniec słowa za kursorem (Ctrl+Delete). */
export function wordEnd(units: McUnit[], at: number): number {
  let i = at;
  while (i < units.length && isSpace(units[i])) i++;
  while (i < units.length && !isSpace(units[i])) i++;
  return i;
}

/** Kawałki do narysowania: sąsiednie znaki o tym samym stylu razem, każdy klocek osobno. */
export function groupRuns(units: McUnit[]): Array<{ text: string; style: McStyle } | { token: string; style: McStyle }> {
  const runs: Array<{ text: string; style: McStyle } | { token: string; style: McStyle }> = [];
  for (const u of units) {
    if (isToken(u)) {
      runs.push({ token: u.token, style: u.style });
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && "text" in last && sameStyle(last.style, u.style)) last.text += u.ch;
    else runs.push({ text: u.ch, style: u.style });
  }
  return runs;
}
