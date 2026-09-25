import { describe, expect, it } from "vitest";
import { eventCommand, formatLeft, parseEvents, parseSales, saleArg, saleCommand } from "./shopLive";

describe("shopLive - trwające eventy i promocje", () => {
  const now = 1_000_000;

  it("czyta eventy z prices.yml, pomija zwykłe ceny i wygasłe", () => {
    const yml = [
      "_meta:",
      "  cycles-since-reset: 3",
      "DIAMOND:",
      "  multiplier: 1.5",
      "  locked: true",
      "STONE:",
      "  multiplier: 0.8",
      "  locked: true",
      `  event-until: ${now + 60_000}`,
      "DIRT:",
      "  multiplier: 0.7",
      "OLD:",
      "  multiplier: 2.0",
      "  locked: true",
      `  event-until: ${now - 1}`,
    ].join("\n");
    expect(parseEvents(yml, now)).toEqual([
      { key: "DIAMOND", percent: 50, until: 0 },
      { key: "STONE", percent: -20, until: now + 60_000 },
    ]);
    expect(parseEvents(null)).toEqual([]);
    expect(parseEvents("::zly")).toEqual([]);
  });

  it("czyta promocje z sales.yml", () => {
    const yml = `all:\n  percent: 10.0\n  until: 0\n"category:bloki":\n  percent: 20.0\n  until: ${now + 5}\n"item:X":\n  percent: 30\n  until: ${now - 5}\n`;
    expect(parseSales(yml, now)).toEqual([
      { target: "all", percent: 10, until: 0 },
      { target: "category:bloki", percent: 20, until: now + 5 },
    ]);
  });

  it("buduje komendy jak w pluginie", () => {
    expect(eventCommand("DIAMOND", 50, "2h")).toBe("@shop event DIAMOND +50 2h");
    expect(eventCommand("custom:gem", -20, "")).toBe("@shop event custom:gem -20");
    expect(saleCommand("bloki", 20, "1d")).toBe("@shop sale bloki -20 1d");
    expect(saleCommand("all", -15, "")).toBe("@shop sale all -15");
    expect(saleArg("item:DIAMOND")).toBe("DIAMOND");
    expect(saleArg("category:bloki")).toBe("bloki");
    expect(saleArg("all")).toBe("all");
  });

  it("pisze, ile zostało", () => {
    expect(formatLeft(2 * 86_400_000 + 3 * 3_600_000)).toBe("2d 3h");
    expect(formatLeft(80 * 60_000)).toBe("1h 20m");
    expect(formatLeft(45 * 60_000)).toBe("45m");
    expect(formatLeft(10_000)).toBe("chwila");
  });
});
