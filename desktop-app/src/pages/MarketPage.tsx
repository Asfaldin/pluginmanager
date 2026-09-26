import { Redo2, Save, Terminal, Trash2, Undo2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ask } from "../components/AskModal";
import { ConfirmButton, CopyRow, HelpButton, StatusBar } from "../components/EditorBits";
import GameTextsSection from "../components/GameTextsSection";
import { ItemDatalists } from "../components/ItemRefPicker";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { readCurrency, readSetting } from "../lib/coreSettings";
import type { GameTexts } from "../lib/langTexts";
import { MARKET_PLACEHOLDER_LABELS, MARKET_SAMPLE_VALUES, MARKET_TEXT_GROUPS, MARKET_TEXTS } from "../lib/marketTexts";
import { defaultMarket, marketProblems, parseMarketYaml, serializeMarketYaml, type MarketConfig, type RankLimit } from "../lib/marketYaml";
import { plural } from "../lib/plText";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";
import { MARKET_SMALL_HELP, MarketCommandsModal, MarketGuideModal, SmallHelp, type MarketGuidePart } from "./market/MarketHelp";
import MarketLiveTab from "./market/MarketLiveTab";
import MarketWindowTab from "./market/MarketWindowTab";

interface MarketFile {
  config: MarketConfig;
  /** Teksty w grze - z lang/<język>.yml pluginu, nie z market.yml. */
  texts: GameTexts;
}

type Tab = "settings" | "window" | "live";
type Section = "offers" | "tax" | "mailbox" | "texts";
type SmallHelpId = keyof typeof MARKET_SMALL_HELP;

const EMPTY: MarketFile = { config: defaultMarket(), texts: MARKET_TEXTS.defaults("en") };

function marketDir(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsMarket`;
}

function serializeAll(f: MarketFile): string {
  return serializeMarketYaml(f.config) + JSON.stringify(f.texts);
}

export default function MarketPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [file, setFile] = useState<MarketFile>(EMPTY);
  const [saved, setSaved] = useState<MarketFile>(EMPTY);
  // null = na serwerze nie ma jeszcze ustawień Targu (wszystko pójdzie przy pierwszym wysłaniu).
  const [serverFile, setServerFile] = useState<MarketFile | null>(null);
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("$");
  const [tab, setTab] = useState<Tab>("settings");
  const [section, setSection] = useState<Section>("offers");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [smallHelp, setSmallHelp] = useState<SmallHelpId | null>(null);
  const [guide, setGuide] = useState<{ part: MarketGuidePart } | null>(null);
  const [discarded, setDiscarded] = useState<{ file: MarketFile; saved: MarketFile } | null>(null);
  // Wyłączenie wygasania nie gubi liczby dni - po ponownym włączeniu wraca to, co było.
  const expireMemoryRef = useRef(7);
  const autoLoadedRef = useRef(false);
  const { iconPackDir, allMaterials } = useIconPack(setStatus);

  // Cofnij / Ponów dla całej strony; szybkie zmiany jedna po drugiej (pisanie liczby) łączą się w jeden krok.
  const historyRef = useRef<{ past: MarketFile[]; future: MarketFile[]; prev: MarketFile; lastPush: number; skip: boolean }>({
    past: [],
    future: [],
    prev: EMPTY,
    lastPush: 0,
    skip: false,
  });
  const [, setHistoryTick] = useState(0);

  const unsaved = useMemo(() => serializeAll(file) !== serializeAll(saved), [file, saved]);
  const notSent = useMemo(() => serverFile === null || serializeAll(saved) !== serializeAll(serverFile), [saved, serverFile]);
  useDirtyTracking(Boolean(profileId) && (unsaved || notSent));
  const c = file.config;
  const problems = marketProblems(c);

  useEffect(() => {
    const h = historyRef.current;
    if (h.skip) {
      h.skip = false;
      h.prev = file;
      setHistoryTick((t) => t + 1);
      return;
    }
    if (file === h.prev) return;
    const now = Date.now();
    if (now - h.lastPush > 700) {
      h.past.push(h.prev);
      if (h.past.length > 100) h.past.shift();
    }
    h.lastPush = now;
    h.future = [];
    h.prev = file;
    setHistoryTick((t) => t + 1);
  }, [file]);

  function undoFile() {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(file);
    h.skip = true;
    h.lastPush = 0;
    setFile(prev);
  }

  function redoFile() {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(file);
    h.skip = true;
    h.lastPush = 0;
    setFile(next);
  }

  // Ctrl+Z / Ctrl+Y poza polami tekstowymi (one mają własne cofanie); Ctrl+S zapisuje wszędzie.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (unsaved) save();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, .mc-rich")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoFile();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redoFile();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function reset(f: MarketFile) {
    historyRef.current = { past: [], future: [], prev: f, lastPush: 0, skip: true };
    setFile(f);
    setSaved(f);
  }

  async function load(pid: string, path: string) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    const base = path.replace(/\/+$/, "");
    const dir = marketDir(path);
    let lang = "en";
    let cur = "$";
    try {
      const coreConfig = await sftpReadFile(pid, `${base}/MainpluginsCore/config.yml`);
      lang = readSetting(coreConfig, "language") ?? "en";
      cur = readCurrency(coreConfig);
    } catch {
      // brak configu core - zostaje angielski i "$"
    }
    setLanguage(lang);
    setCurrency(cur);
    let langText: string | null = null;
    try {
      langText = await sftpReadFile(pid, `${dir}/lang/${lang}.yml`);
    } catch {
      // pliku jeszcze nie ma - plugin bierze teksty z jara, czyli domyślne
    }
    const texts = MARKET_TEXTS.parse(langText, lang);
    try {
      const f = { config: parseMarketYaml(await sftpReadFile(pid, `${dir}/market.yml`)), texts };
      if (f.config.expireDays > 0) expireMemoryRef.current = f.config.expireDays;
      reset(f);
      setServerFile(f);
    } catch {
      reset({ config: defaultMarket(), texts });
      setServerFile(null);
      setStatus("Na serwerze nie ma jeszcze ustawień Targu - pokazano domyślne. Kliknij „Wyślij na serwer”, żeby je tam zapisać.");
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setPluginsPath(p.remote_plugins_path);
    load(id, p.remote_plugins_path);
  }

  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) selectProfile(profileId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  function save() {
    setSaved(file);
    setStatus("Zapisano w aplikacji. Kliknij „Wyślij na serwer” u góry, żeby zmiany trafiły na serwer.");
  }

  async function reloadFromServer() {
    const lose = unsaved || notSent;
    if (
      !(await ask(
        lose
          ? "Masz zmiany, których nie ma na serwerze. Aplikacja pokaże to, co jest teraz na serwerze, a Twoje zmiany odłoży na bok - do następnego wczytania przywrócisz je jednym kliknięciem."
          : "Aplikacja wczyta Targ od nowa prosto z serwera. Nic nie stracisz - wszystkie Twoje zmiany już tam są.",
        { title: "Wczytać Targ z serwera?", okLabel: "Wczytaj", danger: lose }
      ))
    )
      return;
    if (lose) setDiscarded({ file, saved });
    load(profileId, pluginsPath);
  }

  async function publish() {
    if (!profileId || !pluginsPath) return;
    const toSend = file;
    if (unsaved) setSaved(file);
    const warnings = marketProblems(toSend.config);
    if (warnings.length && !(await ask(`Uwaga:\n- ${warnings.join("\n- ")}\n\nWysłać mimo to?`, { title: "Uwaga", kind: "warning" }))) return;
    if (
      !(await ask("Na pewno chcesz wysłać wszystkie zmiany? Zmiany będą od razu widoczne na serwerze.", {
        title: "Wysłać zmiany na serwer?",
        kind: "warning",
        okLabel: "Wyślij",
      }))
    )
      return;
    setBusy(true);
    setStatus(null);
    const dir = marketDir(pluginsPath);
    try {
      await sftpWriteFile(profileId, `${dir}/market.yml`, serializeMarketYaml(toSend.config));
      const base = serverFile?.texts ?? MARKET_TEXTS.defaults(language);
      const textsChanged = !MARKET_TEXTS.same(toSend.texts, base);
      if (textsChanged) {
        // Czytamy plik świeżo z serwera i zmieniamy w nim tylko linijki zmienionych tekstów.
        const langPath = `${dir}/lang/${language}.yml`;
        let current = "";
        try {
          current = await sftpReadFile(profileId, langPath);
        } catch {
          // brak pliku - powstanie z samymi zmienionymi tekstami, resztę plugin weźmie z jara
        }
        await sftpWriteFile(profileId, langPath, MARKET_TEXTS.patch(current, MARKET_TEXTS.changed(toSend.texts, base)));
      }
      setServerFile(toSend);
      let msg = "Wysłano na serwer.";
      try {
        await rconSendCommand(profileId, "@market reload");
        // Teksty z lang/ wczytuje od nowa core, nie sam Targ.
        if (textsChanged) await rconSendCommand(profileId, "@reloadlang");
        msg += " Targ na serwerze wczytany od nowa - zmiany już działają.";
      } catch (e) {
        msg += ` ${String(e)}`;
      }
      setStatus(msg);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function setConfig(patch: Partial<MarketConfig>) {
    setFile((f) => ({ ...f, config: { ...f.config, ...patch } }));
  }

  function setTexts(patch: GameTexts) {
    setFile((f) => ({ ...f, texts: { ...f.texts, ...patch } }));
  }

  const money = (n: number) => `${n.toLocaleString("pl-PL")}${currency}`;

  function numberInput(value: number, onChange: (n: number) => void, unit: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
    return (
      <span className="ci-unit-input">
        <input
          type="number"
          min={min}
          max={max}
          step="1"
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Math.floor(Number(e.target.value) || 0))))}
          style={{ width: "8rem" }}
        />
        <span className="ci-unit">{unit}</span>
      </span>
    );
  }

  /** Jedno ustawienie w linijce: nazwa z lewej, okienko z jednostką z prawej, opis wpisanej wartości pod spodem. */
  function fieldRow(title: ReactNode, input: ReactNode, hint?: string) {
    return (
      <label className="ci-field-row">
        <span className="ci-field-title">{title}</span>
        {input}
        {hint && <span className="muted small ci-field-hint">{hint}</span>}
      </label>
    );
  }

  function help(id: SmallHelpId, title: string) {
    return <HelpButton id={`market-${id}`} title={title} onClick={() => setSmallHelp(id)} />;
  }

  function offersSection() {
    const setRank = (i: number, patch: Partial<RankLimit>) => setConfig({ rankLimits: c.rankLimits.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    return (
      <>
        <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
          Oferty i limity {help("limits", "Jak działają limity")}
        </h2>
        {fieldRow(
          "Ile ofert naraz może mieć gracz",
          numberInput(c.defaultLimit, (n) => setConfig({ defaultLimit: n }), "ofert", 1, 10000),
          `Gracz wystawi naraz najwyżej ${c.defaultLimit} ${plural(c.defaultLimit, "przedmiot", "przedmioty", "przedmiotów")}`
        )}
        {fieldRow("Najniższa cena", numberInput(c.minPrice, (n) => setConfig({ minPrice: n }), currency.trim() || "$", 1))}
        {fieldRow(
          "Najwyższa cena",
          numberInput(c.maxPrice, (n) => setConfig({ maxPrice: n }), currency.trim() || "$", 1),
          `Gracz wystawi przedmiot za co najmniej ${money(c.minPrice)} i najwyżej ${money(c.maxPrice)}`
        )}
        <label className="checkbox ci-toggle-row">
          <input
            type="checkbox"
            checked={c.expireDays > 0}
            onChange={(e) => {
              if (!e.target.checked) expireMemoryRef.current = c.expireDays;
              setConfig({ expireDays: e.target.checked ? expireMemoryRef.current || 7 : 0 });
            }}
          />
          Niesprzedane oferty wygasają
        </label>
        {c.expireDays > 0 ? (
          fieldRow(
            "Po ilu dniach oferta znika z Targu",
            numberInput(c.expireDays, (n) => setConfig({ expireDays: n }), "dni", 1, 3650),
            `Oferta, której nikt nie kupi przez ${c.expireDays} ${plural(c.expireDays, "dzień", "dni", "dni")}, zniknie, a przedmiot wróci do sprzedającego`
          )
        ) : (
          <p className="muted small ci-toggle-off">Oferty wiszą, dopóki ktoś ich nie kupi albo gracz ich nie wycofa.</p>
        )}

        <div className="ci-field-title row" style={{ alignItems: "center", gap: "0.4rem", marginTop: "1rem" }}>
          Więcej ofert dla rang {help("ranks", "Więcej ofert dla rang")}
        </div>
        {c.rankLimits.map((r, i) => (
          <div key={i} className="card" style={{ padding: "0.6rem", margin: "0.4rem 0" }}>
            <div className="row" style={{ alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap", margin: 0 }}>
              <label style={{ margin: 0 }}>
                <span className="muted small">Nazwa rangi</span>
                <input
                  value={r.rank}
                  placeholder="np. vip"
                  onChange={(e) => setRank(i, { rank: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                  style={{ width: "10rem" }}
                />
              </label>
              <label style={{ margin: 0 }}>
                <span className="muted small">Ile ofert naraz</span>
                {numberInput(r.limit, (n) => setRank(i, { limit: n }), "ofert", 1, 10000)}
              </label>
              <button type="button" className="ci-trash" title="Usuń tę rangę" onClick={() => setConfig({ rankLimits: c.rankLimits.filter((_, j) => j !== i) })}>
                <Trash2 size={16} />
              </button>
            </div>
            {r.limit <= c.defaultLimit && (
              <p className="ci-warning small" style={{ margin: "0.4rem 0 0" }}>
                Ta ranga ma nie więcej ofert niż zwykły limit ({c.defaultLimit}) - nic nie zyskuje.
              </p>
            )}
            {r.rank && (
              <div className="ci-protip" style={{ marginTop: "0.4rem" }}>
                <CopyRow cmd={`mainplugins.market.rank.${r.rank}`} what="nadaj je graczom z tą rangą" />
              </div>
            )}
          </div>
        ))}
        {c.rankLimits.length === 0 && <p className="muted small">Brak - wszyscy mają ten sam limit.</p>}
        <button
          type="button"
          onClick={() => setConfig({ rankLimits: [...c.rankLimits, { rank: c.rankLimits.length ? "" : "vip", limit: c.defaultLimit * 2 }] })}
        >
          + Dodaj rangę
        </button>
      </>
    );
  }

  function taxSection() {
    return (
      <>
        <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
          Podatek {help("tax", "Jak działa podatek")}
        </h2>
        <label className="checkbox">
          <input type="checkbox" checked={c.taxEnabled} onChange={(e) => setConfig({ taxEnabled: e.target.checked })} />
          Pobieraj podatek od sprzedaży
        </label>
        {c.taxEnabled ? (
          fieldRow(
            "Podatek",
            numberInput(c.taxPercent, (n) => setConfig({ taxPercent: n }), "%", 0, 100),
            `Przedmiot sprzedany za ${money(100)} - sprzedający dostaje ${money(100 - c.taxPercent)}, kupujący płaci ${money(100)}`
          )
        ) : (
          <p className="muted small ci-toggle-off">Sprzedający dostaje całą cenę.</p>
        )}
      </>
    );
  }

  function mailboxSection() {
    return (
      <>
        <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
          Skrzynka „Do odebrania” {help("mailbox", "Jak działa skrzynka")}
        </h2>
        <label className="checkbox">
          <input type="checkbox" checked={c.mailbox} onChange={(e) => setConfig({ mailbox: e.target.checked })} />
          Włącz skrzynkę „Do odebrania”
        </label>
        <p className="muted small ci-toggle-off">
          {c.mailbox
            ? "Wygasłe oferty i kupione rzeczy, które nie mieszczą się w ekwipunku, czekają w przycisku „Do odebrania”."
            : "Kupione rzeczy, które się nie mieszczą, wypadają pod nogi. Wygasłe oferty wracają do ekwipunku (albo przy następnym wejściu)."}
        </p>
      </>
    );
  }

  /** Ustawienia, które różnią się od serwera - każde da się cofnąć osobno. */
  function changes(): Array<{ key: string; section: Section; label: string; from: string; to: string; revert: () => void }> {
    if (!serverFile) return [];
    const a = serverFile.config;
    const out: Array<{ key: string; section: Section; label: string; from: string; to: string; revert: () => void }> = [];
    const add = (key: string, sec: Section, label: string, from: string, to: string, revert: () => void) => {
      if (from !== to) out.push({ key, section: sec, label, from, to, revert });
    };
    const expire = (d: number) => (d > 0 ? `${d} dni` : "nie wygasają");
    const ranks = (x: MarketConfig) =>
      x.rankLimits.filter((r) => r.rank.trim()).map((r) => `${r.rank} ${r.limit}`).join(", ") || "brak";
    add("limit", "offers", "Ofert naraz", String(a.defaultLimit), String(c.defaultLimit), () => setConfig({ defaultLimit: a.defaultLimit }));
    add("min", "offers", "Najniższa cena", money(a.minPrice), money(c.minPrice), () => setConfig({ minPrice: a.minPrice }));
    add("max", "offers", "Najwyższa cena", money(a.maxPrice), money(c.maxPrice), () => setConfig({ maxPrice: a.maxPrice }));
    add("expire", "offers", "Wygasanie", expire(a.expireDays), expire(c.expireDays), () => setConfig({ expireDays: a.expireDays }));
    add("ranks", "offers", "Limity rang", ranks(a), ranks(c), () => setConfig({ rankLimits: a.rankLimits }));
    add("tax", "tax", "Podatek", a.taxEnabled ? `${a.taxPercent} %` : "wyłączony", c.taxEnabled ? `${c.taxPercent} %` : "wyłączony", () =>
      setConfig({ taxEnabled: a.taxEnabled, taxPercent: a.taxPercent })
    );
    add("mailbox", "mailbox", "Skrzynka „Do odebrania”", a.mailbox ? "włączona" : "wyłączona", c.mailbox ? "włączona" : "wyłączona", () =>
      setConfig({ mailbox: a.mailbox })
    );
    const layout = (x: MarketConfig) => JSON.stringify([x.size, x.offerSlots, x.buttons, x.title, x.background]);
    if (layout(a) !== layout(c))
      out.push({
        key: "window",
        section: "offers",
        label: "Wygląd okna",
        from: "",
        to: "zmieniony",
        revert: () => setConfig({ size: a.size, offerSlots: a.offerSlots, buttons: a.buttons, title: a.title, background: a.background }),
      });
    for (const f of MARKET_TEXTS.fields) {
      add(`text-${f.key}`, "texts", `Tekst: ${f.label}`, serverFile.texts[f.key] ?? "", file.texts[f.key] ?? "", () =>
        setTexts({ [f.key]: serverFile.texts[f.key] ?? "" })
      );
    }
    return out;
  }

  function changesPanel() {
    const list = changes();
    return (
      <aside className="card ci-changes">
        <div className="ci-section-title">Zmiany do wysłania</div>
        {!serverFile ? (
          <p className="muted small">Na serwerze nie ma jeszcze ustawień Targu - wszystko pójdzie przy pierwszym wysłaniu.</p>
        ) : list.length === 0 ? (
          <p className="muted small">Wszystko jak na serwerze - nic nie zmieniłeś.</p>
        ) : (
          <>
            {list.map((ch) => (
              <div key={ch.key} className="ci-change">
                <button
                  type="button"
                  className="ci-change-text"
                  title="Pokaż to ustawienie"
                  onClick={() => (ch.key === "window" ? setTab("window") : setSection(ch.section))}
                >
                  <span className="ci-change-label">{ch.label}</span>
                  {ch.section === "texts" || ch.key === "window" ? (
                    <span className="small">zmieniony</span>
                  ) : (
                    <span className="small">
                      <span className="muted">{ch.from}</span> → <b>{ch.to}</b>
                    </span>
                  )}
                </button>
                <button type="button" className="ci-change-undo" title="Cofnij tę zmianę (wróć do tego, co jest na serwerze)" onClick={ch.revert}>
                  <Undo2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <p className="muted small" style={{ marginBottom: 0 }}>
              Żeby zmiany zadziałały w grze: „Wyślij na serwer” u góry.
            </p>
          </>
        )}
      </aside>
    );
  }

  function renderSettings() {
    const sections: Array<[Section, string, string]> = [
      ["offers", "Oferty i limity", `${c.defaultLimit} ofert, ${c.expireDays > 0 ? `wygasają po ${c.expireDays} dniach` : "nie wygasają"}`],
      ["tax", "Podatek", c.taxEnabled ? `${c.taxPercent}% od sprzedaży` : "wyłączony"],
      ["mailbox", "Skrzynka „Do odebrania”", c.mailbox ? "włączona" : "wyłączona"],
      ["texts", "Teksty w grze", "wszystko, co Targ pisze graczom"],
    ];
    return (
      <div className="ci-settings-layout">
        <aside className="card ci-cats">
          <div className="ci-section-title">Ustawienia</div>
          {sections.map(([id, label, sub]) => (
            <button key={id} type="button" className={`ci-cat ci-settings-nav${section === id ? " active" : ""}`} onClick={() => setSection(id)}>
              <span className="ci-item-name">{label}</span>
              <span className="muted small">{sub}</span>
            </button>
          ))}
        </aside>
        <section className="card form ci-settings-panel">
          {section === "offers" && offersSection()}
          {section === "tax" && taxSection()}
          {section === "mailbox" && mailboxSection()}
          {section === "texts" && (
            <GameTextsSection
              texts={file.texts}
              setTexts={setTexts}
              fields={MARKET_TEXTS.fields}
              groups={MARKET_TEXT_GROUPS}
              defaults={MARKET_TEXTS.defaults(language)}
              placeholderLabels={MARKET_PLACEHOLDER_LABELS}
              sampleValues={MARKET_SAMPLE_VALUES}
              currency={currency}
              helpId="market-texts"
              onHelp={() => setSmallHelp("texts")}
              who="Targ"
              searchHint="np. „kupiono” albo „wygasła”"
            />
          )}
          {section !== "texts" && (
            <div className="row" style={{ marginTop: "1rem" }}>
              <ConfirmButton
                title="Liczby z tej strony wracają do wartości domyślnych Targu (wygląd okna i teksty zostają)"
                onConfirm={() => {
                  const d = defaultMarket();
                  setConfig({
                    defaultLimit: d.defaultLimit,
                    minPrice: d.minPrice,
                    maxPrice: d.maxPrice,
                    expireDays: d.expireDays,
                    taxEnabled: d.taxEnabled,
                    taxPercent: d.taxPercent,
                    mailbox: d.mailbox,
                    rankLimits: [],
                  });
                }}
                disabled={(() => {
                  const d = defaultMarket();
                  return (
                    c.defaultLimit === d.defaultLimit &&
                    c.minPrice === d.minPrice &&
                    c.maxPrice === d.maxPrice &&
                    c.expireDays === d.expireDays &&
                    c.taxEnabled === d.taxEnabled &&
                    c.taxPercent === d.taxPercent &&
                    c.mailbox === d.mailbox &&
                    c.rankLimits.length === 0
                  );
                })()}
              >
                <Undo2 size={14} strokeWidth={1.75} /> Przywróć domyślne ustawienia
              </ConfirmButton>
            </div>
          )}
        </section>
        {changesPanel()}
      </div>
    );
  }

  const small = smallHelp ? MARKET_SMALL_HELP[smallHelp] : null;

  return (
    <div className="page">
      <Link to="/tools" className="back-link">
        ← Twoje pluginy
      </Link>
      <h1>Targ</h1>
      <div className="ci-page-intro">
        <p className="muted">Gracze wystawiają swoje przedmioty za wybraną cenę, a inni je kupują. Tu ustawiasz limity, podatek, wygląd okna i teksty.</p>
      </div>

      <div className="row ci-toolbar">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setShowCommands(true)}>
          <Terminal size={14} strokeWidth={1.75} /> Komendy
        </button>
        <button type="button" className={tab === "settings" ? "ci-publish" : undefined} onClick={() => setTab("settings")}>
          Ustawienia
        </button>
        <button type="button" className={tab === "window" ? "ci-publish" : undefined} onClick={() => setTab("window")}>
          Wygląd okna
        </button>
        <button type="button" className={tab === "live" ? "ci-publish" : undefined} onClick={() => setTab("live")} title="Oferty, które są teraz na Targu - zdejmowanie działa od razu">
          Oferty na żywo
        </button>
        <HelpButton id="market-how-it-works" title="Przewodnik: jak działa targ, krok po kroku" label="Jak działa targ" onClick={() => setGuide({ part: null })} />
        <span style={{ flex: 1 }} />
        <button type="button" title="Cofnij ostatnią zmianę (Ctrl+Z)" onClick={undoFile} disabled={historyRef.current.past.length === 0}>
          <Undo2 size={14} strokeWidth={1.75} /> Cofnij
        </button>
        <button type="button" title="Ponów cofniętą zmianę (Ctrl+Y)" onClick={redoFile} disabled={historyRef.current.future.length === 0}>
          <Redo2 size={14} strokeWidth={1.75} /> Ponów
        </button>
        <button
          type="button"
          title="Wczytuje Targ od nowa prosto z serwera"
          onClick={() => void reloadFromServer()}
          disabled={!profileId || busy}
        >
          ↶ Wczytaj z serwera
        </button>
        <button
          type="button"
          className="ci-save-btn"
          title={unsaved ? "Masz niezapisane zmiany - kliknij, żeby zapisać (Ctrl+S). Na serwer trafią po „Wyślij na serwer”." : "Wszystko zapisane"}
          onClick={save}
          disabled={!unsaved}
        >
          <Save size={14} strokeWidth={1.75} /> Zapisz
          {unsaved && <span className="ci-dirty-dot" />}
        </button>
        <button
          className="ci-publish"
          onClick={() => void publish()}
          disabled={!profileId || (!unsaved && !notSent) || busy}
          title={notSent && !unsaved ? "Zapisane, jeszcze niewysłane - kliknij, żeby wysłać na serwer" : undefined}
        >
          <Upload size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
      </div>
      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
      {discarded && (
        <div className="ci-restore-bar">
          <span>Wczytano Targ z serwera - Twoje niewysłane zmiany zostały odłożone na bok.</span>
          <button
            type="button"
            className="ci-publish"
            onClick={() => {
              setFile(discarded.file);
              setSaved(discarded.saved);
              setDiscarded(null);
            }}
          >
            <Undo2 size={14} strokeWidth={1.75} /> Przywróć moje zmiany
          </button>
          <button type="button" onClick={() => setDiscarded(null)}>
            Nie, wyrzuć je
          </button>
        </div>
      )}
      {problems.length > 0 && tab !== "live" && (
        <div className="ci-badges" style={{ marginBottom: "0.6rem" }}>
          {problems.map((p) => (
            <span key={p} className="ci-badge warn">
              {p}
            </span>
          ))}
        </div>
      )}
      {showCommands && <MarketCommandsModal config={c} onClose={() => setShowCommands(false)} />}
      {small && (
        <SmallHelp
          title={small.title}
          onClose={() => setSmallHelp(null)}
          onMore={() => {
            setSmallHelp(null);
            setGuide({ part: small.part });
          }}
        >
          {small.body}
        </SmallHelp>
      )}
      {guide && <MarketGuideModal open={guide.part} onClose={() => setGuide(null)} />}
      <ItemDatalists materials={allMaterials} customIds={[]} />

      {tab === "settings" && renderSettings()}
      {tab === "window" && (
        <MarketWindowTab
          config={c}
          setConfig={setConfig}
          defaultTitle={file.texts["menu.title"] ?? ""}
          currency={currency}
          iconPackDir={iconPackDir}
          onHelp={() => setSmallHelp("window")}
        />
      )}
      {tab === "live" && (
        <MarketLiveTab
          profileId={profileId}
          dir={pluginsPath ? marketDir(pluginsPath) : ""}
          expireDays={serverFile?.config.expireDays ?? c.expireDays}
          mailbox={serverFile?.config.mailbox ?? c.mailbox}
          currency={currency}
          iconPackDir={iconPackDir}
          onHelp={() => setSmallHelp("live")}
        />
      )}
    </div>
  );
}
