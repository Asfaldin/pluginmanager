import { describe, expect, it } from "vitest";
import { expiresIn, parseOffers } from "./marketLive";

const FILE = `listings:
  a1:
    seller-name: Steve
    price: 150
    listed-at: 1000
    type: DIAMOND
    amount: 3
    name: Diament
  b2:
    seller-name: Alex
    price: 20
    listed-at: 5000
`;

describe("marketLive", () => {
  it("czyta oferty, najnowsze pierwsze", () => {
    const o = parseOffers(FILE);
    expect(o.map((x) => x.id)).toEqual(["b2", "a1"]);
    expect(o[1]).toMatchObject({ seller: "Steve", price: 150, type: "DIAMOND", amount: 3, name: "Diament" });
    expect(o[0]).toMatchObject({ type: "", amount: 1 });
  });

  it("pusty albo zepsuty plik to brak ofert", () => {
    expect(parseOffers(null)).toEqual([]);
    expect(parseOffers("listings: [")).toEqual([]);
  });

  it("liczy czas do wygaśnięcia", () => {
    const [offer] = parseOffers(FILE);
    expect(expiresIn(offer, 0)).toBeNull();
    expect(expiresIn(offer, 1, 5000)).toBe(86_400_000);
  });
});
