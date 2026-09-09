import * as yaml from "js-yaml";
import type { ChatFilterConfig, ChatRank } from "./types";

const VALID_RANKS: ChatRank[] = ["GRACZ", "VIP", "ADMIN"];

function parseRangi(raw: any): ChatRank[] {
  if (!Array.isArray(raw)) return ["ADMIN"];
  const out = raw.map((r) => String(r).toUpperCase()).filter((r): r is ChatRank => (VALID_RANKS as string[]).includes(r));
  return out.length > 0 ? out : ["ADMIN"];
}

export function parseChatFilterConfig(text: string): ChatFilterConfig {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const antySpam = raw["anti-spam"] ?? {};
  const antyCaps = raw["anti-caps"] ?? {};
  const dlugosc = raw["dlugosc-wiadomosci"] ?? {};
  const antyReklama = raw["anti-reklama"] ?? {};
  const powtorzona = raw["powtorzona-wiadomosc"] ?? {};
  const powtarzajace = raw["powtarzajace-znaki"] ?? {};
  return {
    antySpam: { enabled: antySpam.enabled ?? true, cooldownSekundy: Number(antySpam["cooldown-sekundy"] ?? 5) },
    antyCaps: {
      enabled: antyCaps.enabled ?? true,
      minDlugosc: Number(antyCaps["min-dlugosc"] ?? 8),
      progProcent: Number(antyCaps["prog-procent"] ?? 60),
      exemptRangi: parseRangi(antyCaps["exempt-rangi"]),
    },
    dlugoscWiadomosci: {
      enabled: dlugosc.enabled ?? true,
      limitZnakow: Number(dlugosc["limit-znakow"] ?? 128),
      exemptRangi: parseRangi(dlugosc["exempt-rangi"]),
    },
    antyReklama: {
      enabled: antyReklama.enabled ?? true,
      koncowkiDomen: Array.isArray(antyReklama["koncowki-domen"]) ? antyReklama["koncowki-domen"].map(String) : [],
      exemptRangi: parseRangi(antyReklama["exempt-rangi"]),
    },
    powtorzonaWiadomosc: { enabled: powtorzona.enabled ?? true, exemptRangi: parseRangi(powtorzona["exempt-rangi"]) },
    powtarzajaceZnaki: {
      enabled: powtarzajace.enabled ?? true,
      minPowtorzen: Number(powtarzajace["min-powtorzen"] ?? 5),
      exemptRangi: parseRangi(powtarzajace["exempt-rangi"]),
    },
  };
}

export function serializeChatFilterConfig(cfg: ChatFilterConfig): string {
  const out = {
    "anti-spam": { enabled: cfg.antySpam.enabled, "cooldown-sekundy": cfg.antySpam.cooldownSekundy },
    "anti-caps": {
      enabled: cfg.antyCaps.enabled,
      "min-dlugosc": cfg.antyCaps.minDlugosc,
      "prog-procent": cfg.antyCaps.progProcent,
      "exempt-rangi": cfg.antyCaps.exemptRangi,
    },
    "dlugosc-wiadomosci": {
      enabled: cfg.dlugoscWiadomosci.enabled,
      "limit-znakow": cfg.dlugoscWiadomosci.limitZnakow,
      "exempt-rangi": cfg.dlugoscWiadomosci.exemptRangi,
    },
    "anti-reklama": {
      enabled: cfg.antyReklama.enabled,
      "koncowki-domen": cfg.antyReklama.koncowkiDomen,
      "exempt-rangi": cfg.antyReklama.exemptRangi,
    },
    "powtorzona-wiadomosc": { enabled: cfg.powtorzonaWiadomosc.enabled, "exempt-rangi": cfg.powtorzonaWiadomosc.exemptRangi },
    "powtarzajace-znaki": {
      enabled: cfg.powtarzajaceZnaki.enabled,
      "min-powtorzen": cfg.powtarzajaceZnaki.minPowtorzen,
      "exempt-rangi": cfg.powtarzajaceZnaki.exemptRangi,
    },
  };
  return yaml.dump(out, { lineWidth: -1 });
}
