import * as yaml from "js-yaml";
import type {
  QuestCategory,
  QuestEntry,
  QuestsContent,
  Requirement,
  RewardEntry,
  SlotEntry,
} from "./types";

const HEADER =
  "# Zarzadzane przez PluginManager. Przeladowanie: @reloadquesty.\n";

// A line that's just "~" (a common decorative divider in quest descriptions)
// parses as YAML null, not the literal text "~" - unquoted, YAML only
// recognizes "~" as null when it's the WHOLE scalar. Left as null it renders
// as blank/"null" in the UI (and can crash formatted-text rendering
// elsewhere in the app), so restore the most likely intended text instead of
// passing null through.
function sanitizeLine(raw: any): string {
  return raw == null ? "~" : String(raw);
}

function cloneSlots(raw: any[]): SlotEntry[] {
  return (raw ?? []).map((s) => ({ slot: s.slot, role: s.role, material: s.material }));
}

function parseRequirement(raw: any): Requirement {
  switch (raw?.type) {
    case "ITEM":
      return {
        type: "ITEM",
        materials: (raw.materials ?? []).map((m: any) => ({
          material: m.material,
          amount: m.amount,
          customId: m["custom-id"],
          displayName: m["display-name"],
        })),
      };
    case "MONEY":
      return { type: "MONEY", amount: raw.amount };
    case "TOOL_POSSESS":
      return { type: "TOOL_POSSESS", material: raw.material };
    case "TOOL_LEVEL":
      return { type: "TOOL_LEVEL", tool: raw.tool, level: raw.level };
    case "MARKET_OFFER":
      return { type: "MARKET_OFFER" };
    case "BUY_ITEM":
      return { type: "BUY_ITEM", material: parseRequirementMaterial(raw.material) };
    case "SELL_ITEM":
      return { type: "SELL_ITEM", material: parseRequirementMaterial(raw.material) };
    case "MARKET_LISTINGS":
      return { type: "MARKET_LISTINGS", amount: raw.amount };
    default:
      return { type: "FREE" };
  }
}

function parseRequirementMaterial(raw: any): { material: string; amount: number; customId?: string; displayName?: string } {
  return {
    material: raw?.material,
    amount: raw?.amount ?? 1,
    customId: raw?.["custom-id"],
    displayName: raw?.["display-name"],
  };
}

function parseReward(raw: any): RewardEntry {
  const silent = raw.silent ? { silent: true } : {};
  switch (raw.type) {
    case "CUSTOM_ITEM":
      return { type: "CUSTOM_ITEM", id: raw.id, amount: raw.amount, ...silent };
    case "MONEY":
      return { type: "MONEY", amount: raw.amount, ...silent };
    case "CRATE":
      return {
        type: "CRATE",
        tier: raw.tier,
        fallback: raw.fallback ? raw.fallback.map(parseReward) : undefined,
        ...silent,
      };
    case "TOOL":
      return { type: "TOOL", tool: raw.tool, ...silent };
    case "TITLE":
      return { type: "TITLE", id: raw.id, ...silent };
    default:
      return { type: "ITEM", material: raw.material, amount: raw.amount, ...silent };
  }
}

function parseQuest(raw: any): QuestEntry {
  return {
    id: raw.id,
    title: sanitizeLine(raw.title),
    description: (raw.description ?? []).map(sanitizeLine),
    requirement: parseRequirement(raw.requirement),
    rewards: (raw.rewards ?? []).map(parseReward),
    rewardLabel: raw["reward-label"] != null ? String(raw["reward-label"]) : undefined,
  };
}

function parseCategory(raw: any): QuestCategory {
  return {
    displayName: sanitizeLine(raw["display-name"]),
    icon: raw.icon,
    description: raw.description ?? "",
    mainPath: Boolean(raw["main-path"]),
    sequential: Boolean(raw.sequential),
    unlock: raw.unlock ? { category: raw.unlock.category, questId: raw.unlock["quest-id"] } : null,
    pageLayout: cloneSlots(raw["page-layout"]),
    quests: (raw.quests ?? []).map(parseQuest),
  };
}

export function parseQuestsContent(text: string): QuestsContent {
  if (!text.trim()) {
    return { mainMenuLayout: [], categoryOrder: [], titles: {}, categories: {} };
  }
  const raw = (yaml.load(text) ?? {}) as any;
  const categoryOrder: string[] = raw["category-order"] ?? [];
  const categories: Record<string, QuestCategory> = {};
  for (const [id, value] of Object.entries(raw.categories ?? {})) {
    categories[id] = parseCategory(value);
  }
  return {
    mainMenuLayout: cloneSlots(raw["main-menu"]?.layout),
    categoryOrder,
    titles: raw.titles ?? {},
    categories,
  };
}

function serializeRequirement(r: Requirement): any {
  switch (r.type) {
    case "ITEM":
      return {
        type: "ITEM",
        materials: r.materials.map((m) => {
          const o: any = { material: m.material, amount: m.amount };
          if (m.customId) o["custom-id"] = m.customId;
          if (m.displayName) o["display-name"] = m.displayName;
          return o;
        }),
      };
    case "MONEY":
      return { type: "MONEY", amount: r.amount };
    case "TOOL_POSSESS":
      return { type: "TOOL_POSSESS", material: r.material };
    case "TOOL_LEVEL":
      return { type: "TOOL_LEVEL", tool: r.tool, level: r.level };
    case "MARKET_OFFER":
      return { type: "MARKET_OFFER" };
    case "BUY_ITEM":
      return { type: "BUY_ITEM", material: serializeRequirementMaterial(r.material) };
    case "SELL_ITEM":
      return { type: "SELL_ITEM", material: serializeRequirementMaterial(r.material) };
    case "MARKET_LISTINGS":
      return { type: "MARKET_LISTINGS", amount: r.amount };
    default:
      return { type: "FREE" };
  }
}

function serializeRequirementMaterial(m: { material: string; amount: number; customId?: string; displayName?: string }): any {
  const o: any = { material: m.material, amount: m.amount };
  if (m.customId) o["custom-id"] = m.customId;
  if (m.displayName) o["display-name"] = m.displayName;
  return o;
}

function serializeReward(r: RewardEntry): any {
  let base: any;
  switch (r.type) {
    case "CUSTOM_ITEM":
      base = { type: "CUSTOM_ITEM", id: r.id, amount: r.amount };
      break;
    case "MONEY":
      base = { type: "MONEY", amount: r.amount };
      break;
    case "CRATE":
      base = { type: "CRATE", tier: r.tier };
      if (r.fallback && r.fallback.length > 0) base.fallback = r.fallback.map(serializeReward);
      break;
    case "TOOL":
      base = { type: "TOOL", tool: r.tool };
      break;
    case "TITLE":
      base = { type: "TITLE", id: r.id };
      break;
    default:
      base = { type: "ITEM", material: r.material, amount: r.amount };
  }
  if (r.silent) base.silent = true;
  return base;
}

function serializeQuest(q: QuestEntry): any {
  const out: any = {
    id: q.id,
    title: q.title,
    description: q.description,
    requirement: serializeRequirement(q.requirement),
    rewards: q.rewards.map(serializeReward),
  };
  if (q.rewardLabel) out["reward-label"] = q.rewardLabel;
  return out;
}

function serializeCategory(c: QuestCategory): any {
  return {
    "display-name": c.displayName,
    icon: c.icon,
    description: c.description,
    "main-path": c.mainPath,
    sequential: c.sequential,
    unlock: c.unlock ? { category: c.unlock.category, "quest-id": c.unlock.questId } : null,
    "page-layout": c.pageLayout,
    quests: c.quests.map(serializeQuest),
  };
}

export function serializeQuestsContent(content: QuestsContent): string {
  const categories: Record<string, any> = {};
  for (const id of content.categoryOrder) {
    if (content.categories[id]) categories[id] = serializeCategory(content.categories[id]);
  }
  const obj = {
    "main-menu": { layout: content.mainMenuLayout },
    "category-order": content.categoryOrder,
    titles: content.titles,
    categories,
  };
  return HEADER + yaml.dump(obj, { lineWidth: -1 });
}
