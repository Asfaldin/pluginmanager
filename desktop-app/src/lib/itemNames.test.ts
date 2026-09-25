import { describe, expect, it } from "vitest";
import { itemDisplayName, knownItemName } from "./itemNames";

describe("polskie nazwy przedmiotów", () => {
  it("zna nazwy z Minecrafta, nieznane pokazuje czytelnie", () => {
    expect(itemDisplayName("DIRT")).toBe("Ziemia");
    expect(itemDisplayName("cobblestone")).toBe("Bruk");
    expect(itemDisplayName("OAK_LOG")).toBe("Dębowy pień");
    expect(itemDisplayName("NIE_MA_TAKIEGO")).toBe("nie ma takiego");
    expect(knownItemName("DIAMOND")).toBe("Diament");
    expect(knownItemName("NIE_MA_TAKIEGO")).toBeUndefined();
  });
});
