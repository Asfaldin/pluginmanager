import type { HudConfig } from "./types";

// Mirrors mainplugins-hud/src/main/resources/hud-config.yml exactly.
export const DEFAULT_HUD_CONFIG: HudConfig = {
  proTipy: [
    "&7Zbierz spawner: &fPPM patykiem",
    "&7Sortuj sklep: &fPPM na przycisk",
    "&7Szukaj w sklepie: &fkliknij tabliczkę",
    "&7Limit spawnerów: &f10 na wyspę",
    "&7Ceny resetują się co &f14 dni",
    "&7Wpisz &f/komendy",
    "&7Wpisz &f/questy &7po nagrody",
    "&7Handluj graczami: &f/targ",
    "&7Powiększ wyspę: &f/is menu",
    "&7Dołącz na &9Discord&7!",
    "&7Zaproś znajomego na wyspę",
    "&7Wpisz &f/menu",
  ],
  maxTop: 10,
  sekundNaSlajd: 8,
  coKtorySlajdRynkowy: 3,
  szerokoscProTipu: 32,
  szerokoscPadGracza: 34,
  fakeTopGraczy: [
    { nick: "Steve", kasa: 15000.0 },
    { nick: "Alex", kasa: 10500.0 },
    { nick: "Notch", kasa: 8200.0 },
  ],
  fakeTopWysp: [
    { nick: "Steve", rozmiar: 120, czlonkowie: 3 },
    { nick: "Alex", rozmiar: 95, czlonkowie: 2 },
    { nick: "Notch", rozmiar: 80, czlonkowie: 1 },
  ],
};
