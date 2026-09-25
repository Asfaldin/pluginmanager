import { describe, expect, it } from "vitest";
import { parseCommandsYml, readCurrency, readSetting, serializeCommandsYml, writeSetting } from "./coreSettings";

const CONFIG = `# Server language
language: pl

# Whose money
economy: own

test-rewards:
  - money: 100
`;

describe("readSetting / writeSetting", () => {
  it("reads top-level values", () => {
    expect(readSetting(CONFIG, "language")).toBe("pl");
    expect(readSetting(CONFIG, "economy")).toBe("own");
    expect(readSetting(CONFIG, "missing")).toBeNull();
    expect(readSetting('language: "en"\n', "language")).toBe("en");
  });

  it("changes only that line and keeps comments and the rest", () => {
    const out = writeSetting(CONFIG, "economy", "vault");
    expect(out).toBe(CONFIG.replace("economy: own", "economy: vault"));
  });

  it("adds a missing setting right after language", () => {
    const out = writeSetting("language: pl\n\ntest-rewards: []\n", "economy", "vault");
    expect(out).toBe("language: pl\neconomy: vault\n\ntest-rewards: []\n");
  });

  it("adds at the end when there is no language line either", () => {
    expect(writeSetting("a: 1", "language", "en")).toBe("a: 1\nlanguage: en\n");
  });

  it("does not touch nested keys with the same name", () => {
    const text = "x:\n  language: de\n";
    expect(readSetting(text, "language")).toBeNull();
  });
});

describe("commands.yml", () => {
  it("parses entries with defaults", () => {
    const rows = parseCommandsYml(`commands:
  przelej:
    name: pay
    aliases: [przelej]
  "@reloadsklep":
    enabled: false
`);
    expect(rows).toEqual([
      { command: "przelej", name: "pay", aliases: ["przelej"], enabled: true },
      { command: "@reloadsklep", name: "", aliases: [], enabled: false },
    ]);
  });

  it("round-trips through serialize and quotes @ commands", () => {
    const rows = [
      { command: "przelej", name: "pay", aliases: ["przelej", "przelew"], enabled: true },
      { command: "@reloadsklep", name: "", aliases: [], enabled: false },
    ];
    const text = serializeCommandsYml(rows);
    expect(text).toContain('"@reloadsklep":');
    expect(parseCommandsYml(text)).toEqual(rows);
  });

  it("handles an empty file", () => {
    expect(parseCommandsYml("")).toEqual([]);
    expect(parseCommandsYml(serializeCommandsYml([]))).toEqual([]);
  });
});

describe("znaczek waluty", () => {
  it("bez ustawienia jest $, spacja w cudzysłowie zostaje", () => {
    expect(readCurrency("language: pl\n")).toBe("$");
    const text = writeSetting("language: pl\neconomy: own\n", "currency", JSON.stringify(" zł"));
    expect(text).toContain('currency: " zł"');
    expect(readCurrency(text)).toBe(" zł");
    expect(readCurrency(writeSetting(text, "currency", JSON.stringify("$")))).toBe("$");
  });
});
