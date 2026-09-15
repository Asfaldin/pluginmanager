import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import { defaultMarket, marketProblems, parseMarketYaml, serializeMarketYaml } from "./marketYaml";

const SPEC = `
limits:
  default: 7
min-price: 5
max-price: 500
expire-days: 3
mailbox: false
tax-percent: 10
extra-top: keep me
menu:
  title: "&6Targ"
  background: BLACK_STAINED_GLASS_PANE
  extra-menu: 1
  buttons:
    prev: {slot: 36, material: ARROW}
`;

describe("marketYaml", () => {
  it("reads every field", () => {
    const c = parseMarketYaml(SPEC);
    expect(c.defaultLimit).toBe(7);
    expect(c.minPrice).toBe(5);
    expect(c.maxPrice).toBe(500);
    expect(c.expireDays).toBe(3);
    expect(c.mailbox).toBe(false);
    expect(c.taxPercent).toBe(10);
    expect(c.title).toBe("&6Targ");
    expect(c.background).toBe("BLACK_STAINED_GLASS_PANE");
    expect(c.buttons.prev).toEqual({ slot: 36, material: "ARROW" });
    expect(c.buttons.next).toEqual(defaultMarket().buttons.next);
  });

  it("keeps unknown fields and round-trips", () => {
    const text = serializeMarketYaml(parseMarketYaml(SPEC));
    const back = yaml.load(text) as Record<string, any>;
    expect(back["extra-top"]).toBe("keep me");
    expect(back.menu["extra-menu"]).toBe(1);
    expect(serializeMarketYaml(parseMarketYaml(text))).toBe(text);
  });

  it("empty text gives defaults", () => {
    const c = parseMarketYaml("");
    const d = defaultMarket();
    expect({ ...c, raw: {} }).toEqual(d);
    expect(marketProblems(c)).toEqual([]);
  });

  it("finds button problems", () => {
    const c = defaultMarket();
    c.buttons.mine = { slot: 10, material: "HOPPER" };
    c.buttons.sort = { slot: 45, material: "COMPARATOR" };
    const p = marketProblems(c);
    expect(p.some((x) => x.includes("Moje oferty"))).toBe(true);
    expect(p.some((x) => x.includes("Sortowanie"))).toBe(true);
  });
});
