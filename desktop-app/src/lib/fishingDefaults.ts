import type { FishingConfig } from "./types";

// Mirrors mainplugins-fishing/src/main/resources/fishing-config.yml exactly.
export const DEFAULT_FISHING_CONFIG: FishingConfig = {
  gatunki: [
    { customId: "FISH_KARP_MIELIZNY", nazwa: "Karp Mielizny", material: "COD", kolor: "GRAY", rzadkosc: "ZWYKLA", waga: 40 },
    { customId: "FISH_SREBRNY_LESZCZ", nazwa: "Srebrny Leszcz", material: "SALMON", kolor: "GRAY", rzadkosc: "ZWYKLA", waga: 30 },
    { customId: "FISH_TECZOWY_SKRZELACZ", nazwa: "Tęczowy Skrzelacz", material: "TROPICAL_FISH", kolor: "GREEN", rzadkosc: "NIEZWYKLA", waga: 15 },
    { customId: "FISH_KOLCZASTY_NURKACZ", nazwa: "Kolczasty Nurkacz", material: "PUFFERFISH", kolor: "GREEN", rzadkosc: "NIEZWYKLA", waga: 10 },
    { customId: "FISH_SZMARAGDOWY_WEGORZ", nazwa: "Szmaragdowy Węgorz", material: "TROPICAL_FISH", kolor: "AQUA", rzadkosc: "RZADKA", waga: 4 },
    { customId: "FISH_MGLAWICOWY_SUM", nazwa: "Mgławicowy Sum", material: "COD", kolor: "AQUA", rzadkosc: "RZADKA", waga: 1 },
  ],
  minigra: {
    szerokoscPaska: 40,
    grawitacja: 1.35,
    impulsKlikniecia: 0.62,
    okresTickow: 2,
    maksymalnyCzasSekund: 30,
    polowaSzerokosciSuwaka: { bazowa: 0.20, naTrudnosc: -0.022, min: 0.09, max: 0.20 },
    predkoscRyby: { bazowa: 0.35, naTrudnosc: 0.18, min: 0.0, max: 999.0 },
    tempoNapelniania: { bazowa: 0.55, naTrudnosc: -0.05, min: 0.30, max: 0.55 },
    tempoOprozniania: { bazowa: 0.32, naTrudnosc: 0.05, min: 0.0, max: 999.0 },
  },
  bonusowaSkrzynkaSzansaProcent: 3.0,
};
