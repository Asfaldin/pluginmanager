// Przepisuje pełne questy naszego serwera (gałąź kopia-questy-pelne w Pluginach) na nowy format quests.yml
// -> szablon "Duży PL" w aplikacji. Typy, których prosty plugin nie ma, zamieniane na "przynieś przedmioty".
// Użycie (w desktop-app):
//   git -C "D:/folder z mc" show kopia-questy-pelne:mainplugins-quests/src/main/resources/quests-content.yml > old-quests.yml
//   node scripts/convert-big-quests.mjs old-quests.yml src/lib/questTemplates/big-pl.yml
import fs from "node:fs";
import * as yaml from "js-yaml";

const [, , input, output] = process.argv;
const old = yaml.load(fs.readFileSync(input, "utf8"));

const CRATES = { 1: "basic", 2: "abyss", 3: "darkstar" };
const TOOL_ITEM = { PICKAXE: "IRON_PICKAXE", AXE: "IRON_AXE", HOE: "IRON_HOE", SWORD: "IRON_SWORD", SHOVEL: "IRON_SHOVEL" };
const LEVEL_ITEM = { PICKAXE: ["COBBLESTONE", 64], AXE: ["OAK_LOG", 32], SWORD: ["ROTTEN_FLESH", 16] };
const line = (v) => (v == null ? "~" : String(v));
const ref = (m) => (m["custom-id"] ? { custom: m["custom-id"], amount: m.amount ?? 1 } : { item: m.material, amount: m.amount ?? 1 });

function requirement(r) {
  switch (r?.type) {
    case "FREE": return { type: "free" };
    case "MONEY": return { type: "money", amount: r.amount };
    case "ITEM": return { type: "items", items: r.materials.map(ref) };
    case "TOOL_POSSESS": return { type: "have-item", item: { item: r.material } };
    case "TOOL_LEVEL": {
      const [item, per] = LEVEL_ITEM[r.tool] ?? ["COBBLESTONE", 64];
      return { type: "items", items: [{ item, amount: per * Math.max(1, r.level) }] };
    }
    case "BUY_ITEM":
    case "SELL_ITEM": return { type: "items", items: [ref(r.material)] };
    case "MARKET_OFFER": return { type: "items", items: [{ item: "EMERALD", amount: 1 }] };
    case "MARKET_LISTINGS": return { type: "items", items: [{ item: "EMERALD", amount: r.amount }] };
    default: return { type: "free" };
  }
}

function reward(r) {
  let out = null;
  switch (r.type) {
    case "ITEM": out = { item: r.material, ...(r.amount > 1 ? { amount: r.amount } : {}) }; break;
    case "CUSTOM_ITEM": out = { custom: r.id, ...(r.amount > 1 ? { amount: r.amount } : {}) }; break;
    case "MONEY": out = { money: r.amount }; break;
    case "CRATE": {
      const fb = (r.fallback ?? []).map(reward).filter(Boolean);
      out = { crate: CRATES[r.tier] ?? "basic", fallback: fb.length ? fb : [{ money: 500 }] };
      break;
    }
    case "TOOL": out = { item: TOOL_ITEM[r.tool] ?? "IRON_PICKAXE" }; break;
    case "TITLE": out = { title: r.id }; break;
  }
  if (out && r.silent) out.silent = true;
  return out;
}

const layout = (list) => (list ?? []).map((e) => ({ slot: e.slot, role: e.role, ...(e.material ? { item: e.material } : {}) }));

const categories = {};
for (const [id, c] of Object.entries(old.categories ?? {})) {
  categories[id] = {
    name: line(c["display-name"]),
    icon: { item: c.icon },
    description: c.description ?? "",
    "main-path": !!c["main-path"],
    sequential: !!c.sequential,
    after: c.unlock ? { category: c.unlock.category, quest: c.unlock["quest-id"] } : null,
    "requires-unlock": null,
    "page-layout": layout(c["page-layout"]),
    quests: (c.quests ?? []).map((q) => ({
      id: q.id,
      title: line(q.title),
      description: (q.description ?? []).map(line),
      requirement: requirement(q.requirement),
      // Nasz serwer: zadanie #16 Głównej Ścieżki odblokowuje warp kowal (Spawn: /@warplock kowal kowal).
      rewards: [...(q.rewards ?? []).map(reward).filter(Boolean), ...(id === "GLOWNA_SCIEZKA" && q.id === 16 ? [{ unlock: "kowal" }] : [])],
      ...(q["reward-label"] ? { "reward-label": q["reward-label"] } : {}),
    })),
  };
}

const out = {
  settings: {
    "join-reminder": true,
    "welcome-sound": "mainplugins:quest_welcome",
    filler: { item: "BLACK_STAINED_GLASS_PANE" },
    icons: {
      available: { item: "RED_DYE" },
      completed: { item: "LIME_DYE" },
      locked: { item: "GRAY_DYE" },
      "category-locked": { item: "GRAY_DYE" },
      "category-empty": { item: "BARRIER" },
    },
    buttons: { back: { item: "DARK_OAK_DOOR" }, prev: { item: "ARROW" }, next: { item: "ARROW" } },
  },
  "main-menu": { layout: layout(old["main-menu"]?.layout) },
  "category-order": old["category-order"] ?? Object.keys(categories),
  titles: old.titles ?? {},
  categories,
};
fs.writeFileSync(output, "# Szablon: pełne questy naszego serwera (17 kategorii) - po polsku.\n" + yaml.dump(out, { lineWidth: -1, noRefs: true }));
console.log(`OK: ${Object.keys(categories).length} kategorii -> ${output}`);
