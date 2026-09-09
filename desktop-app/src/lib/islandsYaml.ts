import * as yaml from "js-yaml";
import type { CooldownProba, CostCurve, IslandButton, IslandConfig, IslandGuiContent, IslandScreen, SpawnerType } from "./types";

// A lore/description line that's just "~" (a common decorative divider in
// item lore) parses as YAML null, not the literal text "~" - unquoted, YAML
// only recognizes "~" as null when it's the WHOLE scalar. Left as null it
// crashes MinecraftTextInput's color-code parser (calls .length on it), so
// restore the most likely intended text instead of passing null through.
function sanitizeLoreLine(raw: any): string {
  return raw == null ? "~" : String(raw);
}

function parseButton(raw: any): IslandButton {
  return {
    slot: Number(raw.slot),
    akcja: raw.akcja,
    material: raw.material,
    materialWylaczone: raw["material-wylaczone"] ?? undefined,
    nazwa: raw.nazwa ?? "",
    kolor: raw.kolor ?? undefined,
    lore: Array.isArray(raw.lore) ? raw.lore.map(sanitizeLoreLine) : [],
  };
}

function serializeButton(b: IslandButton): Record<string, any> {
  const out: Record<string, any> = { slot: b.slot, akcja: b.akcja, material: b.material };
  if (b.materialWylaczone) out["material-wylaczone"] = b.materialWylaczone;
  out.nazwa = b.nazwa;
  if (b.kolor) out.kolor = b.kolor;
  out.lore = b.lore;
  return out;
}

function parseScreen(raw: any): IslandScreen {
  return {
    size: Number(raw?.size ?? 54),
    przyciski: Array.isArray(raw?.przyciski) ? raw.przyciski.map(parseButton) : [],
  };
}

function serializeScreen(screen: IslandScreen): Record<string, any> {
  return { size: screen.size, przyciski: screen.przyciski.map(serializeButton) };
}

export function parseIslandGuiContent(text: string): IslandGuiContent {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  return {
    panelWyspy: parseScreen(raw["panel-wyspy"]),
    permisjeWyspy: parseScreen(raw["permisje-wyspy"]),
    ustawieniaWyspy: parseScreen(raw["ustawienia-wyspy"]),
    topkaWysp: { ...parseScreen(raw["topka-wysp"]), slotyRankingu: raw["topka-wysp"]?.["sloty-rankingu"] ?? [] },
    ulepszeniaWyspy: parseScreen(raw["ulepszenia-wyspy"]),
    ulepszenieSpawnerow: { ...parseScreen(raw["ulepszenie-spawnerow"]), slotyTypow: raw["ulepszenie-spawnerow"]?.["sloty-typow"] ?? [] },
    spawnerPodmenu: parseScreen(raw["spawner-podmenu"]),
    czlonkowieWyspy: {
      ...parseScreen(raw["czlonkowie-wyspy"]),
      slotWlasciciela: Number(raw["czlonkowie-wyspy"]?.["slot-wlasciciela"] ?? 0),
      pierwszySlotCzlonka: Number(raw["czlonkowie-wyspy"]?.["pierwszy-slot-czlonka"] ?? 1),
      ostatniSlotCzlonka: Number(raw["czlonkowie-wyspy"]?.["ostatni-slot-czlonka"] ?? 44),
    },
  };
}

export function serializeIslandGuiContent(content: IslandGuiContent): string {
  const out: Record<string, any> = {
    "panel-wyspy": serializeScreen(content.panelWyspy),
    "permisje-wyspy": serializeScreen(content.permisjeWyspy),
    "ustawienia-wyspy": serializeScreen(content.ustawieniaWyspy),
    "topka-wysp": { ...serializeScreen(content.topkaWysp), "sloty-rankingu": content.topkaWysp.slotyRankingu },
    "ulepszenia-wyspy": serializeScreen(content.ulepszeniaWyspy),
    "ulepszenie-spawnerow": { ...serializeScreen(content.ulepszenieSpawnerow), "sloty-typow": content.ulepszenieSpawnerow.slotyTypow },
    "spawner-podmenu": serializeScreen(content.spawnerPodmenu),
    "czlonkowie-wyspy": {
      ...serializeScreen(content.czlonkowieWyspy),
      "slot-wlasciciela": content.czlonkowieWyspy.slotWlasciciela,
      "pierwszy-slot-czlonka": content.czlonkowieWyspy.pierwszySlotCzlonka,
      "ostatni-slot-czlonka": content.czlonkowieWyspy.ostatniSlotCzlonka,
    },
  };
  // "topka-wysp" needs size/przyciski BEFORE sloty-rankingu to match the real
  // file's field order exactly is not required for the plugin (order-agnostic
  // YAML map), so plain key insertion order here is fine.
  return yaml.dump(out, { lineWidth: -1 });
}

function parseCostCurve(raw: any): CostCurve {
  const poziomy: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw?.poziomy ?? {})) poziomy[Number(k)] = Number(v);
  return { poziomy, domyslny: Number(raw?.domyslny ?? 0) };
}

function serializeCostCurve(curve: CostCurve): Record<string, any> {
  const poziomy: Record<string, number> = {};
  for (const [k, v] of Object.entries(curve.poziomy)) poziomy[k] = v;
  return { poziomy, domyslny: curve.domyslny };
}

export function parseIslandConfig(text: string): IslandConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const spawnery = raw.spawnery ?? {};
  const typy: SpawnerType[] = Array.isArray(spawnery.typy)
    ? spawnery.typy.map((t: any) => ({
        id: t.id,
        nazwaOdmieniona: t["nazwa-odmieniona"] ?? "",
        ikona: t.ikona,
        cenaWSklepie: Number(t["cena-w-sklepie"] ?? 0),
      }))
    : [];
  const cooldownProb: CooldownProba[] = Array.isArray(raw["tworzenie-wyspy"]?.["cooldown-prob"])
    ? raw["tworzenie-wyspy"]["cooldown-prob"].map((c: any) => ({ odProby: Number(c["od-proby"]), sekundy: Number(c.sekundy) }))
    : [];
  const wartosciBlokow: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw["wartosci-blokow"] ?? {})) wartosciBlokow[k] = Number(v);

  return {
    tworzenieWyspy: { domyslnyRozmiar: Number(raw["tworzenie-wyspy"]?.["domyslny-rozmiar"] ?? 50), cooldownProb },
    border: {
      przyrostNaUlepszenie: Number(raw.border?.["przyrost-na-ulepszenie"] ?? 0),
      kosztZaBlok: Number(raw.border?.["koszt-za-blok"] ?? 0),
      maxRozmiar: Number(raw.border?.["max-rozmiar"] ?? 0),
      odstepSiatkiWysp: Number(raw.border?.["odstep-siatki-wysp"] ?? 0),
    },
    teleportBezpieczenstwo: {
      maxGlebokoscSzukaniaWDol: Number(raw["teleport-bezpieczenstwo"]?.["max-glebokosc-szukania-w-dol"] ?? 0),
      promienSzukaniaObok: Number(raw["teleport-bezpieczenstwo"]?.["promien-szukania-obok"] ?? 0),
    },
    timeouty: {
      potwierdzenieSekundy: Number(raw.timeouty?.["potwierdzenie-sekundy"] ?? 0),
      zaproszenieSekundy: Number(raw.timeouty?.["zaproszenie-sekundy"] ?? 0),
      maxLotPerlySekundy: Number(raw.timeouty?.["max-lot-perly-sekundy"] ?? 0),
    },
    nazwaWyspy: { maxDlugosc: Number(raw["nazwa-wyspy"]?.["max-dlugosc"] ?? 24) },
    wyczyszczenieTerenu: {
      zapasNaSchemat: Number(raw["wyczyszczenie-terenu"]?.["zapas-na-schemat"] ?? 0),
      chunkiNaTick: Number(raw["wyczyszczenie-terenu"]?.["chunki-na-tick"] ?? 0),
    },
    wartosciBlokow,
    spawnery: {
      maxPoziom: Number(spawnery["max-poziom"] ?? 5),
      typy,
      kosztBazowyIlosc: parseCostCurve(spawnery["koszt-bazowy-ilosc"]),
      kosztBazowySzybkosc: parseCostCurve(spawnery["koszt-bazowy-szybkosc"]),
    },
    sniffer: {
      promienZbioru: Number(raw.sniffer?.["promien-zbioru"] ?? 0),
      wysokoscZbioru: Number(raw.sniffer?.["wysokosc-zbioru"] ?? 0),
      promienSzukaniaSkrzyni: Number(raw.sniffer?.["promien-szukania-skrzyni"] ?? 0),
      promienWedrowania: Number(raw.sniffer?.["promien-wedrowania"] ?? 0),
      skanOdstepSekundy: Number(raw.sniffer?.["skan-odstep-sekundy"] ?? 0),
      uprawy: Array.isArray(raw.sniffer?.uprawy) ? raw.sniffer.uprawy : [],
    },
  };
}

export function serializeIslandConfig(cfg: IslandConfig): string {
  const out: Record<string, any> = {
    "tworzenie-wyspy": {
      "domyslny-rozmiar": cfg.tworzenieWyspy.domyslnyRozmiar,
      "cooldown-prob": cfg.tworzenieWyspy.cooldownProb.map((c) => ({ "od-proby": c.odProby, sekundy: c.sekundy })),
    },
    border: {
      "przyrost-na-ulepszenie": cfg.border.przyrostNaUlepszenie,
      "koszt-za-blok": cfg.border.kosztZaBlok,
      "max-rozmiar": cfg.border.maxRozmiar,
      "odstep-siatki-wysp": cfg.border.odstepSiatkiWysp,
    },
    "teleport-bezpieczenstwo": {
      "max-glebokosc-szukania-w-dol": cfg.teleportBezpieczenstwo.maxGlebokoscSzukaniaWDol,
      "promien-szukania-obok": cfg.teleportBezpieczenstwo.promienSzukaniaObok,
    },
    timeouty: {
      "potwierdzenie-sekundy": cfg.timeouty.potwierdzenieSekundy,
      "zaproszenie-sekundy": cfg.timeouty.zaproszenieSekundy,
      "max-lot-perly-sekundy": cfg.timeouty.maxLotPerlySekundy,
    },
    "nazwa-wyspy": { "max-dlugosc": cfg.nazwaWyspy.maxDlugosc },
    "wyczyszczenie-terenu": {
      "zapas-na-schemat": cfg.wyczyszczenieTerenu.zapasNaSchemat,
      "chunki-na-tick": cfg.wyczyszczenieTerenu.chunkiNaTick,
    },
    "wartosci-blokow": cfg.wartosciBlokow,
    spawnery: {
      "max-poziom": cfg.spawnery.maxPoziom,
      typy: cfg.spawnery.typy.map((t) => ({
        id: t.id,
        "nazwa-odmieniona": t.nazwaOdmieniona,
        ikona: t.ikona,
        "cena-w-sklepie": t.cenaWSklepie,
      })),
      "koszt-bazowy-ilosc": serializeCostCurve(cfg.spawnery.kosztBazowyIlosc),
      "koszt-bazowy-szybkosc": serializeCostCurve(cfg.spawnery.kosztBazowySzybkosc),
    },
    sniffer: {
      "promien-zbioru": cfg.sniffer.promienZbioru,
      "wysokosc-zbioru": cfg.sniffer.wysokoscZbioru,
      "promien-szukania-skrzyni": cfg.sniffer.promienSzukaniaSkrzyni,
      "promien-wedrowania": cfg.sniffer.promienWedrowania,
      "skan-odstep-sekundy": cfg.sniffer.skanOdstepSekundy,
      uprawy: cfg.sniffer.uprawy,
    },
  };
  return yaml.dump(out, { lineWidth: -1 });
}
