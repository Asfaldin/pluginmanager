import { describe, expect, it } from "vitest";
import {
  addCrate,
  chancePercent,
  defaultHologram,
  parseCratesYaml,
  serializeCratesYaml,
  validateCrates,
} from "./cratesYaml";

const YML = `settings:
  hologram-height: 1.2
  placed-block-from-item: false
keys:
  basic_key:
    name: "&eKey"
    item: { item: TRIPWIRE_HOOK }
    lore: ["&7x"]
crates:
  basic:
    name: "&6Mystery"
    item: { custom: MY_CHEST }
    keys: [basic_key]
    hologram: ["&6Mystery", "&7Click me"]
    hologram-enabled: false
    prizes:
      - name: "&bDiamonds"
        icon: { item: DIAMOND, amount: 4 }
        weight: 20
        rewards: [ { item: DIAMOND, amount: 4 } ]
      - name: "&6Legend"
        icon: { item: NETHER_STAR }
        weight: 5
        announce: true
        rewards: [ { money: 500 }, { key: basic_key } ]
`;

describe("cratesYaml", () => {
  it("parses keys, crates and prizes", () => {
    const f = parseCratesYaml(YML);
    expect(f.keys).toEqual([{ id: "basic_key", name: "&eKey", lore: ["&7x"], item: { item: "TRIPWIRE_HOOK" } }]);
    const c = f.crates[0];
    expect(c.id).toBe("basic");
    expect(c.item).toEqual({ custom: "MY_CHEST" });
    expect(c.prizes[0].icon).toEqual({ item: "DIAMOND", amount: 4 });
    expect(c.prizes[1].announce).toBe(true);
    expect(c.prizes[1].rewards.map((r) => r.type)).toEqual(["money", "key"]);
    expect(c.hologram).toEqual(["&6Mystery", "&7Click me"]);
    expect(c.hologramEnabled).toBe(false);
    expect(defaultHologram(c, "pl")).toEqual(["&6Mystery", "&7Prawy klik z kluczem &8• &7Lewy klik: nagrody"]);
    expect(f.settings.hologramHeight).toBe(1.2);
    expect(f.settings.placedBlockFromItem).toBe(false);
  });

  it("defaults hologram settings when missing", () => {
    const f = parseCratesYaml("crates: {}\n");
    expect(f.settings.hologramHeight).toBe(0.6);
    expect(f.settings.placedBlockFromItem).toBe(true);
    expect(serializeCratesYaml(f)).toContain("hologram-height: 0.6");
  });

  it("round-trips without losing data", () => {
    const f = parseCratesYaml(YML);
    expect(parseCratesYaml(serializeCratesYaml(f))).toEqual(f);
  });

  it("computes chances", () => {
    const c = parseCratesYaml(YML).crates[0];
    expect(chancePercent(c, c.prizes[0])).toBeCloseTo(80);
    expect(chancePercent(c, c.prizes[1])).toBeCloseTo(20);
  });

  it("adds a crate with its own key", () => {
    const f = addCrate(parseCratesYaml(YML), "spring");
    const c = f.crates.find((x) => x.id === "spring")!;
    expect(c.keys).toEqual(["spring_key"]);
    expect(f.keys.some((k) => k.id === "spring_key")).toBe(true);
  });

  it("warns about crates without prizes, keys or rewards", () => {
    const f = parseCratesYaml(YML);
    f.crates[0].prizes[0].rewards = [];
    f.crates.push({ id: "empty", name: "E", lore: [], item: { item: "CHEST" }, keys: [], prizes: [], hologram: [], hologramEnabled: true });
    const w = validateCrates(f);
    expect(w.length).toBe(3);
  });
});
