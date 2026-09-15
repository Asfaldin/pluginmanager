import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import {
  defaultMenus,
  defaultSettings,
  fromPerPiece,
  isLotted,
  parseCategory,
  parseShopSettings,
  perPiece,
  serializeCategory,
  serializeShopSettings,
  shopProblems,
} from "./shopYaml";

const CATEGORY = `
name: "&bOres"
icon: DIAMOND
extra-top: keep
items:
  - {item: DIAMOND, buy: 150, sell: 60}
  - {item: COBBLESTONE, buy: 640, amount: 64, sell: 50, sell-amount: 64, name: "Bruk", lore: ["&7a"], secret: 1}
  - {custom: spawner_zombie, buy: 20000}
  - {item: WHEAT, buy: 0.16}
rotation:
  enabled: true
  show: 5
  every-days: 14
  note: hi
  pool:
    - {item: ELYTRA, buy: 75000}
    - {item: GOAT_HORN, buy: 20000, instrument: ponder_goat_horn}
`;

describe("shopYaml categories", () => {
  it("reads a category", () => {
    const c = parseCategory("ores", CATEGORY);
    expect(c.name).toBe("&bOres");
    expect(c.icon).toEqual({ item: "DIAMOND" });
    expect(c.items).toHaveLength(4);
    expect(c.items[1]).toMatchObject({ amount: 64, sellAmount: 64, buy: 640, sell: 50, name: "Bruk", lore: ["&7a"] });
    expect(c.items[2].ref).toEqual({ custom: "spawner_zombie" });
    expect(c.items[2].sell).toBeNull();
    expect(c.items[3].buy).toBe(0.16);
    expect(c.rotation?.pool[1].instrument).toBe("ponder_goat_horn");
  });

  it("round-trips and keeps unknown fields", () => {
    const text = serializeCategory(parseCategory("ores", CATEGORY));
    const back = yaml.load(text) as Record<string, any>;
    expect(back["extra-top"]).toBe("keep");
    expect(back.items[1].secret).toBe(1);
    expect(back.items[0]).toEqual({ item: "DIAMOND", buy: 150, sell: 60 });
    expect(back.rotation.note).toBe("hi");
    expect(back.rotation.pool).toHaveLength(2);
    expect(serializeCategory(parseCategory("ores", text))).toBe(text);
  });

  it("writes no rotation when there is none and omits amount 1", () => {
    const text = serializeCategory(parseCategory("x", "name: X\nicon: STONE\nitems:\n  - {item: DIRT, buy: 3, amount: 1}"));
    expect(text).not.toContain("rotation:");
    expect(text).toContain("  - {item: DIRT, buy: 3}\n");
  });
});

describe("shopYaml settings", () => {
  it("empty text gives defaults", () => {
    const s = parseShopSettings("");
    expect({ ...s, raw: {} }).toEqual(defaultSettings());
  });

  it("round-trips and keeps unknown fields", () => {
    const s = parseShopSettings("categories: [a, b]\nprice-rounding: whole\ndynamic-prices:\n  enabled: false\n  secret: 5\nmystery: yes\n");
    expect(s.rounding).toBe("whole");
    expect(s.dynamic.enabled).toBe(false);
    expect(s.menus).toEqual(defaultMenus());
    const text = serializeShopSettings(s);
    const back = yaml.load(text) as Record<string, any>;
    expect(back.mystery).toBe("yes");
    expect(back["dynamic-prices"].secret).toBe(5);
    expect(back.menus["buy-picker"].layout[0]).toEqual({ slot: 11, role: "AMOUNT_SLOT", amount: 1 });
    expect(serializeShopSettings(parseShopSettings(text))).toBe(text);
  });
});

describe("shopYaml prices", () => {
  it("converts per piece", () => {
    expect(perPiece(10, 64)).toBe(0.16);
    expect(fromPerPiece(0.16, 64)).toBe(10.24);
    expect(perPiece(null, 5)).toBeNull();
  });

  it("finds problems", () => {
    const c = parseCategory("x", "name: X\nicon: STONE\nitems:\n  - {item: DIRT, buy: 3, sell: 5}\n  - {item: STONE}");
    const p = shopProblems({ ...defaultSettings(), categoryOrder: [] }, [c]);
    expect(p.some((x) => x.includes("skup za sztukę"))).toBe(true);
    expect(p.some((x) => x.includes("nie ma ani ceny"))).toBe(true);
    expect(p.some((x) => x.includes("nie ma miejsca"))).toBe(true);
    expect(isLotted(c.items[0])).toBe(false);
  });
});
