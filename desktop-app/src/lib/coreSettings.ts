import * as yaml from "js-yaml";

// Ustawienia core: config.yml (language, economy) i commands.yml. Czysta logika bez serwera.

/** Wartość ustawienia z najwyższego poziomu pliku (np. "language: pl"), albo null. */
export function readSetting(text: string, key: string): string | null {
  const m = text.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Zmienia tylko linijkę danego ustawienia - komentarze i reszta pliku (np. test-rewards)
 * zostają bez zmian. Brakujące ustawienie dopisujemy pod "language:" albo na końcu.
 */
export function writeSetting(text: string, key: string, value: string): string {
  const line = new RegExp(`^${key}:.*$`, "m");
  if (line.test(text)) return text.replace(line, `${key}: ${value}`);
  const lang = /^language:.*$/m;
  const match = text.match(lang);
  if (match && match.index !== undefined) {
    const end = match.index + match[0].length;
    return `${text.slice(0, end)}\n${key}: ${value}${text.slice(end)}`;
  }
  const base = text.endsWith("\n") || text === "" ? text : `${text}\n`;
  return `${base}${key}: ${value}\n`;
}

/** Znaczek waluty z config.yml core ("currency"), domyślnie "$". Może zaczynać się spacją: " zł" -> "100 zł". */
export function readCurrency(configText: string): string {
  return readSetting(configText, "currency") ?? "$";
}

/** Gotowe znaczki do wyboru w Ustawieniach serwera. */
export const CURRENCY_PRESETS: { value: string; label: string }[] = [
  { value: "$", label: "$" },
  { value: " zł", label: "zł" },
  { value: " €", label: "€" },
  { value: " monet", label: "monety" },
];

export interface CommandRow {
  /** Oryginalna nazwa komendy z pluginu, np. "przelej" albo "@reloadsklep". */
  command: string;
  /** Nazwa dla graczy; pusta = zostaje oryginalna. */
  name: string;
  aliases: string[];
  enabled: boolean;
}

export function parseCommandsYml(text: string): CommandRow[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const commands = (raw.commands ?? {}) as Record<string, any>;
  return Object.entries(commands).map(([command, v]) => ({
    command,
    name: v?.name ? String(v.name) : "",
    aliases: Array.isArray(v?.aliases) ? v.aliases.map(String) : [],
    enabled: v?.enabled !== false,
  }));
}

const HEADER =
  "# Nazwy komend Mainplugins - zarządzane przez aplikację (komentarze nie są zachowywane).\n" +
  "# name = nazwa dla graczy, aliases = dodatkowe nazwy, enabled: false = komenda wyłączona.\n" +
  "# Zmiany działają po restarcie serwera.";

function key(command: string): string {
  return /^[a-z0-9_-]+$/i.test(command) ? command : `"${command}"`;
}

export function serializeCommandsYml(rows: CommandRow[]): string {
  if (rows.length === 0) return `${HEADER}\ncommands: {}\n`;
  const lines = [HEADER, "commands:"];
  for (const r of rows) {
    lines.push(`  ${key(r.command)}:`);
    if (r.name.trim()) lines.push(`    name: ${r.name.trim()}`);
    if (r.aliases.length > 0) lines.push(`    aliases: [${r.aliases.join(", ")}]`);
    if (!r.enabled) lines.push("    enabled: false");
    if (r.name.trim() === "" && r.aliases.length === 0 && r.enabled) lines.push("    enabled: true");
  }
  return lines.join("\n") + "\n";
}
