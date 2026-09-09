import type { SpawnerConfig } from "./types";

// Mirrors mainplugins-spawners/src/main/resources/spawnery-typy.yml exactly. Used to
// auto-bootstrap the server the first time this page is opened for a profile where the
// plugin hasn't run yet (no file there to read) - same idea as DEFAULT_MENU_GUI.
export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  typy: [
    { id: "COW", encja: "COW", nazwaOdmieniona: "Krów", nazwaPojedyncza: "Krowa" },
    { id: "SHEEP", encja: "SHEEP", nazwaOdmieniona: "Owiec", nazwaPojedyncza: "Owca" },
    { id: "PIG", encja: "PIG", nazwaOdmieniona: "Świń", nazwaPojedyncza: "Świnia" },
    { id: "CHICKEN", encja: "CHICKEN", nazwaOdmieniona: "Kur", nazwaPojedyncza: "Kura" },
    { id: "SPIDER", encja: "SPIDER", nazwaOdmieniona: "Pająków", nazwaPojedyncza: "Pająk" },
    { id: "ZOMBIE", encja: "ZOMBIE", nazwaOdmieniona: "Zombie", nazwaPojedyncza: "Zombie" },
    { id: "SKELETON", encja: "SKELETON", nazwaOdmieniona: "Szkieletów", nazwaPojedyncza: "Szkielet" },
    { id: "CREEPER", encja: "CREEPER", nazwaOdmieniona: "Creeperów", nazwaPojedyncza: "Creeper" },
    { id: "BREEZE", encja: "BREEZE", nazwaOdmieniona: "Breeze'ów", nazwaPojedyncza: "Breeze" },
  ],
  ustawienia: {
    maxPoziom: 5,
    limitKolejki: 50,
    interwalSekundBazowy: 36,
    interwalSekundNaPoziom: -4,
    iloscNaCyklBazowa: 4,
    iloscNaCyklNaPoziom: 1,
    limitSpawnerowNaWyspe: 10,
    promienAktywnosciGracza: 16,
    narzedzieZbierania: "STICK",
  },
};
