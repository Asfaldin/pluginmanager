// Szablony Sklepu dla aplikacji (src/lib/shopTemplates/*.json).
//  - small-en / small-pl: kopie treści startowej z pluginu (defaults/<język>/ w mainplugins-shop),
//  - big-pl: nasz stary sklep (scripts/old-shop: sklep-gui.yml, pula-rotacyjna.yml, categories/*.yml)
//    przepisany na nowy format - paczki i ceny bez zmian, "kolekcja" jako kategoria z rotacją,
//    spawnery jako custom: spawner_<typ>, generatory jako custom: <id generatora>, pełne złotówki.
// Uruchom: node scripts/convert-big-shop.mjs  (z folderu desktop-app)
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OLD = path.join(here, "old-shop");
const PLUGIN_DEFAULTS = process.env.SHOP_DEFAULTS ?? "D:/folder z mc/mainplugins-shop/src/main/resources/defaults";
const OUT = path.join(here, "..", "src", "lib", "shopTemplates");
const CATEGORY_HEADER =
  "# One shop category (edited in the PluginManager app). buy = price for 'amount' pieces, sell = price for 'sell-amount' pieces.\n";

const flow = (o) => yaml.dump(o, { flowLevel: 0, lineWidth: -1 }).trim();

function categoryText(name, icon, items, rotation) {
  let t = CATEGORY_HEADER + yaml.dump({ name, icon }, { lineWidth: -1 });
  t += items.length ? "items:\n" + items.map((i) => `  - ${flow(i)}\n`).join("") : "items: []\n";
  if (rotation) {
    t += `rotation:\n  enabled: true\n  show: ${rotation.show}\n  every-days: ${rotation.everyDays}\n`;
    t += "  pool:\n" + rotation.pool.map((i) => `    - ${flow(i)}\n`).join("");
  }
  return t;
}

function smallTemplate(lang) {
  const dir = path.join(PLUGIN_DEFAULTS, lang);
  const shop = fs.readFileSync(path.join(dir, "shop.yml"), "utf8");
  const categories = {};
  for (const f of fs.readdirSync(path.join(dir, "categories"))) {
    categories[f.replace(/\.yml$/, "")] = fs.readFileSync(path.join(dir, "categories", f), "utf8");
  }
  return { "shop.yml": shop, categories };
}

function convertItem(it, category) {
  const out = {};
  const custom = it["custom-id"];
  if (custom) {
    out.custom = String(it.material).toUpperCase() === "SPAWNER" ? `spawner_${String(custom).toLowerCase()}` : String(custom);
  } else {
    out.item = String(it.material).toUpperCase();
  }
  if (it["buy-price"] != null) out.buy = it["buy-price"];
  const amount = it.amount ?? 1;
  if (amount > 1) out.amount = amount;
  if (it["sell-price"] != null) out.sell = it["sell-price"];
  const sellAmount = it["sell-amount"] ?? amount;
  if (sellAmount > 1) out["sell-amount"] = sellAmount;
  // Stary sklep pokazywał własne nazwy na fioletowo i pogrubione - zostawiamy ten wygląd.
  if (it["display-name"] && !custom) out.name = `&d&l${it["display-name"]}`;
  if (Array.isArray(it.lore) && it.lore.length && !custom) out.lore = it.lore.map((l) => `&7${l}`);
  if (it.instrument) out.instrument = it.instrument;
  if (out.buy == null && out.sell == null) console.warn(`${category}: ${out.item ?? out.custom} has no prices`);
  return out;
}

function bigTemplate() {
  const gui = yaml.load(fs.readFileSync(path.join(OLD, "sklep-gui.yml"), "utf8"));
  const pool = yaml.load(fs.readFileSync(path.join(OLD, "pula-rotacyjna.yml"), "utf8")).itemy ?? [];
  const order = gui["category-order"];
  const categories = {};
  for (const id of order) {
    const file = path.join(OLD, "categories", `${id}.yml`);
    if (!fs.existsSync(file)) continue;
    const c = yaml.load(fs.readFileSync(file, "utf8")) ?? {};
    const items = Object.values(c.items ?? {}).map((it) => convertItem(it, id));
    const rotation =
      id === "kolekcja"
        ? {
            show: 5,
            everyDays: 14,
            pool: pool.map((p) => {
              const o = { item: String(p.material).toUpperCase(), buy: p.cena, name: `&d&l${p.nazwa}` };
              if (p.instrument) o.instrument = p.instrument;
              return o;
            }),
          }
        : null;
    categories[id] = categoryText(`&e&l${c.name ?? id}`, String(c.icon ?? "CHEST").toUpperCase(), items, rotation);
  }
  const menus = {};
  for (const screen of ["main-menu", "category-page", "buy-picker", "search-results"]) {
    menus[screen] = { size: gui[screen].size, layout: gui[screen].layout };
  }
  menus.buttons = {
    search: "OAK_SIGN", exit: "BARRIER", back: "COMPASS", prev: "SPECTRAL_ARROW", next: "SPECTRAL_ARROW",
    sort: "HOPPER", "sort-sell": "GOLD_INGOT", "picker-back": "ARROW",
  };
  const shop = {
    categories: order.filter((id) => categories[id]),
    "price-rounding": "whole",
    "dynamic-prices": { enabled: true, "cycle-minutes": 60, "min-multiplier": 0.5, "max-multiplier": 1.5, "reset-days": 14, "max-sell-share": 0.9 },
    stats: { enabled: true },
    menus,
  };
  const header = "# Mainplugins Shop - settings (edited in the PluginManager app). Items and prices are in categories/<id>.yml.\n";
  return { "shop.yml": header + yaml.dump(shop, { lineWidth: -1, flowLevel: 4 }), categories };
}

fs.mkdirSync(OUT, { recursive: true });
const write = (name, t) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(t, null, 1) + "\n", "utf8");
write("small-en.json", smallTemplate("en"));
write("small-pl.json", smallTemplate("pl"));
const big = bigTemplate();
write("big-pl.json", big);
console.log("ok:", Object.keys(big.categories).length, "big categories");
