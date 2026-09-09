import * as yaml from "js-yaml";
import type { HudConfig, HudFakeGracz, HudFakeWyspa } from "./types";

export function parseHudConfig(text: string): HudConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const u = raw.ustawienia ?? {};

  const fakeTopGraczy: HudFakeGracz[] = Array.isArray(raw["fake-top-graczy"])
    ? raw["fake-top-graczy"].map((g: any) => ({ nick: g.nick ?? "?", kasa: Number(g.kasa ?? 0) }))
    : [];
  const fakeTopWysp: HudFakeWyspa[] = Array.isArray(raw["fake-top-wysp"])
    ? raw["fake-top-wysp"].map((w: any) => ({ nick: w.nick ?? "?", rozmiar: Number(w.rozmiar ?? 0), czlonkowie: Number(w.czlonkowie ?? 0) }))
    : [];

  return {
    proTipy: Array.isArray(raw["pro-tipy"]) ? raw["pro-tipy"].map(String) : [],
    maxTop: Number(u["max-top"] ?? 10),
    sekundNaSlajd: Number(u["sekund-na-slajd"] ?? 8),
    coKtorySlajdRynkowy: Number(u["co-ktory-slajd-rynkowy"] ?? 3),
    szerokoscProTipu: Number(u["szerokosc-pro-tipu"] ?? 32),
    szerokoscPadGracza: Number(u["szerokosc-pad-gracza"] ?? 34),
    fakeTopGraczy,
    fakeTopWysp,
  };
}

export function serializeHudConfig(cfg: HudConfig): string {
  const out = {
    "pro-tipy": cfg.proTipy,
    ustawienia: {
      "max-top": cfg.maxTop,
      "sekund-na-slajd": cfg.sekundNaSlajd,
      "co-ktory-slajd-rynkowy": cfg.coKtorySlajdRynkowy,
      "szerokosc-pro-tipu": cfg.szerokoscProTipu,
      "szerokosc-pad-gracza": cfg.szerokoscPadGracza,
    },
    "fake-top-graczy": cfg.fakeTopGraczy.map((g) => ({ nick: g.nick, kasa: g.kasa })),
    "fake-top-wysp": cfg.fakeTopWysp.map((w) => ({ nick: w.nick, rozmiar: w.rozmiar, czlonkowie: w.czlonkowie })),
  };
  return yaml.dump(out, { lineWidth: -1 });
}
