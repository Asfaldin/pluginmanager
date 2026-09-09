import type { IslandConfig, IslandGuiContent } from "./types";

// Mirrors mainplugins-skyblock/src/main/resources/{wyspy-gui.yml,wyspy-config.yml}
// exactly (byte-identical to the copies on Desktop\Mainplugins-YAML-Config,
// diffed against the real repo before writing this). Used to auto-bootstrap
// the server the first time this page is opened for a profile where the
// plugin hasn't run yet (no file there to read) - same "just works, no
// manual setup" idea as the Vanilla texture base.
export const DEFAULT_ISLAND_GUI: IslandGuiContent = {
  panelWyspy: {
    size: 54,
    przyciski: [
      { slot: 10, akcja: "TELEPORT", material: "OAK_DOOR", nazwa: "Teleport na Wyspę", kolor: "GREEN", lore: ["Kliknij, aby wrócić do siebie"] },
      { slot: 12, akcja: "ULEPSZENIA", material: "BEACON", nazwa: "Ulepszenia Wyspy", kolor: "GOLD", lore: ["Zwiększ rozmiar wyspy"] },
      { slot: 14, akcja: "BANK", material: "GOLD_INGOT", nazwa: "Bank Wyspy", kolor: "YELLOW", lore: [] },
      { slot: 16, akcja: "INFO", material: "PAPER", nazwa: "Informacje o Wyspie", kolor: "AQUA", lore: [] },
      { slot: 20, akcja: "USTAWIENIA", material: "COMPARATOR", nazwa: "Ustawienia Wyspy", kolor: "BLUE", lore: ["Border, budowanie, PvP, moby, pogoda, nazwa...", "Kliknij, aby zarządzać"] },
      { slot: 22, akcja: "PERMISJE", material: "LEVER", nazwa: "Permisje", kolor: "RED", lore: ["Itemy, skrzynie, drzwi i mechanizmy dla gości", "Kliknij, aby zarządzać"] },
      { slot: 24, akcja: "TOPKA", material: "GOLD_BLOCK", nazwa: "Topka Wysp", kolor: "GOLD", lore: ["Ranking wysp według wartości"] },
      { slot: 53, akcja: "USUN_WYSPE", material: "TNT", nazwa: "Usuń Wyspę", kolor: "DARK_RED", lore: ["Ostrzeżenie: Wyspa zniknie bezpowrotnie!"] },
      { slot: 53, akcja: "OPUSC_WYSPE", material: "OAK_BOAT", nazwa: "Opuść Wyspę", kolor: "RED", lore: ["Samodzielnie zrezygnujesz z członkostwa"] },
      { slot: 49, akcja: "WROC_DO_MENU", material: "NETHER_STAR", nazwa: "« Wróć do Menu głównego", kolor: "RED", lore: [] },
      { slot: 49, akcja: "ZAMKNIJ_PANEL", material: "BARRIER", nazwa: "Zamknij Panel", kolor: "RED", lore: [] },
    ],
  },
  permisjeWyspy: {
    size: 27,
    przyciski: [
      { slot: 11, akcja: "ZABIERANIE_ITEMOW", material: "HOPPER", materialWylaczone: "BARRIER", kolor: "GOLD", nazwa: "Zabieranie Itemów", lore: ["Podnoszenie przedmiotów z ziemi przez gości"] },
      { slot: 13, akcja: "DOSTEP_KONTENEROW", material: "CHEST", materialWylaczone: "IRON_DOOR", kolor: "YELLOW", nazwa: "Skrzynie i Kontenery", lore: ["Otwieranie skrzyń/beczek itp. przez gości"] },
      { slot: 15, akcja: "INTERAKCJE", material: "OAK_DOOR", materialWylaczone: "OBSIDIAN", kolor: "AQUA", nazwa: "Drzwi i Mechanizmy", lore: ["Drzwi/dźwignie/przyciski dla gości"] },
      { slot: 22, akcja: "POWROT", material: "ARROW", nazwa: "Powrót do Panelu Wyspy", kolor: "RED", lore: [] },
    ],
  },
  ustawieniaWyspy: {
    size: 45,
    przyciski: [
      { slot: 10, akcja: "WIZUALNY_BORDER", material: "BLUE_STAINED_GLASS", materialWylaczone: "RED_STAINED_GLASS", kolor: "BLUE", nazwa: "Wizualny Border", lore: [] },
      { slot: 11, akcja: "BUDOWANIE_GOSCI", material: "GRASS_BLOCK", materialWylaczone: "BEDROCK", kolor: "GREEN", nazwa: "Budowanie dla Gości", lore: ["Właściciel i członkowie budują zawsze"] },
      { slot: 12, akcja: "PVP", material: "IRON_SWORD", materialWylaczone: "SHIELD", kolor: "RED", nazwa: "PvP na Wyspie", lore: [] },
      { slot: 13, akcja: "POTWORY", material: "ZOMBIE_HEAD", materialWylaczone: "TOTEM_OF_UNDYING", kolor: "DARK_GREEN", nazwa: "Potwory na Wyspie", lore: ["Czy moby mogą się w ogóle pojawiać"] },
      { slot: 19, akcja: "ZABIJANIE_MOBOW_GOSCI", material: "NETHERITE_SWORD", materialWylaczone: "GOLDEN_APPLE", kolor: "DARK_RED", nazwa: "Zabijanie Mobów przez Gości", lore: ["Osobne od spawnu - kto może polować na moby"] },
      { slot: 20, akcja: "POGODA_CZAS", material: "CLOCK", materialWylaczone: "ENDER_EYE", kolor: "LIGHT_PURPLE", nazwa: "Pogoda i Czas", lore: ["Zawsze południe i czyste niebo na wyspie"] },
      { slot: 21, akcja: "NAZWA_WYSPY", material: "NAME_TAG", nazwa: "Nazwa Wyspy", kolor: "AQUA", lore: [] },
      { slot: 22, akcja: "CZLONKOWIE", material: "PLAYER_HEAD", nazwa: "Członkowie Wyspy", kolor: "YELLOW", lore: [] },
      { slot: 40, akcja: "POWROT", material: "ARROW", nazwa: "Powrót do Panelu Wyspy", kolor: "RED", lore: [] },
    ],
  },
  topkaWysp: {
    size: 54,
    slotyRankingu: [10, 11, 12, 13, 14, 15, 16, 19, 20, 21],
    przyciski: [{ slot: 49, akcja: "POWROT", material: "ARROW", nazwa: "Powrót do Panelu Wyspy", kolor: "RED", lore: [] }],
  },
  ulepszeniaWyspy: {
    size: 27,
    przyciski: [
      { slot: 11, akcja: "POWIEKSZ_TEREN", material: "BEACON", materialWylaczone: "BEDROCK", kolor: "YELLOW", nazwa: "Powiększ Teren Wyspy", lore: [] },
      { slot: 13, akcja: "ULEPSZENIE_SPAWNEROW", material: "SPAWNER", nazwa: "Ulepszenie Spawnerów", kolor: "LIGHT_PURPLE", lore: ["Zwiększ tempo i ilość spawnu mobków", "na Twojej wyspie"] },
      { slot: 15, akcja: "POWROT", material: "ARROW", nazwa: "Powrót do Menu", kolor: "RED", lore: [] },
    ],
  },
  ulepszenieSpawnerow: {
    size: 54,
    slotyTypow: [9, 11, 13, 15, 17, 28, 30, 32, 34],
    przyciski: [{ slot: 49, akcja: "POWROT", material: "ARROW", nazwa: "Powrót do Ulepszeń", kolor: "RED", lore: [] }],
  },
  spawnerPodmenu: {
    size: 27,
    przyciski: [
      { slot: 11, akcja: "ILOSC", material: "CLOCK", nazwa: "Ilość", kolor: "YELLOW", lore: ["Więcej mobków na jeden cykl spawnu"] },
      { slot: 15, akcja: "SZYBKOSC", material: "CLOCK", nazwa: "Szybkość", kolor: "YELLOW", lore: ["Krótszy odstęp między cyklami spawnu"] },
      { slot: 22, akcja: "POWROT", material: "ARROW", nazwa: "Powrót do Ulepszeń Spawnerów", kolor: "RED", lore: [] },
    ],
  },
  czlonkowieWyspy: {
    size: 54,
    slotWlasciciela: 0,
    pierwszySlotCzlonka: 1,
    ostatniSlotCzlonka: 44,
    przyciski: [
      { slot: 53, akcja: "ZAPROS", material: "EMERALD", nazwa: "Zaproś gracza", kolor: "GREEN", lore: ["Wpisz nick na czacie po kliknięciu"] },
      { slot: 49, akcja: "POWROT", material: "ARROW", nazwa: "Powrót do Ustawień Wyspy", kolor: "RED", lore: [] },
    ],
  },
};

export const DEFAULT_ISLAND_CONFIG: IslandConfig = {
  tworzenieWyspy: {
    domyslnyRozmiar: 50,
    cooldownProb: [
      { odProby: 1, sekundy: 0 },
      { odProby: 3, sekundy: 60 },
      { odProby: 4, sekundy: 300 },
      { odProby: 5, sekundy: 1800 },
      { odProby: 6, sekundy: 3600 },
      { odProby: 7, sekundy: 86400 },
    ],
  },
  border: { przyrostNaUlepszenie: 25, kosztZaBlok: 1000, maxRozmiar: 750, odstepSiatkiWysp: 10000 },
  teleportBezpieczenstwo: { maxGlebokoscSzukaniaWDol: 10, promienSzukaniaObok: 5 },
  timeouty: { potwierdzenieSekundy: 15, zaproszenieSekundy: 60, maxLotPerlySekundy: 10 },
  nazwaWyspy: { maxDlugosc: 24 },
  wyczyszczenieTerenu: { zapasNaSchemat: 20, chunkiNaTick: 4 },
  wartosciBlokow: {
    NETHERITE_BLOCK: 5000.0,
    DIAMOND_BLOCK: 800.0,
    EMERALD_BLOCK: 600.0,
    BEACON: 3000.0,
    GOLD_BLOCK: 250.0,
    IRON_BLOCK: 100.0,
    COPPER_BLOCK: 40.0,
    LAPIS_BLOCK: 80.0,
    REDSTONE_BLOCK: 60.0,
    COAL_BLOCK: 30.0,
    SPAWNER: 1000.0,
  },
  spawnery: {
    maxPoziom: 5,
    typy: [
      { id: "ZOMBIE", nazwaOdmieniona: "Zombie", ikona: "ROTTEN_FLESH", cenaWSklepie: 20000 },
      { id: "PIG", nazwaOdmieniona: "Świń", ikona: "PORKCHOP", cenaWSklepie: 25000 },
      { id: "SKELETON", nazwaOdmieniona: "Szkieletów", ikona: "BONE", cenaWSklepie: 30000 },
      { id: "COW", nazwaOdmieniona: "Krów", ikona: "LEATHER", cenaWSklepie: 40000 },
      { id: "SPIDER", nazwaOdmieniona: "Pająków", ikona: "STRING", cenaWSklepie: 45000 },
      { id: "CHICKEN", nazwaOdmieniona: "Kur", ikona: "FEATHER", cenaWSklepie: 55000 },
      { id: "CREEPER", nazwaOdmieniona: "Creeperów", ikona: "GUNPOWDER", cenaWSklepie: 60000 },
      { id: "SHEEP", nazwaOdmieniona: "Owiec", ikona: "WHITE_WOOL", cenaWSklepie: 67000 },
      { id: "BREEZE", nazwaOdmieniona: "Breeze'ów", ikona: "BREEZE_ROD", cenaWSklepie: 100000 },
    ],
    kosztBazowyIlosc: { poziomy: { 1: 2500, 2: 5000, 3: 8500 }, domyslny: 17000 },
    kosztBazowySzybkosc: { poziomy: { 1: 3500, 2: 7000, 3: 12000 }, domyslny: 24000 },
  },
  sniffer: {
    promienZbioru: 6,
    wysokoscZbioru: 2,
    promienSzukaniaSkrzyni: 8,
    promienWedrowania: 4,
    skanOdstepSekundy: 5,
    uprawy: ["WHEAT", "CARROTS", "POTATOES", "BEETROOTS", "NETHER_WART"],
  },
};
