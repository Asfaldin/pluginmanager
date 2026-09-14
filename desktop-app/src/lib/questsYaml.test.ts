import { describe, expect, it } from "vitest";
import { QUEST_TEMPLATES, templateFor } from "./questTemplates";
import {
  addCategory,
  emptyQuest,
  moveInList,
  nextQuestId,
  parseQuestsYaml,
  plain,
  removeCategory,
  serializeQuestsYaml,
  validateQuests,
} from "./questsYaml";

const SAMPLE = `
custom-top: keep me
settings:
  join-reminder: false
  filler: { item: GRAY_STAINED_GLASS_PANE }
  icons:
    available: { item: ARROW }
main-menu:
  layout:
    - { slot: 13, role: CATEGORY_SLOT }
    - { slot: 0, role: FILLER, item: RED_STAINED_GLASS_PANE }
category-order: [main_path, mining]
titles:
  beginner: "&7[Beginner] "
categories:
  mining:
    name: Mining
    icon: { item: IRON_PICKAXE }
    after: { category: main_path, quest: 2 }
    requires-unlock: nether
    page-layout:
      - { slot: 20, role: QUEST_SLOT }
    quests:
      - id: 1
        title: Coal
        requirement: { type: items, items: [ { item: COAL, amount: 32 }, { custom: TROPHY } ] }
        rewards:
          - money: 100
  main_path:
    name: Main Path
    icon: { item: KNOWLEDGE_BOOK }
    description: Start here
    main-path: true
    sequential: true
    after: null
    requires-unlock: null
    my-extra: 5
    page-layout:
      - { slot: 10, role: QUEST_SLOT }
      - { slot: 49, role: NAV_BACK }
    quests:
      - id: 1
        title: Welcome
        description: [Hi, ~]
        requirement: { type: free }
        rewards:
          - item: WOODEN_PICKAXE
        note: extra field
      - id: 2
        title: Pay
        requirement: { type: money, amount: 200 }
        rewards:
          - crate: basic
            fallback:
              - money: 300
        reward-label: "&e1 crate"
      - id: 3
        title: Shield
        requirement: { type: have-item, item: { item: SHIELD }, amount: 2 }
        rewards:
          - unlock: kowal
`;

describe("questsYaml", () => {
  it("parses settings, layout, categories in menu order and requirements", () => {
    const f = parseQuestsYaml(SAMPLE);
    expect(f.settings.extra).toEqual({});
    expect(f.settings.filler).toEqual({ item: "GRAY_STAINED_GLASS_PANE" });
    expect(f.settings.icons.available).toEqual({ item: "ARROW" });
    expect(f.settings.icons.completed).toEqual({ item: "LIME_DYE" });
    expect(f.mainMenu).toEqual([
      { slot: 13, role: "CATEGORY_SLOT" },
      { slot: 0, role: "FILLER", item: "RED_STAINED_GLASS_PANE" },
    ]);
    expect(f.categories.map((c) => c.id)).toEqual(["main_path", "mining"]);
    const main = f.categories[0];
    expect(main.glow).toBe(true); // stare main-path: true = blask
    expect(main.quests[0].description).toEqual(["Hi", "~"]);
    expect(main.quests[0].requirement).toEqual({ type: "free" });
    expect(main.quests[1].requirement).toEqual({ type: "money", amount: 200 });
    expect(main.quests[1].rewards[0].fallback[0].type).toBe("money");
    expect(main.quests[1].rewardLabel).toBe("&e1 crate");
    expect(main.quests[2].requirement).toEqual({ type: "have-item", item: { item: "SHIELD", amount: 2 } });
    expect(main.quests[2].rewards[0]).toMatchObject({ type: "unlock", value: "kowal" });
    const mining = f.categories[1];
    expect(mining.after).toEqual({ category: "main_path", quest: 2 });
    expect(mining.requiresUnlock).toBe("nether");
    expect(mining.quests[0].requirement).toEqual({
      type: "items",
      items: [{ item: "COAL", amount: 32 }, { custom: "TROPHY" }],
    });
  });

  it("round-trips without losing anything, unknown fields included", () => {
    const f = parseQuestsYaml(SAMPLE);
    const text = serializeQuestsYaml(f);
    expect(parseQuestsYaml(text)).toEqual(f);
    expect(text).toContain("custom-top: keep me");
    expect(text).not.toContain("join-reminder"); // usunięte ustawienie znika z pliku
    expect(text).toContain("my-extra: 5");
    expect(text).toContain("note: extra field");
    expect(text).toContain("category-order:\n  - main_path\n  - mining");
  });

  it("writes item amounts in requirements and nulls for no lock", () => {
    const text = serializeQuestsYaml(parseQuestsYaml(SAMPLE));
    expect(text).toContain("amount: 1");
    expect(text).toContain("requires-unlock: null");
    expect(text).toContain("after: null");
  });

  it("helpers: next id, new quest, add/remove category, move", () => {
    const f = parseQuestsYaml(SAMPLE);
    expect(nextQuestId(f.categories[0])).toBe(4);
    expect(emptyQuest(7).id).toBe(7);
    const added = addCategory(f, "fishing", "Fishing");
    expect(added.categories.map((c) => c.id)).toEqual(["main_path", "mining", "fishing"]);
    expect(added.categories[2].quests).toHaveLength(1);
    const removed = removeCategory(f, "main_path");
    expect(removed.categories.map((c) => c.id)).toEqual(["mining"]);
    expect(removed.categories[0].after).toBeNull();
    expect(moveInList([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveInList([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(plain("&6&lMain &rPath")).toBe("Main Path");
  });

  it("validation lists what the plugin would skip or not show", () => {
    const f = parseQuestsYaml(SAMPLE);
    expect(validateQuests(f)).toEqual([
      "Menu główne ma 1 miejsc na kategorie, a kategorii jest 2 - nadmiarowe nie będą widoczne.",
    ]);
    const broken = {
      ...f,
      categories: f.categories.map((c) =>
        c.id === "mining"
          ? { ...c, after: { category: "main_path", quest: 99 }, quests: [{ ...c.quests[0], rewards: [] }, { ...c.quests[0], rewards: [] }] }
          : c
      ),
    };
    const w = validateQuests(broken);
    expect(w).toContain("Kategoria „mining” odblokowuje się po zadaniu #99 z „main_path”, a takiego zadania nie ma.");
    expect(w).toContain("W kategorii „mining” numer zadania #1 się powtarza.");
    expect(w).toContain("Zadanie #1 w „mining” nie daje żadnej nagrody.");
  });

  it("empty text gives an empty file with default settings", () => {
    const f = parseQuestsYaml("");
    expect(f.categories).toEqual([]);
    expect(f.settings.icons.locked).toEqual({ item: "GRAY_DYE" });
  });
});


describe("quest templates", () => {
  it("small templates: 6 categories, Main Path 10 quests, no warnings", () => {
    for (const id of ["small-en", "small-pl"] as const) {
      const f = parseQuestsYaml(QUEST_TEMPLATES.find((t) => t.id === id)!.text);
      expect(f.categories.map((c) => c.id)).toEqual(["main_path", "mining", "farming", "hunting", "fishing", "woodcutting"]);
      expect(f.categories[0].quests).toHaveLength(10);
      expect(validateQuests(f)).toEqual([]);
    }
    expect(templateFor("pl")).toBe(QUEST_TEMPLATES[1].text);
    expect(templateFor("en")).toBe(QUEST_TEMPLATES[0].text);
  });

  it("big template: 17 categories, only the 4 simple requirement types, kowal unlock on #16", () => {
    const f = parseQuestsYaml(QUEST_TEMPLATES.find((t) => t.id === "big-pl")!.text);
    expect(f.categories).toHaveLength(17);
    const types = new Set(f.categories.flatMap((c) => c.quests.map((q) => q.requirement.type)));
    for (const t of types) expect(["free", "items", "money", "have-item"]).toContain(t);
    const q16 = f.categories.find((c) => c.id === "GLOWNA_SCIEZKA")!.quests.find((q) => q.id === 16)!;
    expect(q16.rewards.some((r) => r.type === "unlock" && r.value === "kowal")).toBe(true);
    const rewardTypes = new Set(f.categories.flatMap((c) => c.quests.flatMap((q) => q.rewards.map((r) => r.type))));
    for (const t of rewardTypes) expect(["money", "item", "custom", "crate", "title", "unlock"]).toContain(t);
  });
});
