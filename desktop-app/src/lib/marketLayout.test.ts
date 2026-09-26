import { describe, expect, it } from "vitest";
import { defaultOfferSlots, placeAt, resize, swapSlots, thingAt } from "./marketLayout";
import { DEFAULT_OFFER_SLOTS, defaultMarket, marketProblems } from "./marketYaml";

describe("marketLayout", () => {
  it("domyślny układ 54 to blok 7x3", () => {
    expect(defaultOfferSlots(54)).toEqual(DEFAULT_OFFER_SLOTS);
  });

  it("oferta i tło w wolnym polu, przycisk przenosi się z zamianą", () => {
    let c = defaultMarket();
    c = placeAt(c, 0, "offer");
    expect(thingAt(c, 0)).toBe("offer");
    c = placeAt(c, 0, null);
    expect(thingAt(c, 0)).toBeNull();
    // Przycisk na pole oferty: oferta idzie na stare miejsce przycisku.
    c = placeAt(c, 10, "close");
    expect(c.buttons.close.slot).toBe(10);
    expect(thingAt(c, 49)).toBe("offer");
    // Przycisk na inny przycisk: zamieniają się miejscami.
    c = placeAt(c, 45, "close");
    expect(c.buttons.close.slot).toBe(45);
    expect(c.buttons.prev.slot).toBe(10);
  });

  it("przeciąganie zamienia pola", () => {
    const c = swapSlots(defaultMarket(), 10, 0);
    expect(thingAt(c, 0)).toBe("offer");
    expect(thingAt(c, 10)).toBeNull();
    const d = swapSlots(c, 0, 45);
    expect(d.buttons.prev.slot).toBe(0);
    expect(thingAt(d, 45)).toBe("offer");
  });

  it("zmiana rozmiaru trzyma przyciski na dole i nic nie wypada poza okno", () => {
    for (const size of [9, 18, 27, 36, 45, 54]) {
      const c = resize(defaultMarket(), size);
      expect(c.buttons.prev.slot).toBe(size - 9);
      expect(c.buttons.next.slot).toBe(size - 1);
      expect(marketProblems(c)).toEqual([]);
    }
    expect(resize(defaultMarket(), 27).offerSlots).toEqual([10, 11, 12, 13, 14, 15, 16]);
  });
});
