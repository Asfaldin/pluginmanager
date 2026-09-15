import { describe, expect, it } from "vitest";
import { shopTemplateChoices } from "./shopTemplates";
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

  it("small templates in both languages have the same prices", () => {
    const en = shopTemplateChoices("en")[0].template;
    const pl = shopTemplateChoices("pl")[0].template;
    expect(Object.keys(en.categories).sort()).toEqual(Object.keys(pl.categories).sort());
    for (const id of Object.keys(en.categories)) {
      expect(parseCategory(id, en.categories[id]).items).toEqual(parseCategory(id, pl.categories[id]).items);
    }
    expect(parseShopSettings(en["shop.yml"]).rounding).toBe("cents");
  });
});
