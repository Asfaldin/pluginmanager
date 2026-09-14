// Wspólny format nagród (fundament, RewardService w core): lista "rewards:" w każdym configu.
// Ten sam model w każdym edytorze aplikacji (Skrzynki, Questy, później Osiągnięcia).

export type RewardType = "money" | "item" | "custom" | "command" | "crate" | "key" | "title" | "unlock";

export interface Reward {
  type: string;
  /** Kwota / materiał / id / komenda - zawsze tekst w aplikacji. */
  value: string;
  amount: number;
  silent: boolean;
  fallback: Reward[];
}

export const REWARD_TYPES: { type: RewardType; label: string }[] = [
  { type: "money", label: "Pieniądze" },
  { type: "item", label: "Zwykły item" },
  { type: "custom", label: "Custom item" },
  { type: "command", label: "Komenda" },
  { type: "crate", label: "Skrzynka" },
  { type: "key", label: "Klucz" },
  { type: "title", label: "Tytuł" },
  { type: "unlock", label: "Odblokowanie" },
];

const RESERVED = new Set(["amount", "silent", "fallback"]);

export function emptyReward(type: RewardType = "money"): Reward {
  return { type, value: type === "money" ? "100" : "", amount: 1, silent: false, fallback: [] };
}

export function parseRewards(raw: unknown): Reward[] {
  if (!Array.isArray(raw)) return [];
  const out: Reward[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const typeKey = Object.keys(obj).find((k) => !RESERVED.has(k));
    if (!typeKey) continue;
    out.push({
      type: typeKey.toLowerCase(),
      value: obj[typeKey] == null ? "" : String(obj[typeKey]),
      amount: typeof obj.amount === "number" && obj.amount >= 1 ? obj.amount : 1,
      silent: obj.silent === true,
      fallback: parseRewards(obj.fallback),
    });
  }
  return out;
}

export function rewardsToYaml(list: Reward[]): Record<string, unknown>[] {
  return list.map((r) => {
    const o: Record<string, unknown> = {};
    const num = Number(r.value);
    o[r.type] = r.type === "money" && r.value.trim() !== "" && Number.isFinite(num) ? num : r.value;
    if (r.amount > 1 && r.type !== "money" && r.type !== "command") o.amount = r.amount;
    if (r.silent) o.silent = true;
    if (r.fallback.length > 0) o.fallback = rewardsToYaml(r.fallback);
    return o;
  });
}
