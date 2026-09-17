// Słownik nazw przedmiotów dla mainplugins-core (names/pl.yml, names/en.yml).
// Nazwy pochodzą z plików językowych Minecrafta (assets klienta), bo serwer sam ich nie zna -
// napis "Bruk" dorysowuje klient gracza, a plugin widzi tylko COBBLESTONE.
// Lista przedmiotów: src/lib/minecraftItems.ts (ALL_ITEMS).
// Uruchom: node scripts/generuj-nazwy-itemow.mjs  (z folderu desktop-app)
// Wymaga zainstalowanego Minecrafta na tym komputerze (%APPDATA%/.minecraft/assets).
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ITEMS_TS = path.join(here, "..", "src", "lib", "minecraftItems.ts");
const OUT_DIR = path.join("D:", "folder z mc", "mainplugins-core", "src", "main", "resources", "names");
const ASSETS = path.join(process.env.APPDATA ?? "", ".minecraft", "assets");

/** ALL_ITEMS z minecraftItems.ts - bez uruchamiania TypeScriptu. */
function readMaterials() {
  const text = fs.readFileSync(ITEMS_TS, "utf8");
  const body = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  return [...body.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]);
}

/** Najnowszy indeks assetów -> zawartość minecraft/lang/<kod>.json. */
function readLang(code) {
  const indexes = fs
    .readdirSync(path.join(ASSETS, "indexes"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: fs.statSync(path.join(ASSETS, "indexes", f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of indexes) {
    const objects = JSON.parse(fs.readFileSync(path.join(ASSETS, "indexes", f), "utf8")).objects;
    const entry = objects[`minecraft/lang/${code}.json`];
    if (!entry) continue;
    const file = path.join(ASSETS, "objects", entry.hash.slice(0, 2), entry.hash);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  throw new Error(`Nie znalazłem ${code}.json w assetach Minecrafta (${ASSETS}).`);
}

/** en_us nie ma osobnego pliku w assetach - angielskie nazwy robimy z nazwy materiału. */
function fallbackEnglish(material) {
  return material
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function nameFor(lang, material) {
  const id = material.toLowerCase();
  return lang[`item.minecraft.${id}`] ?? lang[`block.minecraft.${id}`] ?? null;
}

function dumpYaml(header, entries) {
  const lines = [header, ""];
  for (const [material, name] of entries) {
    // Cudzysłowy wszędzie - część nazw ma dwukropki albo przecinki.
    lines.push(`  ${material}: "${name.replace(/"/g, '\\"')}"`);
  }
  return lines.join("\n") + "\n";
}

const materials = readMaterials();
const pl = readLang("pl_pl");
let en;
try {
  en = readLang("en_us");
} catch {
  en = {};
}

const plRows = [];
const enRows = [];
const missing = [];
for (const m of materials) {
  const plName = nameFor(pl, m);
  const enName = nameFor(en, m) ?? fallbackEnglish(m);
  if (plName) plRows.push([m, plName]);
  else missing.push(m);
  enRows.push([m, enName]);
}

const HEAD_PL =
  "# Polskie nazwy przedmiotów Minecrafta dla wszystkich pluginów Mainplugins.\n" +
  "# Używane w wyszukiwarkach (Sklep, Targ) i w wiadomościach na czacie.\n" +
  "# Możesz dopisać własne nazwy albo poprawić istniejące - klucz to nazwa materiału.\n" +
  "# Przeładowanie bez restartu: /@reloadlang\n" +
  "names:";
const HEAD_EN =
  "# English item names for all Mainplugins plugins.\n" +
  "# Used by the search boxes (Shop, Market) and in chat messages.\n" +
  "# You can add your own names or fix existing ones - the key is the material name.\n" +
  "# Reload without a restart: /@reloadlang\n" +
  "names:";

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "pl.yml"), dumpYaml(HEAD_PL, plRows), "utf8");
fs.writeFileSync(path.join(OUT_DIR, "en.yml"), dumpYaml(HEAD_EN, enRows), "utf8");

console.log(`Materiałów: ${materials.length}`);
console.log(`pl.yml: ${plRows.length} nazw`);
console.log(`en.yml: ${enRows.length} nazw`);
if (missing.length) console.log(`Bez polskiej nazwy (${missing.length}): ${missing.slice(0, 15).join(", ")}...`);
