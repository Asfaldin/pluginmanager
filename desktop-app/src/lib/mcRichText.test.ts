import { describe, expect, it } from "vitest";
import {
  charsWithStyle,
  groupRuns,
  parseUnits,
  replaceRange,
  serializeUnits,
  styleAt,
  styleRange,
  toggleFlag,
  wordEnd,
  wordStart,
} from "./mcRichText";

const TOKENS = ["{category}", "{item}", "{price}", "{amount}", "{days}"];

describe("mcRichText", () => {
  it("teksty z pluginu wracają bez zmian (parse -> serialize)", () => {
    for (const t of [
      "&d&l★ NOWA OFERTA: {category}",
      "&7Sprawdź /sklep - oferta znika za {days}&7 dni!",
      "&e&lKolekcja",
      "Zwykły tekst",
      "&aZielony &lgruby&r zwykły",
      "&#FF8800Pomarańcza",
      "",
    ]) {
      expect(serializeUnits(parseUnits(t, TOKENS))).toBe(t);
    }
  });

  it("po wstawce kolor jest ustawiany od nowa - jej własne kolory nie przeciekają dalej", () => {
    expect(serializeUnits(parseUnits("&d&l★ NOWA OFERTA: {category} ★", TOKENS))).toBe("&d&l★ NOWA OFERTA: {category}&d&l ★");
    expect(serializeUnits(parseUnits("&8  • &f{item}  &6{price}$", TOKENS))).toBe("&8  • &f{item}&f  &6{price}&6$");
    expect(serializeUnits(parseUnits("{item} x", TOKENS))).toBe("{item}&r x");
  });

  it("wstawki są jednym klockiem, zwykłe klamry nie", () => {
    const u = parseUnits("&a{item} {inne}", TOKENS);
    expect(u[0]).toEqual({ token: "{item}", style: { color: "#55FF55" } });
    expect(u).toHaveLength(1 + 1 + "{inne}".length);
  });

  it("kolor na zaznaczeniu - reszta zostaje", () => {
    const u = parseUnits("abc");
    expect(serializeUnits(styleRange(u, 1, 2, { color: "#FF5555" }))).toBe("a&cb&rc");
  });

  it("zmiana koloru nie gubi pogrubienia", () => {
    const u = parseUnits("&e&lKolekcja");
    expect(serializeUnits(styleRange(u, 0, 8, { color: "#FF55FF" }))).toBe("&d&lKolekcja");
  });

  it("pogrubienie włącza i wyłącza", () => {
    const u = parseUnits("&eab");
    const bold = toggleFlag(u, 0, 2, "bold");
    expect(serializeUnits(bold)).toBe("&e&lab");
    expect(serializeUnits(toggleFlag(bold, 0, 2, "bold"))).toBe("&eab");
    expect(serializeUnits(toggleFlag(bold, 1, 2, "bold"))).toBe("&e&la&eb");
  });

  it("zwykły tekst kasuje kolor i styl", () => {
    expect(serializeUnits(styleRange(parseUnits("&c&lab"), 0, 2, "reset"))).toBe("ab");
  });

  it("wpisywanie bierze styl znaku przed kursorem", () => {
    const u = parseUnits("&eab&fc");
    const s = styleAt(u, 2);
    expect(serializeUnits(replaceRange(u, 2, 2, charsWithStyle("X", s)))).toBe("&eabX&fc");
    expect(styleAt([], 0)).toEqual({});
  });

  it("styl bez koloru po kolorze dostaje &r", () => {
    const u = [...charsWithStyle("a", { color: "#FF5555" }), ...charsWithStyle("b", { bold: true })];
    expect(serializeUnits(u)).toBe("&ca&r&lb");
  });

  it("słowa do Ctrl+Backspace / Ctrl+Delete", () => {
    const u = parseUnits("ala ma  kota");
    expect(wordStart(u, 8)).toBe(4);
    expect(wordStart(u, 12)).toBe(8);
    expect(wordEnd(u, 3)).toBe(6);
  });

  it("kawałki do rysowania łączą ten sam styl", () => {
    const runs = groupRuns(parseUnits("&eab{item}&fc", TOKENS));
    expect(runs.map((r) => ("token" in r ? r.token : r.text))).toEqual(["ab", "{item}", "c"]);
  });
});
