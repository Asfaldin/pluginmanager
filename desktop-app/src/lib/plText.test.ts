import { describe, expect, it } from "vitest";
import { everyDays, everyMinutes, num, plural } from "./plText";

describe("plText", () => {
  it("odmienia liczebniki po polsku", () => {
    const p = (n: number) => `${n} ${plural(n, "przedmiot", "przedmioty", "przedmiotów")}`;
    expect([1, 2, 4, 5, 11, 12, 14, 22, 25, 112].map(p)).toEqual([
      "1 przedmiot",
      "2 przedmioty",
      "4 przedmioty",
      "5 przedmiotów",
      "11 przedmiotów",
      "12 przedmiotów",
      "14 przedmiotów",
      "22 przedmioty",
      "25 przedmiotów",
      "112 przedmiotów",
    ]);
  });

  it("dni po ludzku", () => {
    expect([1, 3, 7, 14, 30].map(everyDays)).toEqual(["codziennie", "co 3 dni", "co 7 dni", "co 14 dni", "co 30 dni"]);
  });

  it("minuty po ludzku", () => {
    expect([60, 120, 300, 30, 1, 22, 90].map(everyMinutes)).toEqual([
      "raz na godzinę",
      "co 2 godziny",
      "co 5 godzin",
      "co 30 minut",
      "co 1 minutę",
      "co 22 minuty",
      "co 90 minut",
    ]);
  });

  it("liczby z przecinkiem", () => {
    expect([12.5, 4.2, 5, 0.1 + 0.2].map(num)).toEqual(["12,5", "4,2", "5", "0,3"]);
  });
});
