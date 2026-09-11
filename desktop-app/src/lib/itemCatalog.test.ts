import { describe, expect, it } from "vitest";
import { categoryLabel, changedFiles, duplicateIds, normalizeEntry, parseItemsFile, serializeItemsFile } from "./itemCatalog";
import type { CustomItemEntry } from "./types";

const item = (over: Partial<CustomItemEntry>): CustomItemEntry => ({
  id: "X",
  file: "a.yml",
  material: "STONE",
  name: "",
  lore: [],
  model: "",
  glint: false,
  enchants: [],
  unbreakable: false,
  ...over,
});

describe("parseItemsFile", () => {
  it("reads every field and remembers the file", () => {
    const [it0] = parseItemsFile(
      "fishing.yml",
      `items:
  MAGIC_SWORD:
    material: DIAMOND_SWORD
    name: "&bMagic"
    lore: ["&7one", ~]
    model: "mainplugins:magic"
    glint: true
    enchants:
      sharpness: 5
      unbreaking: 3
    unbreakable: true
`
    );
    expect(it0).toEqual(
      item({
        id: "MAGIC_SWORD",
        file: "fishing.yml",
        material: "DIAMOND_SWORD",
        name: "&bMagic",
        lore: ["&7one", "~"],
        model: "mainplugins:magic",
        glint: true,
        enchants: [
          { name: "sharpness", level: 5 },
          { name: "unbreaking", level: 3 },
        ],
        unbreakable: true,
      })
    );
  });

  it("gives defaults for missing fields and handles an empty file", () => {
    expect(parseItemsFile("a.yml", "items:\n  ROCK:\n    material: STONE\n")).toEqual([item({ id: "ROCK" })]);
    expect(parseItemsFile("a.yml", "")).toEqual([]);
    expect(parseItemsFile("a.yml", "items: {}\n")).toEqual([]);
  });
});

describe("serializeItemsFile", () => {
  it("round-trips through parse", () => {
    const items = [
      item({ id: "A", name: 'say "hi"', lore: ["&7x"], enchants: [{ name: "sharpness", level: 5 }], unbreakable: true }),
      item({ id: "B", material: "DIRT", glint: true, model: "ns:path" }),
    ];
    expect(parseItemsFile("a.yml", serializeItemsFile(items))).toEqual(items);
  });

  it("writes an empty items map when a file has no items left", () => {
    const text = serializeItemsFile([]);
    expect(text).toContain("items: {}");
    expect(parseItemsFile("a.yml", text)).toEqual([]);
  });
});

describe("duplicateIds", () => {
  it("finds ids used twice, ignoring letter case", () => {
    expect(duplicateIds([item({ id: "A" }), item({ id: "a", file: "b.yml" }), item({ id: "B" })])).toEqual(["A"]);
  });
});

describe("changedFiles", () => {
  it("lists only files whose content changed, including emptied and new ones", () => {
    const before = [item({ id: "A", file: "a.yml" }), item({ id: "B", file: "b.yml" }), item({ id: "C", file: "c.yml" })];
    const after = [
      item({ id: "A", file: "a.yml" }),
      item({ id: "B", file: "b.yml", glint: true }),
      item({ id: "D", file: "my-items.yml" }),
    ];
    expect(changedFiles(before, after).sort()).toEqual(["b.yml", "c.yml", "my-items.yml"]);
  });
});

describe("categoryLabel", () => {
  it("gives friendly names for known files and a tidy name for others", () => {
    expect(categoryLabel("my-items.yml")).toBe("Moje itemy");
    expect(categoryLabel("fishing.yml")).toBe("Łowienie");
    expect(categoryLabel("quests.yml")).toBe("Questy");
    expect(categoryLabel("examples.yml")).toBe("Przykłady");
    expect(categoryLabel("mainpluginscrates.yml")).toBe("Mainpluginscrates");
  });
});

describe("normalizeEntry", () => {
  it("fills fields missing in old saved presets", () => {
    const old = { id: "A", material: "STONE", name: "", lore: [], model: "", glint: false } as unknown as CustomItemEntry;
    expect(normalizeEntry(old)).toEqual(item({ id: "A", file: "my-items.yml" }));
  });
});
