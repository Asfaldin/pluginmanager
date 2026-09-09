import { useDirtyTracking } from "../state/DirtyContext";
import { Save, TriangleAlert } from "lucide-react";
import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import {
  listTexturePacks,
  rconSendCommand,
  rpMakeTransparent,
  rpTextureStatus,
  rpWriteTextFile,
  sftpReadFile,
  sftpWriteFile,
} from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { COMMON_ENCHANTMENTS, COMMON_MATERIALS } from "../lib/minecraftData";
import { DEFAULT_TOOLS_YAML } from "../lib/toolsDefaults";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type {
  EnchantProgressEntry,
  EvolvingToolEntry,
  TexturePackProject,
  ToolCategory,
  ToolEffectEntry,
  ToolEffectType,
  ToolStatEntry,
} from "../lib/types";

const LAST_USED_KEY = "evolvingtools";

const CATEGORIES: ToolCategory[] = ["PICKAXE", "AXE", "HOE", "SWORD", "SHOVEL", "HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"];

// The real YAML (ewoluujace-narzedzia.yml) stores enchant keys lowercase,
// matching Bukkit's minecraft: namespaced registry ("efficiency", "fortune",
// "sharpness") - COMMON_ENCHANTMENTS is upper-case for a different feature,
// so lower-case it here rather than duplicating the list.
const ENCHANT_KEYS = COMMON_ENCHANTMENTS.map((e) => e.toLowerCase());

const EFFECT_TYPES: ToolEffectType[] = [
  "DUPLIKUJ_DROP",
  "OBSZAR_KRUSZENIA",
  "ZYLA_GORNICZA",
  "TELEKINEZA",
  "MAGNES",
  "BONUS_PRZEDMIOT",
  "BONUS_PIENIADZE",
  "BONUS_XP",
  "JACKPOT",
  "AURA_MIKSTURY",
  "PVP_BONUS_OBRAZENIA",
  "PODWOJNY_ATAK",
  "DEBUFF_PRZECIWNIKA",
  "ODBICIE_OBRAZEN",
  "LECZENIE",
  "SYCENIE",
  "PIORUN",
  "NIENISZCZALNY",
  "SPECJALNY_SILK_TOUCH",
  "CZASTKI_PRZY_TRIGGERZE",
];

const EFFECT_TYPE_LABELS: Record<ToolEffectType, string> = {
  DUPLIKUJ_DROP: "Duplikuj drop",
  OBSZAR_KRUSZENIA: "Obszar kruszenia (sąsiedzi)",
  ZYLA_GORNICZA: "Żyła górnicza (vein miner)",
  TELEKINEZA: "Telekineza (drop do ekwipunku)",
  MAGNES: "Magnes na dropy",
  BONUS_PRZEDMIOT: "Bonus przedmiot (mega custom)",
  BONUS_PIENIADZE: "Bonus pieniądze",
  BONUS_XP: "Bonus XP",
  JACKPOT: "Jackpot (rzadka duża wypłata)",
  AURA_MIKSTURY: "Aura mikstury",
  PVP_BONUS_OBRAZENIA: "Bonus obrażeń PvP",
  PODWOJNY_ATAK: "Podwójny atak (SWORD/ZBROJA)",
  DEBUFF_PRZECIWNIKA: "Debuff przeciwnika (SWORD/ZBROJA)",
  ODBICIE_OBRAZEN: "Odbicie obrażeń (TYLKO ZBROJA)",
  LECZENIE: "Leczenie",
  SYCENIE: "Sycenie (głód)",
  PIORUN: "Piorun",
  NIENISZCZALNY: "Nieniszczalny",
  SPECJALNY_SILK_TOUCH: "Własny Silk Touch",
  CZASTKI_PRZY_TRIGGERZE: "Cząsteczki (kosmetyczne)",
};

// Efekty, ktore potrzebuja "trafionego stworzenia" - w silniku dzialaja WYLACZNIE na
// SWORD (trafiony przeciwnik) i kategoriach zbroi (napastnik) - na PICKAXE/AXE/HOE/SHOVEL
// (kopanie nie ma celu) to zawsze cichy no-op, stad ostrzezenie w formularzu.
const WYMAGA_CELU: ToolEffectType[] = ["PODWOJNY_ATAK", "DEBUFF_PRZECIWNIKA"];

const SZANSA_TYPY: ToolEffectType[] = [
  "DUPLIKUJ_DROP",
  "OBSZAR_KRUSZENIA",
  "ZYLA_GORNICZA",
  "TELEKINEZA",
  "MAGNES",
  "BONUS_PRZEDMIOT",
  "BONUS_PIENIADZE",
  "BONUS_XP",
  "JACKPOT",
  "CZASTKI_PRZY_TRIGGERZE",
  "PODWOJNY_ATAK",
  "DEBUFF_PRZECIWNIKA",
  "ODBICIE_OBRAZEN",
  "LECZENIE",
  "SYCENIE",
  "PIORUN",
];

const KWOTA_TYPY: ToolEffectType[] = [
  "BONUS_PIENIADZE",
  "BONUS_XP",
  "PVP_BONUS_OBRAZENIA",
  "JACKPOT",
  "BONUS_PRZEDMIOT",
  "DEBUFF_PRZECIWNIKA",
  "ODBICIE_OBRAZEN",
  "LECZENIE",
  "SYCENIE",
];

const KWOTA_LABEL_BAZOWA: Partial<Record<ToolEffectType, string>> = {
  BONUS_PRZEDMIOT: "Ilość bazowa",
  DEBUFF_PRZECIWNIKA: "Czas trwania bazowo (ticki)",
  ODBICIE_OBRAZEN: "Odbite obrażenia bazowo (%)",
  LECZENIE: "HP bazowo",
  SYCENIE: "Punkty sytości bazowo",
};

const KWOTA_LABEL_NA_POZIOM: Partial<Record<ToolEffectType, string>> = {
  BONUS_PRZEDMIOT: "Ilość / poziom",
  DEBUFF_PRZECIWNIKA: "Czas trwania / poziom (ticki)",
  ODBICIE_OBRAZEN: "Odbite obrażenia / poziom (%)",
  LECZENIE: "HP / poziom",
  SYCENIE: "Punkty sytości / poziom",
};

/** Czysto kosmetyczna etykieta w podglądzie "na max poziomie" - jeśli klucz nieznany, po prostu pokazuje go surowo. */
function nazwaEnchantuUI(klucz: string): string {
  const nazwy: Record<string, string> = {
    efficiency: "Wydajność",
    fortune: "Fortuna",
    sharpness: "Ostrość",
    looting: "Grabież",
    unbreaking: "Trwałość",
    protection: "Ochrona",
    feather_falling: "Piórkowy Upadek",
    respiration: "Oddychanie",
    depth_strider: "Chodzenie po Głębinach",
  };
  return nazwy[klucz] ?? klucz;
}

// Structured editor for szansa-progresja/kwota-progresja - same list-of-
// thresholds pattern as the enchant progression editor. "Wygeneruj z formuły
// liniowej" samples the CURRENT bazowa/na-poziom/max fields at N evenly
// spaced levels up to the tool's max level, so a value that already
// "wzrasta z poziomem" (grows with level) via the linear fields becomes a
// starting set of editable breakpoints instead of having to be typed by hand
// as a raw "poziom: wartość, ..." string.
function ProgresjaListEditor({
  progresja,
  toolMaxLevel,
  linearBazowa,
  linearNaPoziom,
  linearMax,
  unit,
  onChange,
}: {
  progresja: Record<number, number>;
  toolMaxLevel: number;
  linearBazowa: number;
  linearNaPoziom: number;
  linearMax?: number;
  unit: string;
  onChange: (next: Record<number, number>) => void;
}) {
  const [steps, setSteps] = useState(4);

  const sorted = Object.entries(progresja)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  function updateEntry(oldPoziom: number, patch: { poziom?: number; wartosc?: number }) {
    const next = { ...progresja };
    const wartosc = patch.wartosc ?? next[oldPoziom];
    delete next[oldPoziom];
    next[patch.poziom ?? oldPoziom] = wartosc;
    onChange(next);
  }

  function removeEntry(poziom: number) {
    const next = { ...progresja };
    delete next[poziom];
    onChange(next);
  }

  function addEntry() {
    const last = sorted[sorted.length - 1];
    const poziom = (last?.[0] ?? 0) + 1;
    const wartosc = last?.[1] ?? linearBazowa;
    onChange({ ...progresja, [poziom]: wartosc });
  }

  function generateFromLinear() {
    const n = Math.max(1, Math.floor(steps) || 1);
    const next: Record<number, number> = {};
    for (let i = 0; i < n; i++) {
      const poziom = n === 1 ? 1 : i === 0 ? 1 : Math.round(1 + (i * (toolMaxLevel - 1)) / (n - 1));
      let wartosc = linearBazowa + poziom * linearNaPoziom;
      if (linearMax != null) wartosc = Math.min(wartosc, linearMax);
      next[poziom] = Math.round(wartosc * 100) / 100;
    }
    onChange(next);
  }

  return (
    <div className="card" style={{ marginTop: "0.4rem" }}>
      <div className="card-title">Jawna progresja (poziom → wartość{unit})</div>
      {sorted.length === 0 && <p className="muted small">Brak progów — obowiązuje formuła liniowa powyżej.</p>}
      {sorted.map(([poziom, wartosc]) => (
        <div key={poziom} className="row">
          <label>
            Od poziomu
            <input
              type="number"
              min={1}
              value={poziom}
              style={{ width: "5rem" }}
              onChange={(e) => updateEntry(poziom, { poziom: Number(e.target.value) })}
            />
          </label>
          <label>
            Wartość{unit}
            <input
              type="number"
              value={wartosc}
              style={{ width: "5rem" }}
              onChange={(e) => updateEntry(poziom, { wartosc: Number(e.target.value) })}
            />
          </label>
          <button type="button" onClick={() => removeEntry(poziom)}>
            Usuń próg
          </button>
        </div>
      ))}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <button type="button" onClick={addEntry}>
          + Dodaj próg ręcznie
        </button>
        <label>
          Wygeneruj z formuły — ile progów
          <input type="number" min={1} value={steps} style={{ width: "4rem" }} onChange={(e) => setSteps(Number(e.target.value))} />
        </label>
        <button type="button" onClick={generateFromLinear}>
          Wygeneruj z formuły liniowej (do poziomu {toolMaxLevel})
        </button>
        {sorted.length > 0 && (
          <button type="button" onClick={() => onChange({})}>
            Wyczyść (wróć do formuły liniowej)
          </button>
        )}
      </div>
    </div>
  );
}

function emptyEffect(): ToolEffectEntry {
  return {
    typ: "DUPLIKUJ_DROP",
    szansaBazowa: 0,
    szansaNaPoziom: 0,
    szansaMax: 100,
    kwotaBazowa: 0,
    kwotaNaPoziom: 0,
    mikstura: "",
    poziomMikstury: 0,
    czastka: "",
    dzwiek: "",
    promien: 4,
    przedmiotMaterial: "",
    przedmiotCustomId: "",
    szansaProgresja: {},
    kwotaProgresja: {},
  };
}

// Local editing shape flattens kamienieMilowe (Record<poziom, efekty[]>) into a sorted
// array - much easier to render/edit as a list than a live object keyed by number.
interface MilestoneDraft {
  poziom: number;
  efekty: ToolEffectEntry[];
}

interface EditingTool extends Omit<EvolvingToolEntry, "kamienieMilowe"> {
  kamienieMilowe: MilestoneDraft[];
}

const EMPTY_TOOL: EditingTool = {
  id: "",
  kategoria: "PICKAXE",
  material: "DIAMOND_PICKAXE",
  nazwa: "",
  model: "",
  glint: false,
  maxPoziom: 30,
  expNaPoziom: 50,
  staty: [],
  enchanty: [],
  kamienieMilowe: [],
  pasywne: [],
  czastkiOtoczenia: "",
};

const HEADER_COMMENT =
  "# Zarzadzane przez RSMC Manager. Wydawanie: @dajewoluujace <id> [gracz]. Przeladowanie: @reloadnarzedzia.\n";

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// EnchantProgress.java only ever looks up the highest threshold <= the tool's
// current level (floorEntry on a NavigableMap<poziom, poziomEnczantu>) -
// there's no formula on the plugin side, just thresholds. This spreads N
// enchant levels evenly across 1..maxToolLevel so you don't have to type
// breakpoints by hand; the result is still just an ordinary threshold map,
// fully editable afterwards.
function evenlySpacedProgression(maxToolLevel: number, maxEnchantLevel: number): Record<number, number> {
  const n = Math.max(1, Math.floor(maxEnchantLevel) || 1);
  const L = Math.max(1, Math.floor(maxToolLevel) || 1);
  const out: Record<number, number> = {};
  if (n === 1) {
    out[1] = 1;
    return out;
  }
  for (let i = 0; i < n; i++) {
    const poziom = i === 0 ? 1 : Math.round(1 + (i * (L - 1)) / (n - 1));
    out[poziom] = i + 1;
  }
  return out;
}

function toEditing(entry: EvolvingToolEntry): EditingTool {
  const kamienieMilowe = Object.entries(entry.kamienieMilowe ?? {})
    .map(([poziom, efekty]) => ({ poziom: Number(poziom), efekty }))
    .sort((a, b) => a.poziom - b.poziom);
  return { ...entry, kamienieMilowe };
}

function fromEditing(draft: EditingTool): EvolvingToolEntry {
  const kamienieMilowe: Record<number, ToolEffectEntry[]> = {};
  for (const m of draft.kamienieMilowe) {
    if (m.efekty.length > 0) kamienieMilowe[m.poziom] = m.efekty;
  }
  const { kamienieMilowe: _drop, ...rest } = draft;
  return { ...rest, kamienieMilowe };
}

function parseEffect(raw: any): ToolEffectEntry {
  return {
    typ: raw.typ ?? "DUPLIKUJ_DROP",
    szansaBazowa: Number(raw["szansa-bazowa"] ?? 0),
    szansaNaPoziom: Number(raw["szansa-na-poziom"] ?? 0),
    szansaMax: Number(raw["szansa-max"] ?? 100),
    kwotaBazowa: Number(raw["kwota-bazowa"] ?? 0),
    kwotaNaPoziom: Number(raw["kwota-na-poziom"] ?? 0),
    mikstura: raw.mikstura ?? "",
    poziomMikstury: Number(raw["poziom-mikstury"] ?? 0),
    czastka: raw.czastka ?? "",
    dzwiek: raw.dzwiek ?? "",
    promien: Number(raw.promien ?? 4),
    przedmiotMaterial: raw["przedmiot-material"] ?? "",
    przedmiotCustomId: raw["przedmiot-custom-id"] ?? "",
    szansaProgresja: Object.fromEntries(Object.entries(raw["szansa-progresja"] ?? {}).map(([k, v]) => [Number(k), Number(v)])),
    kwotaProgresja: Object.fromEntries(Object.entries(raw["kwota-progresja"] ?? {}).map(([k, v]) => [Number(k), Number(v)])),
  };
}

function serializeEffect(fx: ToolEffectEntry, indent: string): string[] {
  const lines = [`${indent}- typ: ${fx.typ}`];
  const szansaProgresjaWpisy = Object.entries(fx.szansaProgresja ?? {});
  if (szansaProgresjaWpisy.length > 0) {
    lines.push(`${indent}  szansa-progresja: {${szansaProgresjaWpisy.map(([k, v]) => `${k}: ${v}`).join(", ")}}`);
  } else {
    if (fx.szansaBazowa) lines.push(`${indent}  szansa-bazowa: ${fx.szansaBazowa}`);
    if (fx.szansaNaPoziom) lines.push(`${indent}  szansa-na-poziom: ${fx.szansaNaPoziom}`);
    if (fx.szansaMax && fx.szansaMax !== 100) lines.push(`${indent}  szansa-max: ${fx.szansaMax}`);
  }
  const kwotaProgresjaWpisy = Object.entries(fx.kwotaProgresja ?? {});
  if (kwotaProgresjaWpisy.length > 0) {
    lines.push(`${indent}  kwota-progresja: {${kwotaProgresjaWpisy.map(([k, v]) => `${k}: ${v}`).join(", ")}}`);
  } else {
    if (fx.kwotaBazowa) lines.push(`${indent}  kwota-bazowa: ${fx.kwotaBazowa}`);
    if (fx.kwotaNaPoziom) lines.push(`${indent}  kwota-na-poziom: ${fx.kwotaNaPoziom}`);
  }
  if (fx.mikstura.trim()) lines.push(`${indent}  mikstura: ${fx.mikstura.trim()}`);
  if (fx.poziomMikstury) lines.push(`${indent}  poziom-mikstury: ${fx.poziomMikstury}`);
  if (fx.czastka.trim()) lines.push(`${indent}  czastka: ${fx.czastka.trim()}`);
  if (fx.dzwiek.trim()) lines.push(`${indent}  dzwiek: ${fx.dzwiek.trim()}`);
  if (fx.promien && fx.promien !== 4) lines.push(`${indent}  promien: ${fx.promien}`);
  if (fx.przedmiotMaterial.trim()) lines.push(`${indent}  przedmiot-material: ${fx.przedmiotMaterial.trim()}`);
  if (fx.przedmiotCustomId.trim()) lines.push(`${indent}  przedmiot-custom-id: ${fx.przedmiotCustomId.trim()}`);
  return lines;
}

function parseToolsYaml(text: string): EvolvingToolEntry[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const narzedzia = raw.narzedzia ?? {};
  return Object.entries(narzedzia).map(([id, v]: [string, any]) => {
    const staty: ToolStatEntry[] = (v.staty ?? []).map((s: any) => ({
      id: s.id ?? "",
      nazwa: s.nazwa ?? s.id ?? "",
      bazowa: Number(s.bazowa ?? 0),
      naPoziom: Number(s["na-poziom"] ?? 0),
      max: Number(s.max ?? 100),
      enchant: s.enchant ?? "",
      enchantMnoznik: Number(s["enchant-mnoznik"] ?? 1),
    }));
    const enchanty: EnchantProgressEntry[] = (v.enchanty ?? []).map((e: any) => ({
      enchant: e.enchant ?? "",
      progresja: Object.fromEntries(Object.entries(e.progresja ?? {}).map(([k, val]) => [Number(k), Number(val)])),
    }));
    const kamienieMilowe: Record<number, ToolEffectEntry[]> = {};
    for (const [poziom, lista] of Object.entries(v["kamienie-milowe"] ?? {})) {
      kamienieMilowe[Number(poziom)] = (lista as any[]).map(parseEffect);
    }
    const pasywne: ToolEffectEntry[] = (v.pasywne ?? []).map(parseEffect);
    return {
      id,
      kategoria: v.kategoria ?? "PICKAXE",
      material: v.material ?? "DIAMOND_PICKAXE",
      nazwa: v.nazwa ?? "",
      model: v.model ?? "",
      glint: Boolean(v.glint ?? false),
      maxPoziom: Number(v["max-poziom"] ?? 30),
      expNaPoziom: Number(v["exp-na-poziom"] ?? 50),
      staty,
      enchanty,
      kamienieMilowe,
      pasywne,
      czastkiOtoczenia: v["czastki-otoczenia"] ?? "",
    };
  });
}

function serializeToolsYaml(items: EvolvingToolEntry[]): string {
  const lines = [HEADER_COMMENT.trimEnd(), "narzedzia:"];
  for (const t of items) {
    lines.push(`  ${t.id}:`);
    lines.push(`    kategoria: ${t.kategoria}`);
    lines.push(`    material: ${t.material}`);
    if (t.nazwa.trim()) lines.push(`    nazwa: ${quoteYaml(t.nazwa)}`);
    if (t.model.trim()) lines.push(`    model: ${quoteYaml(t.model.trim())}`);
    if (t.glint) lines.push("    glint: true");
    lines.push(`    max-poziom: ${t.maxPoziom}`);
    lines.push(`    exp-na-poziom: ${t.expNaPoziom}`);

    if (t.staty.length > 0) {
      lines.push("    staty:");
      for (const s of t.staty) {
        lines.push(`      - id: ${s.id}`);
        lines.push(`        nazwa: ${quoteYaml(s.nazwa)}`);
        lines.push(`        bazowa: ${s.bazowa}`);
        lines.push(`        na-poziom: ${s.naPoziom}`);
        lines.push(`        max: ${s.max}`);
        if (s.enchant.trim()) {
          lines.push(`        enchant: ${s.enchant.trim()}`);
          if (s.enchantMnoznik !== 1) lines.push(`        enchant-mnoznik: ${s.enchantMnoznik}`);
        }
      }
    }

    if (t.enchanty.length > 0) {
      lines.push("    enchanty:");
      for (const e of t.enchanty) {
        lines.push(`      - enchant: ${e.enchant}`);
        const wpisy = Object.entries(e.progresja);
        if (wpisy.length > 0) {
          lines.push(`        progresja: {${wpisy.map(([k, v]) => `${k}: ${v}`).join(", ")}}`);
        }
      }
    }

    const milestoneEntries = Object.entries(t.kamienieMilowe)
      .map(([poziom, efekty]) => ({ poziom: Number(poziom), efekty }))
      .sort((a, b) => a.poziom - b.poziom);
    if (milestoneEntries.length > 0) {
      lines.push("    kamienie-milowe:");
      for (const m of milestoneEntries) {
        if (m.efekty.length === 0) continue;
        lines.push(`      ${m.poziom}:`);
        for (const fx of m.efekty) lines.push(...serializeEffect(fx, "        "));
      }
    }

    if (t.pasywne.length > 0) {
      lines.push("    pasywne:");
      for (const fx of t.pasywne) lines.push(...serializeEffect(fx, "      "));
    }

    if (t.czastkiOtoczenia.trim()) lines.push(`    czastki-otoczenia: ${t.czastkiOtoczenia.trim()}`);
  }
  return lines.join("\n") + "\n";
}

function EffectListEditor({
  efekty,
  toolMaxLevel,
  onChange,
}: {
  efekty: ToolEffectEntry[];
  toolMaxLevel: number;
  onChange: (next: ToolEffectEntry[]) => void;
}) {
  function update(i: number, patch: Partial<ToolEffectEntry>) {
    const next = [...efekty];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  return (
    <div>
      {efekty.map((fx, i) => (
        <div key={i} className="card" style={{ marginBottom: 6 }}>
          <div className="row">
            <select value={fx.typ} onChange={(e) => update(i, { typ: e.target.value as ToolEffectType })}>
              {EFFECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EFFECT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onChange(efekty.filter((_, fi) => fi !== i))}>
              Usuń efekt
            </button>
          </div>
          {WYMAGA_CELU.includes(fx.typ) && (
            <p className="muted small">
              <TriangleAlert size={13} strokeWidth={1.75} /> Działa tylko na SWORD (trafiony przeciwnik) i kategoriach zbroi (napastnik) - na PICKAXE/AXE/HOE/SHOVEL to cichy no-op (kopanie nie ma celu).
            </p>
          )}
          {fx.typ === "ODBICIE_OBRAZEN" && (
            <p className="muted small">
              <TriangleAlert size={13} strokeWidth={1.75} /> Działa TYLKO na kategoriach zbroi.
            </p>
          )}
          {SZANSA_TYPY.includes(fx.typ) && (
            <>
              <div className="row">
                <label>
                  Szansa bazowa %
                  <input
                    type="number"
                    value={fx.szansaBazowa}
                    disabled={Object.keys(fx.szansaProgresja ?? {}).length > 0}
                    onChange={(e) => update(i, { szansaBazowa: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Szansa / poziom
                  <input
                    type="number"
                    value={fx.szansaNaPoziom}
                    disabled={Object.keys(fx.szansaProgresja ?? {}).length > 0}
                    onChange={(e) => update(i, { szansaNaPoziom: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Szansa max %
                  <input
                    type="number"
                    value={fx.szansaMax}
                    disabled={Object.keys(fx.szansaProgresja ?? {}).length > 0}
                    onChange={(e) => update(i, { szansaMax: Number(e.target.value) })}
                  />
                </label>
              </div>
              <ProgresjaListEditor
                progresja={fx.szansaProgresja ?? {}}
                toolMaxLevel={toolMaxLevel}
                linearBazowa={fx.szansaBazowa}
                linearNaPoziom={fx.szansaNaPoziom}
                linearMax={fx.szansaMax}
                unit="%"
                onChange={(szansaProgresja) => update(i, { szansaProgresja })}
              />
            </>
          )}
          {KWOTA_TYPY.includes(fx.typ) && (
            <>
              <div className="row">
                <label>
                  {KWOTA_LABEL_BAZOWA[fx.typ] ?? "Kwota bazowa"}
                  <input
                    type="number"
                    value={fx.kwotaBazowa}
                    disabled={Object.keys(fx.kwotaProgresja ?? {}).length > 0}
                    onChange={(e) => update(i, { kwotaBazowa: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {KWOTA_LABEL_NA_POZIOM[fx.typ] ?? "Kwota / poziom"}
                  <input
                    type="number"
                    value={fx.kwotaNaPoziom}
                    disabled={Object.keys(fx.kwotaProgresja ?? {}).length > 0}
                    onChange={(e) => update(i, { kwotaNaPoziom: Number(e.target.value) })}
                  />
                </label>
              </div>
              <ProgresjaListEditor
                progresja={fx.kwotaProgresja ?? {}}
                toolMaxLevel={toolMaxLevel}
                linearBazowa={fx.kwotaBazowa}
                linearNaPoziom={fx.kwotaNaPoziom}
                unit=""
                onChange={(kwotaProgresja) => update(i, { kwotaProgresja })}
              />
            </>
          )}
          {(fx.typ === "OBSZAR_KRUSZENIA" || fx.typ === "ZYLA_GORNICZA") && (
            <div className="row">
              <label>
                Maks. bloków bazowo {fx.typ === "OBSZAR_KRUSZENIA" ? "(twardy limit: 6)" : "(twardy limit: 32)"}
                <input type="number" value={fx.kwotaBazowa} onChange={(e) => update(i, { kwotaBazowa: Number(e.target.value) })} />
              </label>
              <label>
                Bloków / poziom
                <input type="number" value={fx.kwotaNaPoziom} onChange={(e) => update(i, { kwotaNaPoziom: Number(e.target.value) })} />
              </label>
            </div>
          )}
          {fx.typ === "BONUS_PRZEDMIOT" && (
            <div className="row">
              <label>
                Custom-id (pierwszeństwo, przez CustomItemService)
                <input value={fx.przedmiotCustomId} onChange={(e) => update(i, { przedmiotCustomId: e.target.value })} />
              </label>
              <label>
                Material (jeśli brak custom-id)
                <input list="materials" value={fx.przedmiotMaterial} onChange={(e) => update(i, { przedmiotMaterial: e.target.value })} />
              </label>
            </div>
          )}
          {(fx.typ === "AURA_MIKSTURY" || fx.typ === "DEBUFF_PRZECIWNIKA") && (
            <div className="row">
              <label>
                Mikstura (np. haste, fast_digging, strength{fx.typ === "DEBUFF_PRZECIWNIKA" ? ", slowness, weakness, poison" : ""})
                <input value={fx.mikstura} onChange={(e) => update(i, { mikstura: e.target.value })} />
              </label>
              <label>
                Poziom mikstury (0 = I)
                <input type="number" value={fx.poziomMikstury} onChange={(e) => update(i, { poziomMikstury: Number(e.target.value) })} />
              </label>
            </div>
          )}
          {fx.typ === "MAGNES" && (
            <div className="row">
              <label>
                Promień
                <input type="number" value={fx.promien} onChange={(e) => update(i, { promien: Number(e.target.value) })} />
              </label>
            </div>
          )}
          {(fx.typ === "DUPLIKUJ_DROP" ||
            fx.typ === "CZASTKI_PRZY_TRIGGERZE" ||
            fx.typ === "OBSZAR_KRUSZENIA" ||
            fx.typ === "ZYLA_GORNICZA" ||
            fx.typ === "TELEKINEZA" ||
            fx.typ === "BONUS_PRZEDMIOT" ||
            fx.typ === "JACKPOT" ||
            fx.typ === "PODWOJNY_ATAK" ||
            fx.typ === "DEBUFF_PRZECIWNIKA" ||
            fx.typ === "ODBICIE_OBRAZEN" ||
            fx.typ === "LECZENIE" ||
            fx.typ === "SYCENIE") && (
            <div className="row">
              <label>
                Cząsteczka (Particle, opcjonalnie)
                <input value={fx.czastka} onChange={(e) => update(i, { czastka: e.target.value })} />
              </label>
              <label>
                Dźwięk (Sound, opcjonalnie)
                <input value={fx.dzwiek} onChange={(e) => update(i, { dzwiek: e.target.value })} />
              </label>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...efekty, emptyEffect()])}>
        + Dodaj efekt
      </button>
    </div>
  );
}

function EnchantRow({
  entry,
  toolMaxLevel,
  onChange,
  onRemove,
}: {
  entry: EnchantProgressEntry;
  toolMaxLevel: number;
  onChange: (next: EnchantProgressEntry) => void;
  onRemove: () => void;
}) {
  const [autoMaxLevel, setAutoMaxLevel] = useState(4);

  const sortedThresholds = Object.entries(entry.progresja)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  function setProgresja(next: Record<number, number>) {
    onChange({ ...entry, progresja: next });
  }

  function updateThreshold(oldPoziom: number, patch: { poziom?: number; poziomEnczantu?: number }) {
    const next = { ...entry.progresja };
    const poziomEnczantu = patch.poziomEnczantu ?? next[oldPoziom];
    delete next[oldPoziom];
    next[patch.poziom ?? oldPoziom] = poziomEnczantu;
    setProgresja(next);
  }

  function removeThreshold(poziom: number) {
    const next = { ...entry.progresja };
    delete next[poziom];
    setProgresja(next);
  }

  function addThreshold() {
    const last = sortedThresholds[sortedThresholds.length - 1];
    const poziom = (last?.[0] ?? 0) + 1;
    const poziomEnczantu = (last?.[1] ?? 0) + 1;
    setProgresja({ ...entry.progresja, [poziom]: poziomEnczantu });
  }

  return (
    <div className="card" style={{ marginBottom: 6 }}>
      <div className="row">
        <select value={entry.enchant} onChange={(ev) => onChange({ ...entry, enchant: ev.target.value })}>
          <option value="">— wybierz enczant —</option>
          {entry.enchant && !ENCHANT_KEYS.includes(entry.enchant) && (
            <option value={entry.enchant}>{entry.enchant} (spoza listy)</option>
          )}
          {ENCHANT_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <button type="button" onClick={onRemove}>
          Usuń enczant
        </button>
      </div>

      <div className="card-title" style={{ marginTop: "0.5rem" }}>
        Progi (od poziomu narzędzia → poziom enczantu)
      </div>
      {sortedThresholds.map(([poziom, poziomEnczantu]) => (
        <div key={poziom} className="row">
          <label>
            Od poziomu
            <input
              type="number"
              min={1}
              value={poziom}
              style={{ width: "5rem" }}
              onChange={(e) => updateThreshold(poziom, { poziom: Number(e.target.value) })}
            />
          </label>
          <label>
            Poziom enczantu
            <input
              type="number"
              min={1}
              value={poziomEnczantu}
              style={{ width: "5rem" }}
              onChange={(e) => updateThreshold(poziom, { poziomEnczantu: Number(e.target.value) })}
            />
          </label>
          <button type="button" onClick={() => removeThreshold(poziom)}>
            Usuń próg
          </button>
        </div>
      ))}
      <button type="button" onClick={addThreshold}>
        + Dodaj próg ręcznie
      </button>

      <div className="row" style={{ marginTop: "0.5rem", alignItems: "flex-end" }}>
        <label>
          Wylicz automatycznie — maks. poziom enczantu
          <input
            type="number"
            min={1}
            value={autoMaxLevel}
            style={{ width: "4rem" }}
            onChange={(e) => setAutoMaxLevel(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={() => setProgresja(evenlySpacedProgression(toolMaxLevel, autoMaxLevel))}>
          Rozłóż równomiernie do poziomu {toolMaxLevel}
        </button>
      </div>
      <p className="muted small">
        Plugin (EnchantProgress.java) obsługuje tylko progi — enczant jest na stałym poziomie od danego progu aż do
        następnego, bez własnej formuły. "Rozłóż równomiernie" tylko wypełnia te progi za Ciebie, rozstawione równo
        między poziomem 1 a {toolMaxLevel} (maks. poziomem TEGO narzędzia) — dalej możesz je ręcznie doprecyzować.
      </p>
    </div>
  );
}

export default function EvolvingToolsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [items, setItems] = useState<EvolvingToolEntry[]>([]);
  const [serverItems, setServerItems] = useState<EvolvingToolEntry[]>([]);
  const [editing, setEditing] = useState<EditingTool>(EMPTY_TOOL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testPlayer, setTestPlayer] = useState("");
  const [reloadCommand, setReloadCommand] = useState("@reloadnarzedzia");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  const [packProjects, setPackProjects] = useState<TexturePackProject[]>([]);
  const [selectedPackId, setSelectedPackId] = useState("");

  useEffect(() => {
    listTexturePacks()
      .then(setPackProjects)
      .catch(() => {});
  }, []);

  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<EvolvingToolEntry[]>("evolvingtools");

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsTools/ewoluujace-narzedzia.yml`;
    setRemotePath(path);
    setLastUsed(LAST_USED_KEY, { profileId: id, remotePath: path });
    loadPresets(id);
    load(id, path);
  }

  // If mainplugins-tools hasn't run on this server yet (or the plugin was
  // just added), ewoluujace-narzedzia.yml doesn't exist there yet either -
  // same situation IslandsPage handles: bootstrap it from the plugin's own
  // bundled resource file instead of showing an empty list with an error.
  // Without this, custom-item pickers elsewhere (e.g. quest rewards) that
  // merge in these tool IDs would silently show none of them.
  async function load(profileIdOverride?: string, remotePathOverride?: string) {
    const pid = profileIdOverride ?? profileId;
    const path = remotePathOverride ?? remotePath;
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      let text: string;
      try {
        text = await sftpReadFile(pid, path);
      } catch {
        await sftpWriteFile(pid, path, DEFAULT_TOOLS_YAML);
        text = DEFAULT_TOOLS_YAML;
        setStatus("ewoluujace-narzedzia.yml nie istniało — wgrano domyślną wersję. Serwer użyje jej po /@reloadnarzedzia albo restarcie.");
      }
      const parsed = parseToolsYaml(text);
      setItems(parsed);
      setServerItems(parsed);
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Serwer aktywny GLOBALNIE (pasek boczny) ma pierwszeństwo - dopiero gdy nic tam
  // jeszcze nie wybrano, sięgamy do starego zapisu specyficznego dla tej strony.
  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) {
      selectProfile(profileId);
      return;
    }
    const last = getLastUsed(LAST_USED_KEY);
    if (last && profiles.some((p) => p.id === last.profileId)) {
      selectProfile(last.profileId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  const dirty = items !== serverItems;
  useDirtyTracking(dirty);

  async function publish() {
    if (!profileId || !remotePath) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeToolsYaml(items));
      setServerItems(items);
      let statusMsg = "Wysłano na serwer.";
      if (reloadCommand) {
        try {
          const result = await rconSendCommand(profileId, reloadCommand);
          statusMsg += ` Przeładowano (RCON: ${result || "OK"}).`;
        } catch (e) {
          statusMsg += ` Uwaga: przeładowanie nie powiodło się (${String(e)}).`;
        }
      }
      setStatus(statusMsg);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function revertToServer() {
    setItems(serverItems);
    setEditing(EMPTY_TOOL);
    setEditingId(null);
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
  }

  function saveCurrentPresetAs() {
    if (!profileId) return;
    const name = window.prompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(profileId, name, items);
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    setItems(found);
    setStatus(`Wczytano preset „${name}" do edycji — kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function upsertEditing() {
    const id = editing.id.trim().toUpperCase();
    if (!id) {
      setStatus("Podaj ID narzędzia (WIELKIMI LITERAMI).");
      return;
    }
    const toSave = fromEditing({ ...editing, id });
    const next = [...items];
    const idx = next.findIndex((it) => it.id === (editingId ?? id));
    if (idx >= 0) next[idx] = toSave;
    else next.push(toSave);
    setItems(next);
    setEditing(EMPTY_TOOL);
    setEditingId(null);
  }

  function editItem(item: EvolvingToolEntry) {
    setEditing(toEditing(item));
    setEditingId(item.id);
  }

  function removeItem(id: string) {
    setItems(items.filter((it) => it.id !== id));
    if (editingId === id) {
      setEditing(EMPTY_TOOL);
      setEditingId(null);
    }
  }

  async function testGive(id: string) {
    if (!testPlayer.trim()) {
      setStatus("Podaj nick gracza do testu.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, `@dajewoluujace ${id} ${testPlayer.trim()}`);
      setStatus(`RCON: ${result || "(brak odpowiedzi)"}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    if (!reloadCommand || !profileId) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, reloadCommand);
      setStatus(`RCON: ${result || "(brak odpowiedzi)"}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Tak samo jak CustomItemsPage - tworzy oba pliki JSON + pustą teksturę w wybranej paczce, gotowe do narysowania w Texture Pack. */
  async function generateModelFiles() {
    const modelRef = editing.model.trim();
    if (!modelRef) return;
    const pack = packProjects.find((p) => p.id === selectedPackId);
    if (!pack) {
      setStatus("Wybierz paczkę tekstur (zakładka Texture Pack), do której mają trafić pliki modelu.");
      return;
    }
    const [namespace, path] = modelRef.split(":");
    if (!namespace || !path) {
      setStatus('Pole "model" musi być w formacie namespace:sciezka, np. mainplugins:kilof_start.');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const itemDefJson = JSON.stringify(
        { model: { type: "minecraft:model", model: `${namespace}:item/${path}` } },
        null,
        2
      );
      const modelJson = JSON.stringify(
        { parent: "minecraft:item/generated", textures: { layer0: `${namespace}:item/${path}` } },
        null,
        2
      );
      await rpWriteTextFile(pack.local_path, `assets/${namespace}/items/${path}.json`, itemDefJson);
      await rpWriteTextFile(pack.local_path, `assets/${namespace}/models/item/${path}.json`, modelJson);

      const texRelPath = `assets/${namespace}/textures/item/${path}.png`;
      const texStatus = await rpTextureStatus(pack.local_path, texRelPath);
      if (!texStatus.overridden) {
        await rpMakeTransparent(pack.local_path, texRelPath, 16, 16);
      }
      setStatus(
        `Wygenerowano pliki modelu w paczce "${pack.name}". Otwórz Texture Pack → "${pack.name}" → Wszystkie tekstury, żeby narysować ${path}.png.`
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function addMilestone() {
    const poziom = Number(window.prompt("Poziom kamienia milowego (np. 10):", "10"));
    if (!poziom || poziom < 1) return;
    if (editing.kamienieMilowe.some((m) => m.poziom === poziom)) {
      setStatus(`Kamień milowy na poziomie ${poziom} już istnieje.`);
      return;
    }
    setEditing({
      ...editing,
      kamienieMilowe: [...editing.kamienieMilowe, { poziom, efekty: [] }].sort((a, b) => a.poziom - b.poziom),
    });
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Ewoluujące narzędzia</h1>
      <p className="muted">
        Silnik narzędzi mainplugins-tools (ewoluujace-narzedzia.yml) — poziomy, prawdziwe enczanty rosnące z poziomem,
        stałe kamienie milowe odblokowujące efekty (na wzór Kilofa Niflheim, który zostaje osobno, poza tym rejestrem),
        custom nazwane staty i cząsteczki otoczenia. Te narzędzia NIE są przypisane do gracza — można je swobodnie
        sprzedać/wyrzucić/wręczyć.
      </p>

      <div className="row">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={publish} disabled={!profileId || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
        <button type="button" onClick={revertToServer} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        {dirty && <span className="muted small">masz niezapisane zmiany</span>}
      </div>

      <ToolbarMore>
        <div className="row">
          <input
            placeholder="/plugins/MainpluginsTools/ewoluujace-narzedzia.yml"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
          />
          <button onClick={() => load()} disabled={!profileId || busy}>
            Wczytaj
          </button>
        </div>
        <PresetBar
          presets={presetList}
          selectedName={selectedPresetName}
          onSelectName={setSelectedPresetName}
          onSaveAs={saveCurrentPresetAs}
          onLoad={loadPresetIntoDraft}
          onDelete={(name) => deletePreset(profileId, name)}
          disabled={!profileId}
        />
      </ToolbarMore>

      <div className="two-col">
        <div className="card">
          <h2>Narzędzia ({items.length})</h2>
          <div className="card-grid">
            {items.map((item) => (
              <div key={item.id} className="card">
                <div className="card-title">{item.id}</div>
                <div className="muted small">
                  {item.kategoria} · {item.material} · max lvl {item.maxPoziom}
                </div>
                <div className="row">
                  <button onClick={() => editItem(item)}>Edytuj</button>
                  <button onClick={() => removeItem(item.id)}>Usuń</button>
                  <button onClick={() => testGive(item.id)} disabled={busy || !profileId}>
                    Wydaj testowo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card form">
          <h2>{editingId ? "Edytuj narzędzie" : "Nowe narzędzie"}</h2>

          <label>
            ID (WIELKIMI LITERAMI, np. KILOF_START)
            <input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
          </label>

          <label>
            Kategoria
            <select value={editing.kategoria} onChange={(e) => setEditing({ ...editing, kategoria: e.target.value as ToolCategory })}>
              {CATEGORIES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label>
            Materiał (stały, nie zmienia się z poziomem)
            <input list="materials" value={editing.material} onChange={(e) => setEditing({ ...editing, material: e.target.value })} />
            <datalist id="materials">
              {COMMON_MATERIALS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <label>
            Nazwa
            <MinecraftTextInput value={editing.nazwa} onChange={(v) => setEditing({ ...editing, nazwa: v })} placeholder="&b&lNazwa narzędzia" />
          </label>

          <fieldset>
            <legend>Własny model z Texture Pack (opcjonalnie)</legend>
            <label>
              Referencja modelu (namespace:ścieżka, bez .json)
              <input
                placeholder="mainplugins:kilof_start"
                value={editing.model}
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
              />
            </label>
            <div className="row">
              <select value={selectedPackId} onChange={(e) => setSelectedPackId(e.target.value)}>
                <option value="">Wybierz paczkę tekstur...</option>
                {packProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={generateModelFiles} disabled={busy || !editing.model.trim() || !selectedPackId}>
                Wygeneruj pliki modelu w paczce
              </button>
            </div>
            <p className="muted small">
              Tworzy assets/&lt;ns&gt;/items/&lt;ścieżka&gt;.json + assets/&lt;ns&gt;/models/item/&lt;ścieżka&gt;.json + pustą
              teksturę — dalej otwórz teksturę w Texture Pack, żeby ją narysować.
            </p>
          </fieldset>

          <label className="checkbox">
            <input type="checkbox" checked={editing.glint} onChange={(e) => setEditing({ ...editing, glint: e.target.checked })} />
            Wymuszony blask
          </label>

          <div className="row">
            <label>
              Max poziom
              <input type="number" value={editing.maxPoziom} onChange={(e) => setEditing({ ...editing, maxPoziom: Number(e.target.value) })} />
            </label>
            <label>
              Exp na poziom
              <input type="number" value={editing.expNaPoziom} onChange={(e) => setEditing({ ...editing, expNaPoziom: Number(e.target.value) })} />
            </label>
          </div>

          <label>
            Cząsteczki otoczenia (Particle, opcjonalnie — stała aura gdy trzymane)
            <input value={editing.czastkiOtoczenia} onChange={(e) => setEditing({ ...editing, czastkiOtoczenia: e.target.value })} />
          </label>

          <fieldset>
            <legend>Custom staty (%, opcjonalnie podpięte pod prawdziwy enczant)</legend>
            {editing.staty.map((s, i) => (
              <div key={i} className="card" style={{ marginBottom: 6 }}>
                <div className="row">
                  <input
                    placeholder="id (np. jakosc)"
                    value={s.id}
                    onChange={(e) => {
                      const next = [...editing.staty];
                      next[i] = { ...s, id: e.target.value };
                      setEditing({ ...editing, staty: next });
                    }}
                  />
                  <input
                    placeholder="Nazwa (np. Jakość)"
                    value={s.nazwa}
                    onChange={(e) => {
                      const next = [...editing.staty];
                      next[i] = { ...s, nazwa: e.target.value };
                      setEditing({ ...editing, staty: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="bazowa"
                    value={s.bazowa}
                    onChange={(e) => {
                      const next = [...editing.staty];
                      next[i] = { ...s, bazowa: Number(e.target.value) };
                      setEditing({ ...editing, staty: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="na poziom"
                    value={s.naPoziom}
                    onChange={(e) => {
                      const next = [...editing.staty];
                      next[i] = { ...s, naPoziom: Number(e.target.value) };
                      setEditing({ ...editing, staty: next });
                    }}
                  />
                  <input
                    type="number"
                    placeholder="max"
                    value={s.max}
                    onChange={(e) => {
                      const next = [...editing.staty];
                      next[i] = { ...s, max: Number(e.target.value) };
                      setEditing({ ...editing, staty: next });
                    }}
                  />
                  <button type="button" onClick={() => setEditing({ ...editing, staty: editing.staty.filter((_, si) => si !== i) })}>
                    Usuń
                  </button>
                </div>
                <div className="row">
                  <label>
                    Podpięty enczant (opcjonalnie - stat staje się REALNYM poziomem tego enczantu)
                    <select
                      value={s.enchant}
                      onChange={(e) => {
                        const next = [...editing.staty];
                        next[i] = { ...s, enchant: e.target.value };
                        setEditing({ ...editing, staty: next });
                      }}
                    >
                      <option value="">— brak (czysto informacyjny) —</option>
                      {s.enchant && !ENCHANT_KEYS.includes(s.enchant) && <option value={s.enchant}>{s.enchant} (spoza listy)</option>}
                      {ENCHANT_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>
                  {s.enchant && (
                    <label>
                      Mnożnik (np. 0.25 = "stat to 1/4 tego enczantu"; wartość-staty × mnożnik = poziom enczantu, w dół)
                      <input
                        type="number"
                        step="0.05"
                        value={s.enchantMnoznik}
                        onChange={(e) => {
                          const next = [...editing.staty];
                          next[i] = { ...s, enchantMnoznik: Number(e.target.value) };
                          setEditing({ ...editing, staty: next });
                        }}
                      />
                    </label>
                  )}
                  {s.enchant && (
                    <span className="muted small">
                      Na max poziomie (staty={s.max}): {nazwaEnchantuUI(s.enchant)} {Math.floor(s.max * s.enchantMnoznik)}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setEditing({ ...editing, staty: [...editing.staty, { id: "", nazwa: "", bazowa: 0, naPoziom: 0, max: 100, enchant: "", enchantMnoznik: 1 }] })
              }
            >
              + Dodaj stat
            </button>
          </fieldset>

          <fieldset>
            <legend>Prawdziwe enczanty rosnące z poziomem</legend>
            {editing.enchanty.map((e, i) => (
              <EnchantRow
                key={i}
                entry={e}
                toolMaxLevel={editing.maxPoziom}
                onChange={(next) => {
                  const nextList = [...editing.enchanty];
                  nextList[i] = next;
                  setEditing({ ...editing, enchanty: nextList });
                }}
                onRemove={() => setEditing({ ...editing, enchanty: editing.enchanty.filter((_, ei) => ei !== i) })}
              />
            ))}
            <button
              type="button"
              onClick={() => setEditing({ ...editing, enchanty: [...editing.enchanty, { enchant: "", progresja: {} }] })}
            >
              + Dodaj enczant
            </button>
          </fieldset>

          <fieldset>
            <legend>Kamienie milowe (odblokowane NA STAŁE od danego poziomu)</legend>
            {editing.kamienieMilowe.map((m, mi) => (
              <div key={m.poziom} className="card" style={{ marginBottom: 8 }}>
                <div className="row">
                  <strong>Poziom {m.poziom}</strong>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, kamienieMilowe: editing.kamienieMilowe.filter((_, i) => i !== mi) })}
                  >
                    Usuń kamień milowy
                  </button>
                </div>
                <EffectListEditor
                  efekty={m.efekty}
                  toolMaxLevel={editing.maxPoziom}
                  onChange={(efekty) => {
                    const next = [...editing.kamienieMilowe];
                    next[mi] = { ...m, efekty };
                    setEditing({ ...editing, kamienieMilowe: next });
                  }}
                />
              </div>
            ))}
            <button type="button" onClick={addMilestone}>
              + Dodaj kamień milowy
            </button>
          </fieldset>

          <fieldset>
            <legend>Efekty pasywne (aktywne od poziomu 1, bez odblokowania)</legend>
            <EffectListEditor
              efekty={editing.pasywne}
              toolMaxLevel={editing.maxPoziom}
              onChange={(pasywne) => setEditing({ ...editing, pasywne })}
            />
          </fieldset>

          <div className="row">
            <button onClick={upsertEditing} disabled={!profileId}>
              Zapisz narzędzie (lokalnie — pamiętaj o "Wyślij na serwer")
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(EMPTY_TOOL);
                setEditingId(null);
              }}
            >
              Wyczyść formularz
            </button>
          </div>

          <div className="row">
            <input placeholder="Nick gracza do testu" value={testPlayer} onChange={(e) => setTestPlayer(e.target.value)} />
          </div>

          <div className="row">
            <input placeholder="komenda RCON, np. @reloadnarzedzia" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
            <button onClick={reload} disabled={busy || !profileId}>
              Wyślij RCON
            </button>
          </div>
        </div>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
