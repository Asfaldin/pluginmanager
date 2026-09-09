import type { DungeonConfig } from "./types";

// Mirrors mainplugins-dungeons/src/main/resources/dungeons-config.yml exactly.
export const DEFAULT_DUNGEON_CONFIG: DungeonConfig = {
  miejsce: {
    bazowyX: 0,
    bazowyY: 250,
    bazowyZ: 5000,
    odstepPokoi: 40,
    liczbaPokoi: 4,
    promienPokoju: 6,
    materialPodlogiPokoju: "DEEPSLATE_TILES",
    materialScianyPokoju: "DEEPSLATE_BRICKS",
    wysokoscScianyPokoju: 4,
    promienArenyBossa: 10,
    materialPodlogiAreny: "BLACKSTONE",
    materialScianyAreny: "POLISHED_BLACKSTONE_BRICKS",
    wysokoscScianyAreny: 5,
  },
  pokoje: {
    encja: "ZOMBIE",
    iloscBazowa: 3,
    iloscNaPokoj: 1,
    hpBazowe: 20,
    hpNaPokoj: 10,
    obrazeniaBazowe: 3,
    obrazeniaNaPokoj: 1,
  },
  boss: {
    encja: "PIGLIN_BRUTE",
    encjaSlugi: "ZOMBIE",
    maxHp: 200,
    obrazeniaAtaku: 8,
    obrazeniaPocisku: 6,
    okresUmiejetnosciSekundy: 3,
    progPrzywolaniaSlug1: 0.66,
    progPrzywolaniaSlug2: 0.33,
    progSzalu: 0.30,
    nagrodaMonety: 500,
  },
};
