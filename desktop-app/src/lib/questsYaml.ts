import * as yaml from "js-yaml";
import { itemRefFromYaml, itemRefToYaml, type ItemRef } from "./itemRef";
import { parseRewards, rewardsToYaml, type Reward } from "./rewards";

// plugins/MainpluginsQuests/quests.yml - kategorie, zadania i wygląd menu (spec: 2026-09-14-questy-design.md).

export type SlotRole = "CATEGORY_SLOT" | "QUEST_SLOT" | "NAV_PREV" | "NAV_BACK" | "NAV_NEXT" | "FILLER";

export interface SlotEntry {
  slot: number;
  role: SlotRole;
  /** Tylko FILLER: własny wygląd pola. */
  item?: string;
}

export type Requirement =
  | { type: "free" }
  | { type: "items"; items: ItemRef[] }
  | { type: "money"; amount: number }
  | { type: "have-item"; item: ItemRef };

type Obj = Record<string, unknown>;

export interface QuestDef {
  id: number;
  title: string;
  description: string[];
  requirement: Requirement;
  rewards: Reward[];
  rewardLabel?: string;
  /** Pola, których aplikacja nie zna - wracają do pliku bez zmian. */
  extra: Obj;
}

export interface After {
  category: string;
  quest: number;
}

export interface CategoryDef {
  id: string;
  name: string;
  icon: ItemRef;
  description: string;
  mainPath: boolean;
  sequential: boolean;
  after: After | null;
  requiresUnlock: string | null;
  pageLayout: SlotEntry[];
  quests: QuestDef[];
  extra: Obj;
}

export interface QuestSettings {
  joinReminder: boolean;
  welcomeSound: string;
  filler: ItemRef;
  icons: { available: ItemRef; completed: ItemRef; locked: ItemRef; categoryLocked: ItemRef; categoryEmpty: ItemRef };
  buttons: { back: ItemRef; prev: ItemRef; next: ItemRef };
  extra: Obj;
}

export interface QuestsFile {
  settings: QuestSettings;
  mainMenu: SlotEntry[];
  titles: Record<string, string>;
  /** Kolejność = kolejność w menu (category-order). */
  categories: CategoryDef[];
  extra: Obj;
}

export const REQUIREMENT_TYPES: { type: Requirement["type"]; label: string }[] = [
  { type: "items", label: "Przynieś przedmioty (zabiera je)" },
  { type: "free", label: "Za darmo (kliknij i odbierz)" },
  { type: "money", label: "Zapłać pieniądze" },
  { type: "have-item", label: "Pokaż przedmiot (zostaje u gracza)" },
];

export function defaultRequirement(type: Requirement["type"]): Requirement {
  switch (type) {
    case "items":
      return { type: "items", items: [{ item: "COBBLESTONE", amount: 16 }] };
    case "money":
      return { type: "money", amount: 100 };
    case "have-item":
      return { type: "have-item", item: { item: "IRON_PICKAXE" } };
    default:
      return { type: "free" };
  }
}

const DEFAULT_SETTINGS: QuestSettings = {
  joinReminder: true,
  welcomeSound: "mainplugins:quest_welcome",
  filler: { item: "BLACK_STAINED_GLASS_PANE" },
  icons: {
    available: { item: "RED_DYE" },
    completed: { item: "LIME_DYE" },
    locked: { item: "GRAY_DYE" },
    categoryLocked: { item: "GRAY_DYE" },
    categoryEmpty: { item: "BARRIER" },
  },
  buttons: { back: { item: "DARK_OAK_DOOR" }, prev: { item: "ARROW" }, next: { item: "ARROW" } },
  extra: {},
};

const HEADER = "# Questy - zarządzane przez aplikację (komentarze nie są zachowywane). Po zmianach: /@quests reload.\n";

const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
// Linijka "~" w YAML to null - przywracamy ją jako tekst "~" (częsty ozdobnik w opisach).
const line = (v: unknown): string => (v == null ? "~" : String(v));

function rest(o: Obj, known: string[]): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) if (!known.includes(k)) out[k] = v;
  return out;
}

/** Tekst bez kodów kolorów (&6, &l ...) - do list i podpowiedzi. */
export function plain(text: string): string {
  return text.replace(/&[0-9a-fk-or]/gi, "");
}

function parseLayout(raw: unknown): SlotEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(obj)
    .filter((e) => typeof e.slot === "number")
    .map((e) => ({
      slot: e.slot as number,
      role: String(e.role ?? "FILLER").toUpperCase() as SlotRole,
      ...(e.item != null ? { item: String(e.item) } : {}),
    }));
}

function layoutOut(l: SlotEntry[]): Obj[] {
  return l.map((e) => ({ slot: e.slot, role: e.role, ...(e.item ? { item: e.item } : {}) }));
}

function parseRequirement(raw: unknown): Requirement {
  const r = obj(raw);
  switch (String(r.type ?? "").toLowerCase()) {
    case "items":
      return { type: "items", items: (Array.isArray(r.items) ? r.items : []).map((i) => itemRefFromYaml(i)) };
    case "money":
      return { type: "money", amount: typeof r.amount === "number" ? r.amount : 100 };
    case "have-item": {
      const item = itemRefFromYaml(r.item);
      if (typeof r.amount === "number" && r.amount > 1) item.amount = r.amount;
      return { type: "have-item", item };
    }
    default:
      return { type: "free" };
  }
}

function requirementOut(r: Requirement): Obj {
  switch (r.type) {
    case "items":
      return { type: "items", items: r.items.map((i) => itemRefToYaml(i, true)) };
    case "money":
      return { type: "money", amount: r.amount };
    case "have-item": {
      const { amount, ...item } = r.item;
      return { type: "have-item", item: itemRefToYaml(item), ...(amount && amount > 1 ? { amount } : {}) };
    }
    default:
      return { type: "free" };
  }
}

const QUEST_KEYS = ["id", "title", "description", "requirement", "rewards", "reward-label"];

function parseQuest(raw: unknown): QuestDef {
  const q = obj(raw);
  const label = q["reward-label"];
  return {
    id: typeof q.id === "number" ? q.id : 0,
    title: line(q.title),
    description: Array.isArray(q.description) ? q.description.map(line) : [],
    requirement: parseRequirement(q.requirement),
    rewards: parseRewards(q.rewards),
    ...(label != null && String(label).trim() !== "" ? { rewardLabel: String(label) } : {}),
    extra: rest(q, QUEST_KEYS),
  };
}

function questOut(q: QuestDef): Obj {
  return {
    ...q.extra,
    id: q.id,
    title: q.title,
    description: q.description,
    requirement: requirementOut(q.requirement),
    rewards: rewardsToYaml(q.rewards),
    ...(q.rewardLabel ? { "reward-label": q.rewardLabel } : {}),
  };
}

const CATEGORY_KEYS = ["name", "icon", "description", "main-path", "sequential", "after", "requires-unlock", "page-layout", "quests"];

function parseCategory(id: string, raw: unknown): CategoryDef {
  const c = obj(raw);
  const a = obj(c.after);
  const unlock = c["requires-unlock"];
  return {
    id,
    name: c.name != null ? String(c.name) : id,
    icon: c.icon != null ? itemRefFromYaml(c.icon) : { item: "BOOK" },
    description: c.description != null ? String(c.description) : "",
    mainPath: c["main-path"] === true,
    sequential: c.sequential === true,
    after: typeof a.category === "string" && typeof a.quest === "number" ? { category: a.category, quest: a.quest } : null,
    requiresUnlock: unlock != null && String(unlock).trim() !== "" ? String(unlock).trim().toLowerCase() : null,
    pageLayout: parseLayout(c["page-layout"]),
    quests: Array.isArray(c.quests) ? c.quests.map(parseQuest) : [],
    extra: rest(c, CATEGORY_KEYS),
  };
}

function categoryOut(c: CategoryDef): Obj {
  const unlock = c.requiresUnlock?.trim();
  return {
    ...c.extra,
    name: c.name,
    icon: itemRefToYaml(c.icon),
    description: c.description,
    "main-path": c.mainPath,
    sequential: c.sequential,
    after: c.after ? { category: c.after.category, quest: c.after.quest } : null,
    "requires-unlock": unlock ? unlock : null,
    "page-layout": layoutOut(c.pageLayout),
    quests: c.quests.map(questOut),
  };
}

export function parseQuestsYaml(text: string): QuestsFile {
  const raw = obj(text.trim() ? yaml.load(text) : {});
  const s = obj(raw.settings);
  const icons = obj(s.icons);
  const buttons = obj(s.buttons);
  const d = DEFAULT_SETTINGS;
  const ref = (v: unknown, def: ItemRef): ItemRef => (v == null ? def : itemRefFromYaml(v));
  const settings: QuestSettings = {
    joinReminder: s["join-reminder"] !== false,
    welcomeSound: s["welcome-sound"] != null ? String(s["welcome-sound"]) : d.welcomeSound,
    filler: ref(s.filler, d.filler),
    icons: {
      available: ref(icons.available, d.icons.available),
      completed: ref(icons.completed, d.icons.completed),
      locked: ref(icons.locked, d.icons.locked),
      categoryLocked: ref(icons["category-locked"], d.icons.categoryLocked),
      categoryEmpty: ref(icons["category-empty"], d.icons.categoryEmpty),
    },
    buttons: {
      back: ref(buttons.back, d.buttons.back),
      prev: ref(buttons.prev, d.buttons.prev),
      next: ref(buttons.next, d.buttons.next),
    },
    extra: rest(s, ["join-reminder", "welcome-sound", "filler", "icons", "buttons"]),
  };
  const all = Object.entries(obj(raw.categories)).map(([id, v]) => parseCategory(id, v));
  const order = Array.isArray(raw["category-order"]) ? raw["category-order"].map(String) : [];
  const categories = [
    ...order.map((id) => all.find((c) => c.id === id)).filter((c): c is CategoryDef => !!c),
    ...all.filter((c) => !order.includes(c.id)),
  ];
  const titles: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(raw.titles))) titles[k] = v == null ? "" : String(v);
  return {
    settings,
    mainMenu: parseLayout(obj(raw["main-menu"]).layout),
    titles,
    categories,
    extra: rest(raw, ["settings", "main-menu", "category-order", "titles", "categories"]),
  };
}

export function serializeQuestsYaml(f: QuestsFile): string {
  const s = f.settings;
  const settings = {
    ...s.extra,
    "join-reminder": s.joinReminder,
    "welcome-sound": s.welcomeSound,
    filler: itemRefToYaml(s.filler),
    icons: {
      available: itemRefToYaml(s.icons.available),
      completed: itemRefToYaml(s.icons.completed),
      locked: itemRefToYaml(s.icons.locked),
      "category-locked": itemRefToYaml(s.icons.categoryLocked),
      "category-empty": itemRefToYaml(s.icons.categoryEmpty),
    },
    buttons: {
      back: itemRefToYaml(s.buttons.back),
      prev: itemRefToYaml(s.buttons.prev),
      next: itemRefToYaml(s.buttons.next),
    },
  };
  const categories: Obj = {};
  for (const c of f.categories) categories[c.id] = categoryOut(c);
  const out = {
    ...f.extra,
    settings,
    "main-menu": { layout: layoutOut(f.mainMenu) },
    "category-order": f.categories.map((c) => c.id),
    titles: f.titles,
    categories,
  };
  return HEADER + yaml.dump(out, { lineWidth: -1, noRefs: true });
}

export function nextQuestId(c: CategoryDef): number {
  return c.quests.reduce((m, q) => Math.max(m, q.id), 0) + 1;
}

export function emptyQuest(id: number): QuestDef {
  return {
    id,
    title: `Zadanie ${id}`,
    description: [],
    requirement: defaultRequirement("items"),
    rewards: [{ type: "money", value: "100", amount: 1, silent: false, fallback: [] }],
    extra: {},
  };
}

/** Układ strony nowej kategorii: 5 zadań w rzędzie + powrót. */
const SIDE_LAYOUT: SlotEntry[] = [
  { slot: 20, role: "QUEST_SLOT" },
  { slot: 21, role: "QUEST_SLOT" },
  { slot: 22, role: "QUEST_SLOT" },
  { slot: 23, role: "QUEST_SLOT" },
  { slot: 24, role: "QUEST_SLOT" },
  { slot: 49, role: "NAV_BACK" },
];

export function addCategory(f: QuestsFile, id: string, name: string): QuestsFile {
  const c: CategoryDef = {
    id,
    name,
    icon: { item: "BOOK" },
    description: "",
    mainPath: false,
    sequential: false,
    after: null,
    requiresUnlock: null,
    pageLayout: SIDE_LAYOUT.map((e) => ({ ...e })),
    quests: [emptyQuest(1)],
    extra: {},
  };
  return { ...f, categories: [...f.categories, c] };
}

/** Usuwa kategorię i zdejmuje "odblokowana po" z kategorii, które na nią wskazywały. */
export function removeCategory(f: QuestsFile, id: string): QuestsFile {
  return {
    ...f,
    categories: f.categories.filter((c) => c.id !== id).map((c) => (c.after?.category === id ? { ...c, after: null } : c)),
  };
}

export function moveInList<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** Ostrzeżenia przed wysłaniem - to, co plugin pominie albo czego gracz nie zobaczy. */
export function validateQuests(f: QuestsFile): string[] {
  const w: string[] = [];
  const mains = f.categories.filter((c) => c.mainPath);
  if (mains.length === 0) w.push("Żadna kategoria nie jest Główną Ścieżką - nie będzie powitania ani przypomnienia.");
  if (mains.length > 1) w.push(`Kilka kategorii ma „Główna Ścieżka”: ${mains.map((c) => c.id).join(", ")} - liczy się tylko pierwsza.`);
  const slots = f.mainMenu.filter((e) => e.role === "CATEGORY_SLOT").length;
  if (slots < f.categories.length) {
    w.push(`Menu główne ma ${slots} miejsc na kategorie, a kategorii jest ${f.categories.length} - nadmiarowe nie będą widoczne.`);
  }
  for (const c of f.categories) {
    if (c.quests.length === 0) w.push(`Kategoria „${c.id}” nie ma zadań (w grze: „W budowie”).`);
    if (!c.pageLayout.some((e) => e.role === "QUEST_SLOT")) w.push(`Kategoria „${c.id}” nie ma na stronie żadnego miejsca na zadanie.`);
    if (c.after) {
      const src = f.categories.find((x) => x.id === c.after!.category);
      if (!src) w.push(`Kategoria „${c.id}” odblokowuje się po nieistniejącej kategorii „${c.after.category}”.`);
      else if (!src.quests.some((q) => q.id === c.after!.quest)) {
        w.push(`Kategoria „${c.id}” odblokowuje się po zadaniu #${c.after.quest} z „${src.id}”, a takiego zadania nie ma.`);
      }
    }
    if (c.requiresUnlock != null && !c.requiresUnlock.trim()) w.push(`Kategoria „${c.id}” wymaga odblokowania, ale nazwa jest pusta.`);
    const seen = new Set<number>();
    for (const q of c.quests) {
      if (seen.has(q.id)) w.push(`W kategorii „${c.id}” numer zadania #${q.id} się powtarza.`);
      seen.add(q.id);
      if (q.rewards.length === 0) w.push(`Zadanie #${q.id} w „${c.id}” nie daje żadnej nagrody.`);
      if (q.requirement.type === "items" && q.requirement.items.length === 0) {
        w.push(`Zadanie #${q.id} w „${c.id}” wymaga przedmiotów, ale lista jest pusta.`);
      }
    }
  }
  return w;
}
