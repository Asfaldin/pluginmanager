import * as yaml from "js-yaml";
import type { RankAppearance, RankId, RanksConfig } from "./types";

const RANK_IDS: RankId[] = ["GRACZ", "VIP", "ADMIN"];

function parseAppearance(raw: any, fallback: RankAppearance): RankAppearance {
  if (!raw) return fallback;
  return {
    prefix: raw.prefix ?? fallback.prefix,
    kolorNicku: raw["kolor-nicku"] ?? fallback.kolorNicku,
  };
}

const FALLBACK: Record<RankId, RankAppearance> = {
  GRACZ: { prefix: "", kolorNicku: "WHITE" },
  VIP: { prefix: "&6&l[VIP] ", kolorNicku: "GOLD" },
  ADMIN: { prefix: "&c&l[ADMIN] ", kolorNicku: "RED" },
};

export function parseRanksConfig(text: string): RanksConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const wygladuRaw = raw.wygladu ?? {};
  const wygladu = {} as Record<RankId, RankAppearance>;
  for (const id of RANK_IDS) {
    wygladu[id] = parseAppearance(wygladuRaw[id], FALLBACK[id]);
  }
  return { wygladu };
}

export function serializeRanksConfig(cfg: RanksConfig): string {
  const wygladu: Record<string, any> = {};
  for (const id of RANK_IDS) {
    wygladu[id] = { prefix: cfg.wygladu[id].prefix, "kolor-nicku": cfg.wygladu[id].kolorNicku };
  }
  return yaml.dump({ wygladu }, { lineWidth: -1 });
}
