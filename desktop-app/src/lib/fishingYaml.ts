import * as yaml from "js-yaml";
import type { FishFormula, FishingConfig, FishSpecies } from "./types";

function parseFormula(raw: any, bazowa: number, naTrudnosc: number, min: number, max: number): FishFormula {
  const f = raw ?? {};
  return {
    bazowa: Number(f.bazowa ?? bazowa),
    naTrudnosc: Number(f["na-trudnosc"] ?? naTrudnosc),
    min: Number(f.min ?? min),
    max: Number(f.max ?? max),
  };
}

function serializeFormula(f: FishFormula): Record<string, number> {
  return { bazowa: f.bazowa, "na-trudnosc": f.naTrudnosc, min: f.min, max: f.max };
}

export function parseFishingConfig(text: string): FishingConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const gatunkiRaw = raw.gatunki ?? {};
  const gatunki: FishSpecies[] = Object.entries(gatunkiRaw).map(([id, v]: [string, any]) => ({
    customId: id,
    nazwa: v?.nazwa ?? id,
    material: v?.material ?? "COD",
    kolor: v?.kolor ?? "GRAY",
    rzadkosc: v?.rzadkosc ?? "ZWYKLA",
    waga: Number(v?.waga ?? 1),
  }));

  const m = raw.minigra ?? {};
  return {
    gatunki,
    minigra: {
      szerokoscPaska: Number(m["szerokosc-paska"] ?? 40),
      grawitacja: Number(m.grawitacja ?? 1.35),
      impulsKlikniecia: Number(m["impuls-kliknieca"] ?? 0.62),
      okresTickow: Number(m["okres-tickow"] ?? 2),
      maksymalnyCzasSekund: Number(m["maksymalny-czas-sekund"] ?? 30),
      polowaSzerokosciSuwaka: parseFormula(m["polowa-szerokosci-suwaka"], 0.20, -0.022, 0.09, 0.20),
      predkoscRyby: parseFormula(m["predkosc-ryby"], 0.35, 0.18, 0.0, 999.0),
      tempoNapelniania: parseFormula(m["tempo-napelniania"], 0.55, -0.05, 0.30, 0.55),
      tempoOprozniania: parseFormula(m["tempo-oprozniania"], 0.32, 0.05, 0.0, 999.0),
    },
    bonusowaSkrzynkaSzansaProcent: Number(raw["bonusowa-skrzynka"]?.["szansa-procent"] ?? 3.0),
  };
}

export function serializeFishingConfig(cfg: FishingConfig): string {
  const gatunki: Record<string, any> = {};
  for (const g of cfg.gatunki) {
    gatunki[g.customId] = { nazwa: g.nazwa, material: g.material, kolor: g.kolor, rzadkosc: g.rzadkosc, waga: g.waga };
  }
  const out = {
    gatunki,
    minigra: {
      "szerokosc-paska": cfg.minigra.szerokoscPaska,
      grawitacja: cfg.minigra.grawitacja,
      "impuls-kliknieca": cfg.minigra.impulsKlikniecia,
      "okres-tickow": cfg.minigra.okresTickow,
      "maksymalny-czas-sekund": cfg.minigra.maksymalnyCzasSekund,
      "polowa-szerokosci-suwaka": serializeFormula(cfg.minigra.polowaSzerokosciSuwaka),
      "predkosc-ryby": serializeFormula(cfg.minigra.predkoscRyby),
      "tempo-napelniania": serializeFormula(cfg.minigra.tempoNapelniania),
      "tempo-oprozniania": serializeFormula(cfg.minigra.tempoOprozniania),
    },
    "bonusowa-skrzynka": { "szansa-procent": cfg.bonusowaSkrzynkaSzansaProcent },
  };
  return yaml.dump(out, { lineWidth: -1 });
}
