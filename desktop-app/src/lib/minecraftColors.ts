export const MC_COLORS: Array<[code: string, hex: string, label: string]> = [
  ["0", "#000000", "black"],
  ["1", "#0000AA", "dark_blue"],
  ["2", "#00AA00", "dark_green"],
  ["3", "#00AAAA", "dark_aqua"],
  ["4", "#AA0000", "dark_red"],
  ["5", "#AA00AA", "dark_purple"],
  ["6", "#FFAA00", "gold"],
  ["7", "#AAAAAA", "gray"],
  ["8", "#555555", "dark_gray"],
  ["9", "#5555FF", "blue"],
  ["a", "#55FF55", "green"],
  ["b", "#55FFFF", "aqua"],
  ["c", "#FF5555", "red"],
  ["d", "#FF55FF", "light_purple"],
  ["e", "#FFFF55", "yellow"],
  ["f", "#FFFFFF", "white"],
];

const COLOR_MAP: Record<string, string> = Object.fromEntries(MC_COLORS.map(([code, hex]) => [code, hex]));

const HEX_COLOR_RE = /^[0-9a-fA-F]{6}$/;

export interface MinecraftTextSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export function parseMinecraftText(text: string): MinecraftTextSegment[] {
  const segments: MinecraftTextSegment[] = [];
  let color: string | undefined;
  let bold = false;
  let italic = false;
  let underline = false;
  let strikethrough = false;
  let obfuscated = false;
  let buf = "";

  const flush = () => {
    if (buf) segments.push({ text: buf, color, bold, italic, underline, strikethrough, obfuscated });
    buf = "";
  };
  const resetFormatting = () => {
    bold = italic = underline = strikethrough = obfuscated = false;
  };

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "&" && text[i + 1] === "#" && HEX_COLOR_RE.test(text.slice(i + 2, i + 8))) {
      flush();
      color = "#" + text.slice(i + 2, i + 8);
      resetFormatting();
      i += 7;
      continue;
    }

    if (text[i] === "&" && i + 1 < text.length) {
      const code = text[i + 1].toLowerCase();
      if (COLOR_MAP[code]) {
        flush();
        color = COLOR_MAP[code];
        resetFormatting();
        i++;
        continue;
      }
      if (code === "l") {
        flush();
        bold = true;
        i++;
        continue;
      }
      if (code === "o") {
        flush();
        italic = true;
        i++;
        continue;
      }
      if (code === "n") {
        flush();
        underline = true;
        i++;
        continue;
      }
      if (code === "m") {
        flush();
        strikethrough = true;
        i++;
        continue;
      }
      if (code === "k") {
        flush();
        obfuscated = true;
        i++;
        continue;
      }
      if (code === "r") {
        flush();
        color = undefined;
        resetFormatting();
        i++;
        continue;
      }
    }
    buf += text[i];
  }
  flush();
  return segments;
}
