import { describe, expect, it } from "vitest";
import { withUserTemplate } from "./shopUserTemplates";

describe("Twoje szablony sklepu", () => {
  const a = { "shop.yml": "a", categories: {} };
  const b = { "shop.yml": "b", categories: { x: "y" } };

  it("każdy zapis to osobna pozycja - nic się nie nadpisuje, powtórzona nazwa dostaje numer", () => {
    let list = withUserTemplate([], "Mój sklep", a, 1);
    list = withUserTemplate(list, "Inny", a, 2); // ta sama treść - dalej osobno
    list = withUserTemplate(list, "Mój sklep", b, 3);
    list = withUserTemplate(list, "Mój sklep", b, 4);
    expect(list.map((t) => t.name)).toEqual(["Mój sklep (3)", "Mój sklep (2)", "Inny", "Mój sklep"]);
    expect(new Set(list.map((t) => t.id)).size).toBe(4);
    expect(list[3].template).toEqual(a);
  });
});
