import { describe, expect, it } from "vitest";
import { parseShopTemplateFile, shopTemplateChoices, shopTemplateFor } from "./shopTemplates";
import { parseCategory, parseShopSettings, shopProblems } from "./shopYaml";

describe("shop templates", () => {
  it("big template: 10 categories, rotation, spawners, whole coins", () => {
    const big = shopTemplateChoices("pl").find((t) => t.id === "big")!.template;
    const settings = parseShopSettings(big["shop.yml"]);
    expect(settings.rounding).toBe("whole");
    expect(settings.categoryOrder).toHaveLength(10);
    const cats = Object.entries(big.categories).map(([id, text]) => parseCategory(id, text));
    expect(cats).toHaveLength(10);
    const col = cats.find((c) => c.id === "kolekcja")!;
    expect(col.rotation?.enabled).toBe(true);
    expect(col.rotation?.pool.length).toBeGreaterThan(40);
    const spawners = cats.find((c) => c.id === "spawnery")!;
    expect(spawners.items.every((i) => i.ref.custom?.startsWith("spawner_"))).toBe(true);
    const cobble = cats.find((c) => c.id === "bloki")!.items.find((i) => i.ref.item === "COBBLESTONE")!;
    expect(cobble).toMatchObject({ buy: 640, amount: 64, sell: 50, sellAmount: 64 });
    expect(shopProblems(settings, cats)).toEqual([]);
  });

  it("small template: 4 categories of 8, whole prices per piece, sell below buy", () => {
    const small = shopTemplateChoices("pl").find((t) => t.id === "small")!.template;
    const settings = parseShopSettings(small["shop.yml"]);
    expect(settings.categoryOrder).toEqual(["bloki", "rudy", "farma", "dropy"]);
    const cats = settings.categoryOrder.map((id) => parseCategory(id, small.categories[id]));
    for (const c of cats) {
      expect(c.items).toHaveLength(8);
      for (const it of c.items) {
        expect(it.amount).toBe(1);
        expect(Number.isInteger(it.buy)).toBe(true);
        if (it.sell != null) expect(it.sell).toBeLessThan(it.buy!);
      }
    }
    expect(shopProblems(settings, cats)).toEqual([]);
  });

  it("empty template has no categories; a saved shop file reads back", () => {
    const empty = shopTemplateChoices("pl").find((t) => t.id === "empty")!.template;
    expect(empty.categories).toEqual({});
    expect(parseShopSettings(empty["shop.yml"]).categoryOrder).toEqual([]);
    const big = shopTemplateChoices("pl")[0].template;
    expect(parseShopTemplateFile(JSON.stringify(big))).toEqual(big);
    expect(parseShopTemplateFile("{}")).toBeNull();
    expect(parseShopTemplateFile("nie json")).toBeNull();
    expect(parseShopTemplateFile(JSON.stringify({ "shop.yml": "x", categories: { a: 1 } }))).toBeNull();
  });

  it("the plugin's first-run content in Polish is the big template", () => {
    expect(shopTemplateFor("pl")).toBe(shopTemplateChoices("pl")[0].template);
  });
});
