import { describe, expect, it } from "vitest";
import { marketTemplateChoices, parseMarketTemplateFile } from "./marketTemplates";
import { defaultMarket, marketProblems, parseMarketYaml } from "./marketYaml";

describe("szablony Targu", () => {
  it("nasz szablon = ustawienia po instalacji, bez problemów", () => {
    const [ours] = marketTemplateChoices();
    const c = parseMarketYaml(ours.template["market.yml"]);
    expect(marketProblems(c)).toEqual([]);
    expect({ ...c, raw: {} }).toEqual(defaultMarket());
  });

  it("pusty = bez pól ofert, reszta jak gotowy", () => {
    const empty = marketTemplateChoices().find((t) => t.id === "empty")!;
    const c = parseMarketYaml(empty.template["market.yml"]);
    expect(c.offerSlots).toEqual([]);
    expect(c.buttons).toEqual(defaultMarket().buttons);
  });

  it("plik szablonu", () => {
    const [ours] = marketTemplateChoices();
    expect(parseMarketTemplateFile(JSON.stringify(ours.template))).toEqual(ours.template);
    expect(parseMarketTemplateFile('{"shop.yml": "x", "categories": {}}')).toBeNull();
    expect(parseMarketTemplateFile("nie json")).toBeNull();
  });
});
