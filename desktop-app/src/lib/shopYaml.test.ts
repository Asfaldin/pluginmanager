import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import {
  activeRotation,
  defaultMenus,
  parseRotationState,
  defaultSettings,
  defaultTuning,
  fromPerPiece,
  isLotted,
  parseCategory,
  moveBackFromPool,
  switchLot,
  displayOrder,
  pageSlots,
  placeItemAt,
  placeCategoryAt,
  hideCategoryFromMenu,
  removeMenuSlot,
  pruneBlankCategorySlots,
  ensureCategorySlots,
  moveToPool,
  newItem,
  parseShopSettings,
  perPiece,
  randomPick,
  categoryBySlot,
  detectSort,
  matchesPriceFilter,
  moveCategoryTo,
  sortItems,
  swapItems,
  serializeCategory,
  serializeShopSettings,
  shopProblems,
  type CategoryDraft,
  type ShopItemDraft,
} from "./shopYaml";

const CATEGORY = `
name: "&bOres"
icon: DIAMOND
extra-top: keep
items:
  - {item: DIAMOND, buy: 150, sell: 60}
  - {item: COBBLESTONE, buy: 640, amount: 64, sell: 50, sell-amount: 64, name: "Bruk", lore: ["&7a"], secret: 1}
  - {custom: spawner_zombie, buy: 20000}
  - {item: WHEAT, buy: 0.16}
rotation:
  enabled: true
  show: 5
  every-days: 14
  note: hi
  pool:
    - {item: ELYTRA, buy: 75000}
    - {item: GOAT_HORN, buy: 20000, instrument: ponder_goat_horn}
`;

describe("shopYaml categories", () => {
  it("reads a category", () => {
    const c = parseCategory("ores", CATEGORY);
    expect(c.name).toBe("&bOres");
    expect(c.icon).toEqual({ item: "DIAMOND" });
    expect(c.items).toHaveLength(4);
    expect(c.items[1]).toMatchObject({ amount: 64, sellAmount: 64, buy: 640, sell: 50, name: "Bruk", lore: ["&7a"] });
    expect(c.items[2].ref).toEqual({ custom: "spawner_zombie" });
    expect(c.items[2].sell).toBeNull();
    expect(c.items[3].buy).toBe(0.16);
    expect(c.rotation?.pool[1].instrument).toBe("ponder_goat_horn");
  });

  it("round-trips and keeps unknown fields", () => {
    const text = serializeCategory(parseCategory("ores", CATEGORY));
    const back = yaml.load(text) as Record<string, any>;
    expect(back["extra-top"]).toBe("keep");
    expect(back.items[1].secret).toBe(1);
    expect(back.items[0]).toEqual({ item: "DIAMOND", buy: 150, sell: 60 });
    expect(back.rotation.note).toBe("hi");
    expect(back.rotation.pool).toHaveLength(2);
    expect(serializeCategory(parseCategory("ores", text))).toBe(text);
  });

  it("writes no rotation when there is none and omits amount 1", () => {
    const text = serializeCategory(parseCategory("x", "name: X\nicon: STONE\nitems:\n  - {item: DIRT, buy: 3, amount: 1}"));
    expect(text).not.toContain("rotation:");
    expect(text).toContain("  - {item: DIRT, buy: 3}\n");
  });
});

describe("shopYaml settings", () => {
  it("empty text gives defaults", () => {
    const s = parseShopSettings("");
    const d = defaultSettings();
    // bez kategorii menu główne nie ma pustych "miejsc na kategorie"
    const expected = { ...d, menus: { ...d.menus, "main-menu": { ...d.menus["main-menu"], layout: pruneBlankCategorySlots(d.menus["main-menu"].layout, []) } } };
    expect({ ...s, raw: {} }).toEqual(expected);
  });

  it("round-trips and keeps unknown fields", () => {
    const s = parseShopSettings("categories: [a, b]\nprice-rounding: whole\ndynamic-prices:\n  enabled: false\n  secret: 5\nmystery: yes\n");
    expect(s.rounding).toBe("whole");
    expect(s.dynamic.enabled).toBe(false);
    const dm = defaultMenus();
    expect(s.menus).toEqual({ ...dm, "main-menu": { ...dm["main-menu"], layout: pruneBlankCategorySlots(dm["main-menu"].layout, ["a", "b"]) } });
    expect(s.menus["main-menu"].layout.filter((e) => e.role === "CATEGORY_SLOT")).toHaveLength(2);
    const text = serializeShopSettings(s);
    const back = yaml.load(text) as Record<string, any>;
    expect(back.mystery).toBe("yes");
    expect(back["dynamic-prices"].secret).toBe(5);
    expect(back.menus["buy-picker"].layout[0]).toEqual({ slot: 11, role: "AMOUNT_SLOT", amount: 1 });
    expect(serializeShopSettings(parseShopSettings(text))).toBe(text);
  });
});

describe("shopYaml prices", () => {
  it("converts per piece", () => {
    expect(perPiece(10, 64)).toBe(0.16);
    expect(fromPerPiece(0.16, 64)).toBe(10.24);
    expect(perPiece(null, 5)).toBeNull();
  });

  it("finds problems", () => {
    const c = parseCategory("x", "name: X\nicon: STONE\nitems:\n  - {item: DIRT, buy: 3, sell: 5}\n  - {item: STONE}");
    const p = shopProblems({ ...defaultSettings(), categoryOrder: [] }, [c]);
    expect(p.some((x) => x.includes("skup za sztukę"))).toBe(true);
    expect(p.some((x) => x.includes("nie ma ani ceny"))).toBe(true);
    expect(p.some((x) => x.includes("nie ma miejsca"))).toBe(true);
    expect(isLotted(c.items[0])).toBe(false);
  });
});

describe("shopYaml rotation pool", () => {
  const cat = (ids: string[]): CategoryDraft => ({
    id: "bloki",
    name: "Bloki",
    icon: { item: "STONE" },
    items: ids.map((id) => newItem({ item: id })),
    rotation: { enabled: true, show: 5, everyDays: 14, announce: true, pool: [], raw: {} },
    raw: {},
  });

  it("moves picked items from the fixed list into the pool", () => {
    const c = cat(["STONE", "DIRT", "SAND", "GRAVEL"]);
    const out = moveToPool(c, [1, 3]);
    expect(out.items.map((i) => (i.ref as any).item)).toEqual(["STONE", "SAND"]);
    expect(out.rotation!.pool.map((i) => (i.ref as any).item)).toEqual(["DIRT", "GRAVEL"]);
  });

  it("keeps items already in the pool", () => {
    const c = cat(["STONE", "DIRT"]);
    c.rotation!.pool = [newItem({ item: "ICE" })];
    const out = moveToPool(c, [0]);
    expect(out.rotation!.pool.map((i) => (i.ref as any).item)).toEqual(["ICE", "STONE"]);
  });

  it("moves a pool item back to the fixed list", () => {
    const c = cat(["STONE"]);
    c.rotation!.pool = [newItem({ item: "ICE" }), newItem({ item: "SAND" })];
    const out = moveBackFromPool(c, [0]);
    expect(out.items.map((i) => (i.ref as any).item)).toEqual(["STONE", "ICE"]);
    expect(out.rotation!.pool.map((i) => (i.ref as any).item)).toEqual(["SAND"]);
  });

  it("puts a pool item back in its old place, not at the end", () => {
    const home = ["MUD", "COBBLESTONE", "SNOW_BLOCK", "STONE"].map((item) => ({ item }));
    const c = cat(["COBBLESTONE", "SNOW_BLOCK", "STONE"]);
    c.rotation!.pool = [newItem({ item: "MUD" })];
    expect(moveBackFromPool(c, [0], home).items.map((i) => (i.ref as any).item)).toEqual(["MUD", "COBBLESTONE", "SNOW_BLOCK", "STONE"]);
    const mid = cat(["MUD", "COBBLESTONE", "STONE"]);
    mid.rotation!.pool = [newItem({ item: "SNOW_BLOCK" }), newItem({ item: "ICE" })];
    // SNOW_BLOCK wraca miedzy bruk a kamien, ICE (nie bylo go w stalych) na koniec
    expect(moveBackFromPool(mid, [0, 1], home).items.map((i) => (i.ref as any).item)).toEqual(["MUD", "COBBLESTONE", "SNOW_BLOCK", "STONE", "ICE"]);
  });

  it("draws random items without repeating and never more than there are", () => {
    const picked = randomPick(4, 10, () => 0.5);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    expect(randomPick(6, 3, () => 0.5)).toHaveLength(3);
    expect(randomPick(6, 0, () => 0.5)).toEqual([]);
  });

  it("does nothing when the category has no rotation", () => {
    const c = { ...cat(["STONE"]), rotation: null };
    expect(moveToPool(c, [0])).toBe(c);
    expect(moveBackFromPool(c, [0])).toBe(c);
  });
});

describe("shopYaml sorting", () => {
  const it2 = (id: string, buy: number | null, sell: number | null, amount = 1, sellAmount = 1) => ({
    ...newItem({ item: id }),
    buy,
    sell,
    amount,
    sellAmount,
  });

  it("sorts by buy price per piece, cheapest first, no price last", () => {
    const list = [it2("A", 640, null, 64), it2("B", null, null), it2("C", 5, null), it2("D", 256, null, 64)];
    expect(sortItems(list, "buy").map((i) => (i.ref as any).item)).toEqual(["D", "C", "A", "B"]);
  });

  it("turns the order around but keeps priceless items last", () => {
    const list = [it2("A", 640, null, 64), it2("B", null, null), it2("C", 5, null), it2("D", 256, null, 64)];
    expect(sortItems(list, "buy", "desc").map((i) => (i.ref as any).item)).toEqual(["A", "C", "D", "B"]);
  });

  it("recognises how the list is already ordered", () => {
    const cheapFirst = [it2("A", 5, null), it2("B", 640, null, 64), it2("C", null, null)];
    expect(detectSort(cheapFirst)).toEqual({ by: "buy", dir: "asc" });
    expect(detectSort([...cheapFirst].reverse().filter((i) => i.buy != null))).toEqual({ by: "buy", dir: "desc" });
    expect(detectSort([it2("A", 5, null), it2("B", 1, null), it2("C", 9, null)])).toBeNull();
    expect(detectSort([])).toBeNull();
  });

  it("sorts by sell price per piece, smallest first", () => {
    const list = [it2("A", null, 64, 1, 64), it2("B", null, 2), it2("C", null, null), it2("D", null, 0.5)];
    expect(sortItems(list, "sell").map((i) => (i.ref as any).item)).toEqual(["D", "A", "B", "C"]);
  });
});

describe("shopYaml price filter", () => {
  const mk = (buy: number | null, sell: number | null) => ({ ...newItem({ item: "STONE" }), buy, sell });
  const both = mk(10, 5);
  const onlyBuy = mk(10, null);
  const onlySell = mk(null, 5);
  const none = mk(null, null);

  it("shows everything by default", () => {
    for (const i of [both, onlyBuy, onlySell, none]) expect(matchesPriceFilter(i, "all")).toBe(true);
  });

  it("splits items by what the player can do with them", () => {
    expect([both, onlyBuy, onlySell, none].map((i) => matchesPriceFilter(i, "buy"))).toEqual([false, true, false, false]);
    expect([both, onlyBuy, onlySell, none].map((i) => matchesPriceFilter(i, "sell"))).toEqual([false, false, true, false]);
    expect([both, onlyBuy, onlySell, none].map((i) => matchesPriceFilter(i, "both"))).toEqual([true, false, false, false]);
  });
});

describe("shopYaml menu categories", () => {
  const slots = (...list: Array<[number, string]>) => list.map(([slot, role]) => ({ slot, role }));

  it("puts categories into category slots in order, one per slot", () => {
    const layout = slots([4, "SEARCH"], [19, "CATEGORY_SLOT"], [20, "CATEGORY_SLOT"], [21, "CATEGORY_SLOT"], [49, "EXIT"]);
    const map = categoryBySlot(layout, ["bloki", "roslinki", "drewno"]);
    expect(map.get(19)).toBe("bloki");
    expect(map.get(20)).toBe("roslinki");
    expect(map.get(21)).toBe("drewno");
    expect(map.has(4)).toBe(false);
  });

  it("leaves spare slots empty when there are fewer categories", () => {
    const layout = slots([19, "CATEGORY_SLOT"], [20, "CATEGORY_SLOT"], [21, "CATEGORY_SLOT"]);
    const map = categoryBySlot(layout, ["bloki"]);
    expect(map.get(19)).toBe("bloki");
    expect(map.get(20)).toBeUndefined();
    expect(map.get(21)).toBeUndefined();
  });

  it("gives all ten categories a slot when the menu has more slots than categories", () => {
    const ids = ["bloki", "roslinki", "drewno", "mineraly", "moby", "narzedzia", "jedzenie", "dekoracje", "kolekcja", "spawnery"];
    const layout = slots(...([19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33, 34].map((s) => [s, "CATEGORY_SLOT"]) as Array<[number, string]>));
    const map = categoryBySlot(layout, ids);
    expect([...map.values()].filter(Boolean)).toEqual(ids);
  });
});

describe("shopYaml category placement", () => {
  const order = ["bloki", "roslinki", "drewno", "mineraly"];

  it("moves a category to the chosen place and shifts the rest", () => {
    expect(moveCategoryTo(order, "mineraly", 0)).toEqual(["mineraly", "bloki", "roslinki", "drewno"]);
    expect(moveCategoryTo(order, "bloki", 2)).toEqual(["roslinki", "drewno", "bloki", "mineraly"]);
  });

  it("adds a category that had no place yet", () => {
    expect(moveCategoryTo(order, "spawnery", 1)).toEqual(["bloki", "spawnery", "roslinki", "drewno", "mineraly"]);
  });

  it("puts it at the end when the place is past the list", () => {
    expect(moveCategoryTo(order, "bloki", 99)).toEqual(["roslinki", "drewno", "mineraly", "bloki"]);
  });

  it("changes nothing when the category is already there", () => {
    expect(moveCategoryTo(order, "drewno", 2)).toEqual(order);
  });
});

describe("shopYaml item order", () => {
  const ids = (list: ShopItemDraft[]) => list.map((i) => (i.ref as any).item);
  const list = [newItem({ item: "A" }), newItem({ item: "B" }), newItem({ item: "C" })];

  it("swaps two items", () => {
    expect(ids(swapItems(list, 0, 2))).toEqual(["C", "B", "A"]);
    expect(ids(list)).toEqual(["A", "B", "C"]);
  });

  it("leaves the list alone when a place is outside it", () => {
    expect(swapItems(list, 0, 9)).toBe(list);
    expect(swapItems(list, -1, 1)).toBe(list);
    expect(swapItems(list, 1, 1)).toBe(list);
  });
});

describe("shopYaml dynamic prices", () => {
  it("reads and writes the fixed-price switch on an item", () => {
    const c = parseCategory("x", "name: X\nicon: STONE\nitems:\n  - {item: DIRT, buy: 10}\n  - {item: COBBLESTONE, buy: 10, dynamic: false}");
    expect(c.items[0].dynamic).toBe(true);
    expect(c.items[1].dynamic).toBe(false);
    const text = serializeCategory(c);
    expect(text).toContain("dynamic: false");
    // Tylko wylaczenie trafia do pliku - wlaczone nie zasmieca wpisow.
    expect(text.match(/dynamic/g)?.length).toBe(1);
    expect(parseCategory("x", text).items[1].dynamic).toBe(false);
  });

  it("keeps the reset announcement and the tuning through a round trip", () => {
    const text = `dynamic-prices:\n  announce-reset: false\n  tuning:\n    max-drop-per-cycle: 0.1\n    cycles-to-rise: 4\n`;
    const s = parseShopSettings(text);
    expect(s.dynamic.announceReset).toBe(false);
    expect(s.dynamic.tuning.maxDropPerCycle).toBe(0.1);
    expect(s.dynamic.tuning.cyclesToRise).toBe(4);
    // Czego nie ma w pliku, bierzemy domyslne.
    expect(s.dynamic.tuning.dropAtTop).toBe(defaultTuning().dropAtTop);
    const back = parseShopSettings(serializeShopSettings(s));
    expect(back.dynamic.announceReset).toBe(false);
    expect(back.dynamic.tuning).toEqual(s.dynamic.tuning);
  });
});

describe("switchLot", () => {
  it("po kilka sztuk i z powrotem daje DOKŁADNIE te same ceny", () => {
    const single = { amount: 1, sellAmount: 64, buy: 10, sell: 50 };
    const lotted = switchLot(single, true);
    expect(lotted).toEqual({ amount: 64, sellAmount: 64, buy: 640, sell: 50 });
    const back = switchLot(lotted, false, single);
    expect(back).toEqual(single);
    // skup 50 za 64 = 0.78 za sztukę - bez pamięci wyszłoby 0.78, z pamięcią wraca 50
    const again = switchLot(back, true, lotted);
    expect(again.sell).toBe(50);
  });

  it("zmieniona w międzyczasie cena się przelicza, a nie wraca stara", () => {
    const lotted = { amount: 64, sellAmount: 64, buy: 640, sell: 50 };
    const single = switchLot(lotted, false);
    const edited = { ...single, buy: 12 };
    expect(switchLot(edited, true, lotted).buy).toBe(768);
  });

  it("wyłączone kupno albo skup zostaje wyłączone", () => {
    expect(switchLot({ amount: 1, sellAmount: 1, buy: null, sell: 5 }, true)).toEqual({ amount: 64, sellAmount: 64, buy: null, sell: 320 });
  });
});

describe("kategorie w menu głównym", () => {
  const L = (slots: number[], extra: { slot: number; role: string }[] = []) => [
    ...extra,
    ...slots.map((slot) => ({ slot, role: "CATEGORY_SLOT" })),
  ];
  const where = (m: { layout: { slot: number; role: string }[]; order: string[] }) =>
    Object.fromEntries([...categoryBySlot(m.layout, m.order)].filter(([, c]) => c).map(([s, c]) => [c, s]));

  it("kategoria idzie dokładnie w kliknięte puste pole, inne zostają na miejscu", () => {
    const m = placeCategoryAt(L([19, 20, 21]), ["bloki", "drewno", "rudy"], "bloki", 40);
    expect(where(m)).toEqual({ bloki: 40, drewno: 20, rudy: 21 });
  });

  it("na polu innej kategorii zamieniają się miejscami", () => {
    const m = placeCategoryAt(L([19, 20, 21]), ["bloki", "drewno", "rudy"], "bloki", 21);
    expect(where(m)).toEqual({ bloki: 21, drewno: 20, rudy: 19 });
  });

  it("kategoria spoza menu wypycha tamtą z menu", () => {
    const m = placeCategoryAt(L([19, 20]), ["bloki", "drewno"], "spawnery", 20);
    expect(where(m)).toEqual({ bloki: 19, spawnery: 20 });
    expect(m.order).not.toContain("drewno");
  });

  it("przycisk albo tło w polu ustępuje kategorii", () => {
    const m = placeCategoryAt(L([19], [{ slot: 4, role: "SEARCH" }, { slot: 30, role: "FILLER" }]), ["bloki"], "bloki", 30);
    expect(where(m)).toEqual({ bloki: 30 });
    expect(m.layout.find((e) => e.slot === 30)?.role).toBe("CATEGORY_SLOT");
    expect(m.layout.find((e) => e.slot === 4)?.role).toBe("SEARCH");
  });

  it("puste miejsca na kategorie znikają, nowe kategorie dostają wolne pole", () => {
    expect(pruneBlankCategorySlots(L([19, 20, 21, 22]), ["a", "b"]).map((e) => e.slot)).toEqual([19, 20]);
    const withSearch = L([19, 20], [{ slot: 21, role: "SEARCH" }]);
    const grown = ensureCategorySlots(withSearch, ["a", "b", "c"], 54);
    expect(where({ layout: grown, order: ["a", "b", "c"] })).toEqual({ a: 19, b: 20, c: 22 });
  });

  it("schowanie kategorii nie przesuwa pozostałych", () => {
    const m = hideCategoryFromMenu(L([19, 20, 21]), ["bloki", "drewno", "rudy"], "bloki");
    expect(where(m)).toEqual({ drewno: 20, rudy: 21 });
  });

  it("usunięcie pola z kategorią nie przesuwa pozostałych", () => {
    const m = removeMenuSlot(L([19, 20, 21]), ["bloki", "drewno", "rudy"], 20);
    expect(where(m)).toEqual({ bloki: 19, rudy: 21 });
  });
});

describe("strona kategorii jak w grze", () => {
  const it3 = [
    { ...newItem({ item: "A" }), buy: 30 },
    { ...newItem({ item: "B" }), buy: 10 },
    { ...newItem({ item: "C" }), buy: null, sell: 5 },
  ];
  it("kolejność: Twoja / od najtańszego / od najwyższego skupu", () => {
    expect(displayOrder(it3, "order")).toEqual([0, 1, 2]);
    expect(displayOrder(it3, "buy")).toEqual([1, 0, 2]);
    expect(displayOrder(it3, "sell")[0]).toBe(2);
  });

  it("wyśrodkowanie małej kategorii jak w pluginie", () => {
    const grid = [10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33, 34];
    expect(pageSlots(grid, 3, true)).toEqual([21, 22, 23]);
    expect(pageSlots(grid, 3, false)).toEqual(grid);
    expect(pageSlots(grid, 9, true)).toEqual(grid);
  });

  it("przedmiot trafia w kliknięte pole, także na szachownicy", () => {
    const layout = [10, 12, 14].map((slot) => ({ slot, role: "ITEM_SLOT" }));
    const items = ["A", "B", "C"].map((item) => newItem({ item }));
    // C w pole 10 -> C jest pierwsze
    const a = placeItemAt(layout, items, 2, 10, 0);
    expect(a.items.map((i) => (i.ref as any).item)).toEqual(["C", "A", "B"]);
    // nowe pole 11 (miedzy 10 a 12) staje sie drugim polem na przedmiot, B tam trafia
    const b = placeItemAt(layout, items, 1, 11, 0);
    expect(b.layout.filter((e) => e.role === "ITEM_SLOT").map((e) => e.slot)).toEqual([10, 11, 12, 14]);
    expect(b.items.map((i) => (i.ref as any).item)).toEqual(["A", "B", "C"]);
  });
});

describe("rotacja w podglądzie strony kategorii", () => {
  const ROT = `kolekcja:\n  picked:\n  - 2\n  - 0\n  next-at: 1790801726330\n  cooldown:\n    '2': 4\n`;
  const cat = (poolSize: number, show = 2, enabled = true) => {
    const pool = parseCategory("x", yaml.dump({ items: Array.from({ length: poolSize }, (_, i) => ({ item: `ITEM_${i}`, buy: 1 })) })).items;
    return { ...parseCategory("kolekcja", "name: K"), rotation: { enabled, show, everyDays: 14, announce: true, pool, raw: {} } };
  };

  it("czyta wylosowane numery z rotation.yml", () => {
    expect(parseRotationState(ROT)).toEqual({ kolekcja: [2, 0] });
    expect(parseRotationState(null)).toEqual({});
    expect(parseRotationState("::nie yaml")).toEqual({});
  });

  it("pokazuje wylosowane przedmioty z puli, a bez losowania - miejsca na losowe", () => {
    const c = cat(3);
    expect(activeRotation(c, [2, 0]).map((it) => it?.ref.item)).toEqual(["ITEM_2", "ITEM_0"]);
    expect(activeRotation(c, undefined)).toEqual([null, null]);
    expect(activeRotation(c, [5])).toEqual([null, null]);
    expect(activeRotation(cat(1, 5), undefined)).toEqual([null]);
    expect(activeRotation(cat(3, 2, false), [0])).toEqual([]);
  });
});
