import type { MenuGuiContent } from "./types";

// Mirrors mainplugins-menu/src/main/resources/menu-gui.yml exactly. Used to
// auto-bootstrap the server the first time this page is opened for a profile
// where the plugin hasn't run yet (no file there to read) - same idea as
// DEFAULT_ISLAND_GUI in islandDefaults.ts.
export const DEFAULT_MENU_GUI: MenuGuiContent = {
  size: 45,
  tlo: "GRAY_STAINED_GLASS_PANE",
  przyciski: [
    { slot: 11, material: "EMERALD", nazwa: "Sklep Serwerowy", lore: ["Kupuj i sprzedawaj u serwera (/sklep)"], komenda: "sklep zmenu" },
    { slot: 12, material: "GOLD_INGOT", nazwa: "Rynek Graczy", lore: ["Handluj z innymi graczami (/targ)"], komenda: "targ zmenu" },
    { slot: 13, material: "GRASS_BLOCK", nazwa: "Twoja Wyspa", lore: ["Zarządzaj swoją wyspą (/is)"], komenda: "is menu zmenu" },
    { slot: 14, material: "BOOK", nazwa: "Zadania (Questy)", lore: ["Odbierz nagrody za zadania (/zadania)"], komenda: "zadania zmenu" },
    { slot: 33, material: "HOPPER", nazwa: "Szybka Sprzedaż", lore: ["Sprzedaj masowo przedmioty z eq (/sprzedajwszystko)"], komenda: "sprzedajwszystko" },
    { slot: 20, material: "COMPARATOR", nazwa: "Ustawienia Wyspy", lore: ["Border, budowanie, PvP, moby, pogoda, nazwa...", "(/is ustawienia)"], komenda: "is ustawienia" },
    { slot: 22, material: "LEVER", nazwa: "Permisje Wyspy", lore: ["Itemy, skrzynie, drzwi i mechanizmy dla gości", "(/is permisje)"], komenda: "is permisje" },
    { slot: 24, material: "TNT", nazwa: "Usuń Wyspę", lore: ["Ostrzeżenie: Wyspa zniknie bezpowrotnie!", "(/is usun)"], komenda: "is usun" },
  ],
};
