import * as yaml from "js-yaml";
import type { SpawnerConfig, SpawnerSettings, SpawnerTypeDef } from "./types";

function parseTyp(id: string, raw: any): SpawnerTypeDef {
  return {
    id,
    encja: raw?.encja ?? "COW",
    nazwaOdmieniona: raw?.["nazwa-odmieniona"] ?? id,
    nazwaPojedyncza: raw?.["nazwa-pojedyncza"] ?? id,
  };
}

function parseUstawienia(raw: any): SpawnerSettings {
  const u = raw ?? {};
  return {
    maxPoziom: Number(u["max-poziom"] ?? 5),
    limitKolejki: Number(u["limit-kolejki"] ?? 50),
    interwalSekundBazowy: Number(u["interwal-sekund-bazowy"] ?? 36),
    interwalSekundNaPoziom: Number(u["interwal-sekund-na-poziom"] ?? -4),
    iloscNaCyklBazowa: Number(u["ilosc-na-cykl-bazowa"] ?? 4),
    iloscNaCyklNaPoziom: Number(u["ilosc-na-cykl-na-poziom"] ?? 1),
    limitSpawnerowNaWyspe: Number(u["limit-spawnerow-na-wyspe"] ?? 10),
    promienAktywnosciGracza: Number(u["promien-aktywnosci-gracza"] ?? 16),
    narzedzieZbierania: u["narzedzie-zbierania"] ?? "STICK",
  };
}

export function parseSpawnerConfig(text: string): SpawnerConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const typyRaw = raw.typy ?? {};
  const typy = Object.entries(typyRaw).map(([id, v]) => parseTyp(id, v));
  return { typy, ustawienia: parseUstawienia(raw.ustawienia) };
}

export function serializeSpawnerConfig(cfg: SpawnerConfig): string {
  const typy: Record<string, any> = {};
  for (const t of cfg.typy) {
    typy[t.id] = { encja: t.encja, "nazwa-odmieniona": t.nazwaOdmieniona, "nazwa-pojedyncza": t.nazwaPojedyncza };
  }
  const ustawienia = {
    "max-poziom": cfg.ustawienia.maxPoziom,
    "limit-kolejki": cfg.ustawienia.limitKolejki,
    "interwal-sekund-bazowy": cfg.ustawienia.interwalSekundBazowy,
    "interwal-sekund-na-poziom": cfg.ustawienia.interwalSekundNaPoziom,
    "ilosc-na-cykl-bazowa": cfg.ustawienia.iloscNaCyklBazowa,
    "ilosc-na-cykl-na-poziom": cfg.ustawienia.iloscNaCyklNaPoziom,
    "limit-spawnerow-na-wyspe": cfg.ustawienia.limitSpawnerowNaWyspe,
    "promien-aktywnosci-gracza": cfg.ustawienia.promienAktywnosciGracza,
    "narzedzie-zbierania": cfg.ustawienia.narzedzieZbierania,
  };
  return yaml.dump({ typy, ustawienia }, { lineWidth: -1 });
}
