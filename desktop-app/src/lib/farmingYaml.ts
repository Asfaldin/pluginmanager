import * as yaml from "js-yaml";
import type { FarmingConfig } from "./types";

export function parseFarmingConfig(text: string): FarmingConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const z = raw["zlota-marchewka"] ?? {};
  return {
    zlotaMarchewkaIloscMin: Number(z["ilosc-min"] ?? 2),
    zlotaMarchewkaIloscMax: Number(z["ilosc-max"] ?? 4),
  };
}

export function serializeFarmingConfig(cfg: FarmingConfig): string {
  return yaml.dump(
    { "zlota-marchewka": { "ilosc-min": cfg.zlotaMarchewkaIloscMin, "ilosc-max": cfg.zlotaMarchewkaIloscMax } },
    { lineWidth: -1 },
  );
}
