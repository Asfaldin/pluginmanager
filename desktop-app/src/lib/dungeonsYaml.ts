import * as yaml from "js-yaml";
import type { DungeonBoss, DungeonConfig, DungeonMiejsce, DungeonPokoje } from "./types";

export function parseDungeonConfig(text: string): DungeonConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const m = raw.miejsce ?? {};
  const p = raw.pokoje ?? {};
  const b = raw.boss ?? {};

  const miejsce: DungeonMiejsce = {
    bazowyX: Number(m["bazowy-x"] ?? 0),
    bazowyY: Number(m["bazowy-y"] ?? 250),
    bazowyZ: Number(m["bazowy-z"] ?? 5000),
    odstepPokoi: Number(m["odstep-pokoi"] ?? 40),
    liczbaPokoi: Number(m["liczba-pokoi"] ?? 4),
    promienPokoju: Number(m["promien-pokoju"] ?? 6),
    materialPodlogiPokoju: m["material-podlogi-pokoju"] ?? "DEEPSLATE_TILES",
    materialScianyPokoju: m["material-sciany-pokoju"] ?? "DEEPSLATE_BRICKS",
    wysokoscScianyPokoju: Number(m["wysokosc-sciany-pokoju"] ?? 4),
    promienArenyBossa: Number(m["promien-areny-bossa"] ?? 10),
    materialPodlogiAreny: m["material-podlogi-areny"] ?? "BLACKSTONE",
    materialScianyAreny: m["material-sciany-areny"] ?? "POLISHED_BLACKSTONE_BRICKS",
    wysokoscScianyAreny: Number(m["wysokosc-sciany-areny"] ?? 5),
  };

  const pokoje: DungeonPokoje = {
    encja: p.encja ?? "ZOMBIE",
    iloscBazowa: Number(p["ilosc-bazowa"] ?? 3),
    iloscNaPokoj: Number(p["ilosc-na-pokoj"] ?? 1),
    hpBazowe: Number(p["hp-bazowe"] ?? 20),
    hpNaPokoj: Number(p["hp-na-pokoj"] ?? 10),
    obrazeniaBazowe: Number(p["obrazenia-bazowe"] ?? 3),
    obrazeniaNaPokoj: Number(p["obrazenia-na-pokoj"] ?? 1),
  };

  const boss: DungeonBoss = {
    encja: b.encja ?? "PIGLIN_BRUTE",
    encjaSlugi: b["encja-slugi"] ?? "ZOMBIE",
    maxHp: Number(b["max-hp"] ?? 200),
    obrazeniaAtaku: Number(b["obrazenia-ataku"] ?? 8),
    obrazeniaPocisku: Number(b["obrazenia-pocisku"] ?? 6),
    okresUmiejetnosciSekundy: Number(b["okres-umiejetnosci-sekundy"] ?? 3),
    progPrzywolaniaSlug1: Number(b["prog-przywolania-slug-1"] ?? 0.66),
    progPrzywolaniaSlug2: Number(b["prog-przywolania-slug-2"] ?? 0.33),
    progSzalu: Number(b["prog-szalu"] ?? 0.30),
    nagrodaMonety: Number(b["nagroda-monety"] ?? 500),
  };

  return { miejsce, pokoje, boss };
}

export function serializeDungeonConfig(cfg: DungeonConfig): string {
  const out = {
    miejsce: {
      "bazowy-x": cfg.miejsce.bazowyX,
      "bazowy-y": cfg.miejsce.bazowyY,
      "bazowy-z": cfg.miejsce.bazowyZ,
      "odstep-pokoi": cfg.miejsce.odstepPokoi,
      "liczba-pokoi": cfg.miejsce.liczbaPokoi,
      "promien-pokoju": cfg.miejsce.promienPokoju,
      "material-podlogi-pokoju": cfg.miejsce.materialPodlogiPokoju,
      "material-sciany-pokoju": cfg.miejsce.materialScianyPokoju,
      "wysokosc-sciany-pokoju": cfg.miejsce.wysokoscScianyPokoju,
      "promien-areny-bossa": cfg.miejsce.promienArenyBossa,
      "material-podlogi-areny": cfg.miejsce.materialPodlogiAreny,
      "material-sciany-areny": cfg.miejsce.materialScianyAreny,
      "wysokosc-sciany-areny": cfg.miejsce.wysokoscScianyAreny,
    },
    pokoje: {
      encja: cfg.pokoje.encja,
      "ilosc-bazowa": cfg.pokoje.iloscBazowa,
      "ilosc-na-pokoj": cfg.pokoje.iloscNaPokoj,
      "hp-bazowe": cfg.pokoje.hpBazowe,
      "hp-na-pokoj": cfg.pokoje.hpNaPokoj,
      "obrazenia-bazowe": cfg.pokoje.obrazeniaBazowe,
      "obrazenia-na-pokoj": cfg.pokoje.obrazeniaNaPokoj,
    },
    boss: {
      encja: cfg.boss.encja,
      "encja-slugi": cfg.boss.encjaSlugi,
      "max-hp": cfg.boss.maxHp,
      "obrazenia-ataku": cfg.boss.obrazeniaAtaku,
      "obrazenia-pocisku": cfg.boss.obrazeniaPocisku,
      "okres-umiejetnosci-sekundy": cfg.boss.okresUmiejetnosciSekundy,
      "prog-przywolania-slug-1": cfg.boss.progPrzywolaniaSlug1,
      "prog-przywolania-slug-2": cfg.boss.progPrzywolaniaSlug2,
      "prog-szalu": cfg.boss.progSzalu,
      "nagroda-monety": cfg.boss.nagrodaMonety,
    },
  };
  return yaml.dump(out, { lineWidth: -1 });
}
