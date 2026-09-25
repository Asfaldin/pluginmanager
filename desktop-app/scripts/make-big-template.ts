// Duży szablon Sklepu = to, co jest teraz w sklepie na serwerze testowym (ten sam odczyt i zapis co aplikacja).
// Użycie: npx vite-node scripts/make-big-template.ts <folder MainpluginsShop>
import * as fs from "node:fs";
import * as path from "node:path";
import { parseCategory, parseShopSettings, serializeCategory, serializeShopSettings } from "../src/lib/shopYaml";

const dir = process.argv[2];
if (!dir) throw new Error("Podaj folder MainpluginsShop");
const settings = parseShopSettings(fs.readFileSync(path.join(dir, "shop.yml"), "utf8"));
const categories: Record<string, string> = {};
for (const id of settings.categoryOrder) {
  const file = path.join(dir, "categories", `${id}.yml`);
  if (!fs.existsSync(file)) continue;
  categories[id] = serializeCategory(parseCategory(id, fs.readFileSync(file, "utf8")));
}
const out = { "shop.yml": serializeShopSettings(settings), categories };
fs.writeFileSync(path.join("src", "lib", "shopTemplates", "big-pl.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`big-pl.json: ${Object.keys(categories).length} kategorii`);
