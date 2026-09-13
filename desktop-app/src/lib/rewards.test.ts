import { describe, expect, it } from "vitest";
import { parseRewards, rewardsToYaml } from "./rewards";

describe("rewards", () => {
  it("parses every type with amount, silent and fallback", () => {
    const list = parseRewards([
      { money: 500 },
      { item: "DIAMOND", amount: 3 },
      { custom: "MAGIC" },
      { command: "give {player} cake", silent: true },
      { key: "epic", fallback: [{ money: 1000 }] },
    ]);
    expect(list.map((r) => r.type)).toEqual(["money", "item", "custom", "command", "key"]);
    expect(list[0]).toEqual({ type: "money", value: "500", amount: 1, silent: false, fallback: [] });
    expect(list[1].amount).toBe(3);
    expect(list[3].silent).toBe(true);
    expect(list[4].fallback).toEqual([{ type: "money", value: "1000", amount: 1, silent: false, fallback: [] }]);
  });

  it("round-trips through YAML objects with money as a number", () => {
    const raw = [
      { money: 500 },
      { item: "DIAMOND", amount: 3 },
      { crate: "basic", fallback: [{ money: 10 }] },
      { command: "say hi", silent: true },
    ];
    const out = rewardsToYaml(parseRewards(raw));
    expect(out).toEqual(raw);
    expect(typeof out[0].money).toBe("number");
  });

  it("ignores junk entries", () => {
    expect(parseRewards("nope")).toEqual([]);
    expect(parseRewards([null, 5, { amount: 2 }])).toEqual([]);
  });
});
