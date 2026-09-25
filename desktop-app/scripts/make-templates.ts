// Szablony Sklepu z jednego miejsca (na razie tylko po polsku - angielskie pliki zostają, jakie są,
// przyjdą z tłumaczeniem całej aplikacji):
//  - Mały do aplikacji: src/lib/shopTemplates/small-pl.json (dane niżej),
//  - zawartość startowa pluginu po polsku (to, co wgrywa sam na nowym serwerze) = Duży (big-pl.json).
// Użycie: npx vite-node scripts/make-templates.ts "<folder mainplugins-shop>"
import * as fs from "node:fs";
import * as path from "node:path";
import { defaultSettings, newItem, parseShopSettings, serializeCategory, serializeShopSettings, type CategoryDraft } from "../src/lib/shopYaml";

const pluginDir = process.argv[2];
if (!pluginDir) throw new Error("Podaj folder mainplugins-shop");
const defaultsPl = path.join(pluginDir, "src", "main", "resources", "defaults", "pl");
const templatesDir = path.join("src", "lib", "shopTemplates");

// ---------- Mały: 4 kategorie po 8 przedmiotów, ceny za sztukę, skup = 1/4 kupna ----------

type Row = [item: string, buy: number, sell: number | null];
const SMALL: Array<{ id: string; name: string; icon: string; rows: Row[] }> = [
  {
    id: "bloki",
    name: "&a&lBloki",
    icon: "GRASS_BLOCK",
    rows: [["DIRT", 4, 1], ["COBBLESTONE", 4, 1], ["STONE", 8, 2], ["SAND", 8, 2], ["GRAVEL", 8, 2], ["OAK_LOG", 20, 5], ["GLASS", 12, null], ["BRICKS", 16, null]],
  },
  {
    id: "rudy",
    name: "&b&lRudy i minerały",
    icon: "DIAMOND",
    rows: [["COAL", 20, 5], ["IRON_INGOT", 40, 10], ["COPPER_INGOT", 20, 5], ["GOLD_INGOT", 80, 20], ["REDSTONE", 16, 4], ["LAPIS_LAZULI", 24, 6], ["EMERALD", 200, 50], ["DIAMOND", 400, 100]],
  },
  {
    id: "farma",
    name: "&e&lFarma i jedzenie",
    icon: "WHEAT",
    rows: [["WHEAT", 4, 1], ["CARROT", 4, 1], ["POTATO", 4, 1], ["SUGAR_CANE", 8, 2], ["PUMPKIN", 12, 3], ["MELON", 16, 4], ["BREAD", 12, 3], ["COOKED_BEEF", 20, 5]],
  },
  {
    id: "dropy",
    name: "&c&lDropy z mobów",
    icon: "BONE",
    rows: [["ROTTEN_FLESH", 4, 1], ["ARROW", 4, 1], ["BONE", 8, 2], ["STRING", 8, 2], ["SPIDER_EYE", 12, 3], ["GUNPOWDER", 20, 5], ["BLAZE_ROD", 60, 15], ["ENDER_PEARL", 80, 20]],
  },
];

const smallCats: CategoryDraft[] = SMALL.map((c) => ({
  id: c.id,
  name: c.name,
  icon: { item: c.icon },
  items: c.rows.map(([item, buy, sell]) => ({ ...newItem({ item }), buy, sell, amount: 1, sellAmount: 1 })),
  rotation: null,
  layout: null,
  raw: {},
}));
const smallPl = {
  "shop.yml": serializeShopSettings({ ...defaultSettings(), categoryOrder: smallCats.map((c) => c.id) }),
  categories: Object.fromEntries(smallCats.map((c) => [c.id, serializeCategory(c)])),
};
fs.writeFileSync(path.join(templatesDir, "small-pl.json"), JSON.stringify(smallPl, null, 2) + "\n");

// ---------- zawartość startowa pluginu po polsku = Duży ----------

const HEAD = [
  "# Jedna kategoria sklepu. Ceny są za paczkę: buy = cena za 'amount' sztuk (domyślnie 1),",
  "# dynamic: false przy pozycji = cena stała, ceny dynamiczne jej nie ruszają.",
  "# sell = cena za 'sell-amount' sztuk (domyślnie 1). Bez buy = nie do kupienia, bez sell = nie do sprzedania.",
  "# Zamiast 'item' możesz użyć 'custom: <id>' (przedmiot z katalogu itemów).",
];

/** Plik kategorii z aplikacji -> plik startowy pluginu: nagłówek aplikacji zamieniony na polski opis. */
function withHead(text: string): string {
  const lines = text.split("\n");
  if (lines[0].startsWith("#")) lines.shift();
  return [...HEAD, ...lines].join("\n");
}

const big = JSON.parse(fs.readFileSync(path.join(templatesDir, "big-pl.json"), "utf8")) as { "shop.yml": string; categories: Record<string, string> };
const bigSettings = parseShopSettings(big["shop.yml"]);

const catDir = path.join(defaultsPl, "categories");
for (const f of fs.readdirSync(catDir)) fs.unlinkSync(path.join(catDir, f));
for (const [id, text] of Object.entries(big.categories)) fs.writeFileSync(path.join(catDir, `${id}.yml`), withHead(text));

// shop.yml zostaje z polskimi komentarzami - zmieniają się tylko wartości.
const shopFile = path.join(defaultsPl, "shop.yml");
let s = fs.readFileSync(shopFile, "utf8").replace(/\r\n/g, "\n");
const edits: Array<[RegExp, string]> = [
  [/^categories: .*$/m, `categories: [${bigSettings.categoryOrder.join(", ")}]`],
  [/^price-rounding: .*$/m, `price-rounding: ${bigSettings.rounding}`],
  [/^stats:\n  enabled: .*$/m, `stats:\n  enabled: ${bigSettings.statsEnabled}`],
  [/^rank-bonuses:\n(?:  .*\n)*/m, "rank-bonuses: {}\n# Przykład:\n#   vip: {buy-discount: 2, sell-bonus: 1}\n"],
  [/^menus:\n[\s\S]*$/m, big["shop.yml"].slice(big["shop.yml"].indexOf("\nmenus:\n") + 1)],
];
for (const [re, to] of edits) {
  if (!re.test(s)) throw new Error(`shop.yml: brak ${re}`);
  s = s.replace(re, to);
}
fs.writeFileSync(shopFile, s);

console.log("small-pl:", Object.keys(smallPl.categories).join(", "), "| plugin pl:", bigSettings.categoryOrder.length, "kategorii");
