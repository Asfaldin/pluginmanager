import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { MARKET_PLACEHOLDER_LABELS, MARKET_TEXTS } from "./marketTexts";

describe("teksty Targu", () => {
  it("każdy tekst ma ludzką nazwę i opisane wstawki", () => {
    expect(MARKET_TEXTS.fields.length).toBeGreaterThan(50);
    expect(MARKET_TEXTS.fields.filter((f) => f.label === f.key).map((f) => f.key)).toEqual([]);
    const missing = new Set(MARKET_TEXTS.fields.flatMap((f) => f.placeholders).filter((p) => !MARKET_PLACEHOLDER_LABELS[p]));
    expect([...missing]).toEqual([]);
    expect(MARKET_TEXTS.fields.find((f) => f.key === "buy.bought")?.group).toBe("player");
    expect(Object.keys(MARKET_TEXTS.defaults("en")).sort()).toEqual(Object.keys(MARKET_TEXTS.defaults("pl")).sort());
  });

  it("do pliku idą tylko zmienione teksty, reszta pliku zostaje", () => {
    const file = "# teksty\nbuy:\n  bought: \"&aStary\"\n  no-money: \"&cX\"\n";
    const base = MARKET_TEXTS.parse(file, "pl");
    const texts = { ...base, "buy.bought": "&aNowy" };
    const out = MARKET_TEXTS.patch(file, MARKET_TEXTS.changed(texts, base));
    expect(out).toContain("# teksty");
    const back = yaml.load(out) as Record<string, Record<string, string>>;
    expect(back.buy.bought).toBe("&aNowy");
    expect(back.buy["no-money"]).toBe("&cX");
  });
});
