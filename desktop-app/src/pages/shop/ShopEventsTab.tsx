import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ask } from "../../components/AskModal";
import { CopyRow } from "../../components/EditorBits";
import MinecraftTextPreview from "../../components/MinecraftTextPreview";
import { rconSendCommand, sftpReadFile } from "../../lib/api";
import { customDuration, DURATIONS, durationText, eventCommand, formatLeft, parseEvents, parseSales, saleArg, saleCommand, type LiveEvent, type LiveSale } from "../../lib/shopLive";
import type { CategoryDraft, ShopItemDraft } from "../../lib/shopYaml";
import { plain, refLabel } from "./shopPageShared";

interface Props {
  profileId: string;
  /** Folder pluginu Sklepu na serwerze. */
  dir: string;
  cats: CategoryDraft[];
  customNames: Record<string, string>;
}

/** Klucz przedmiotu tak, jak zna go plugin: DIAMOND albo custom:moj_item. */
function keyOf(it: ShopItemDraft): string {
  return it.ref.custom != null ? `custom:${it.ref.custom.toLowerCase()}` : (it.ref.item ?? "STONE").toUpperCase();
}

/** Zakładka „Eventy”: trwające eventy na skup i promocje na kupno - start i koniec od razu na serwerze. */
export default function ShopEventsTab({ profileId, dir, cats, customNames }: Props) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [sales, setSales] = useState<LiveSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [evItem, setEvItem] = useState("");
  const [evPercent, setEvPercent] = useState(50);
  const [evTime, setEvTime] = useState("2h");
  const [saleTarget, setSaleTarget] = useState("all");
  const [salePercent, setSalePercent] = useState(20);
  const [saleTime, setSaleTime] = useState("1d");

  // Wszystkie przedmioty sklepu (też z pul rotacji), bez powtórek.
  const all = new Map<string, { name: string; buy: boolean; sell: boolean }>();
  for (const c of cats) {
    for (const it of [...c.items, ...(c.rotation?.pool ?? [])]) {
      const k = keyOf(it);
      const prev = all.get(k);
      all.set(k, {
        name: it.name.trim() ? plain(it.name) : refLabel(it.ref, customNames),
        buy: (prev?.buy ?? false) || it.buy != null,
        sell: (prev?.sell ?? false) || it.sell != null,
      });
    }
  }
  const nameOfKey = (k: string) => all.get(k)?.name ?? k;
  const sellable = [...all].filter(([, v]) => v.sell).sort((a, b) => a[1].name.localeCompare(b[1].name, "pl"));
  const buyable = [...all].filter(([, v]) => v.buy).sort((a, b) => a[1].name.localeCompare(b[1].name, "pl"));

  function saleLabel(target: string) {
    if (target === "all") return <b>cały sklep</b>;
    if (target.startsWith("category:")) {
      const c = cats.find((x) => x.id === target.slice(9));
      return c ? <MinecraftTextPreview text={c.name} emptyLabel={c.id} /> : target.slice(9);
    }
    return nameOfKey(target.slice(5));
  }

  async function reload() {
    setLoading(true);
    const read = async (f: string) => {
      try {
        return await sftpReadFile(profileId, `${dir}/${f}`);
      } catch {
        return null;
      }
    };
    setEvents(parseEvents(await read("prices.yml")));
    setSales(parseSales(await read("sales.yml")));
    setNow(Date.now());
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, dir]);

  /** Wysyła komendę na serwer; bez RCON pokazuje ją do wpisania w konsoli. true = poszło. */
  async function run(command: string, done: string): Promise<boolean> {
    setManual(null);
    try {
      await rconSendCommand(profileId, command);
      setInfo(done);
      return true;
    } catch {
      setInfo(null);
      setManual(command);
      return false;
    }
  }

  const timeText = durationText;
  const left = (until: number) => (until > 0 ? `zostało ${formatLeft(until - now)}` : "bez końca");

  async function startEvent() {
    if (!evItem) return;
    const p = Math.round(evPercent);
    if (
      !(await ask(`Skup „${nameOfKey(evItem)}” ${p >= 0 ? "drożej" : "taniej"} o ${Math.abs(p)}% - ${timeText(evTime)}. Gracze od razu zobaczą nową cenę.`, {
        title: "Uruchomić event?",
        okLabel: "Uruchom",
      }))
    )
      return;
    if (await run(eventCommand(evItem, p, evTime), "Event uruchomiony.")) {
      const until = evTime ? Date.now() + durationMs(evTime) : 0;
      setEvents([...events.filter((e) => e.key !== evItem), { key: evItem, percent: p, until }]);
    }
  }

  async function stopEvent(key: string) {
    if (!(await ask(`Skup „${nameOfKey(key)}” wróci do zwykłej ceny.`, { title: "Zakończyć event?", okLabel: "Zakończ" }))) return;
    if (await run(`@shop event ${key} off`, "Event zakończony.")) setEvents(events.filter((e) => e.key !== key));
  }

  async function startSale() {
    const p = Math.min(90, Math.max(1, Math.round(salePercent)));
    const target = saleTarget;
    const who = target === "all" ? "cały sklep" : target.startsWith("category:") ? `kategoria ${plain(cats.find((c) => c.id === target.slice(9))?.name ?? "")}` : `„${nameOfKey(target.slice(5))}”`;
    if (!(await ask(`Promocja: ${who} taniej o ${p}% - ${timeText(saleTime)}. Gracze od razu zobaczą nowe ceny.`, { title: "Uruchomić promocję?", okLabel: "Uruchom" })))
      return;
    if (await run(saleCommand(saleArg(target), p, saleTime), "Promocja uruchomiona.")) {
      const until = saleTime ? Date.now() + durationMs(saleTime) : 0;
      setSales([...sales.filter((s) => s.target !== target), { target, percent: p, until }]);
    }
  }

  async function stopSale(target: string) {
    if (!(await ask("Ceny kupna wrócą do normy.", { title: "Zakończyć promocję?", okLabel: "Zakończ" }))) return;
    if (await run(`@shop sale ${saleArg(target)} off`, "Promocja zakończona.")) setSales(sales.filter((s) => s.target !== target));
  }

  return (
    <section className="card form">
      <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        <h2 style={{ margin: 0, flex: 1 }}>Eventy i promocje</h2>
        <button type="button" onClick={() => void reload()} disabled={loading} title="Wczytuje od nowa, co teraz trwa na serwerze">
          <RefreshCw size={14} strokeWidth={1.75} /> Odśwież
        </button>
      </div>
      <p className="muted small">
        Działają <b>od razu</b> na serwerze - bez „Wyślij na serwer”. <b>Event</b> zmienia cenę skupu (ile gracz dostaje za sprzedaż),{" "}
        <b>promocja</b> obniża cenę kupna. Kończą się same po czasie albo przyciskiem „Zakończ”.
      </p>
      {info && <p className="ci-note small">{info}</p>}
      {manual && (
        <div className="ci-warning small">
          <b>Aplikacja nie może wysłać komendy</b> - serwer nie ma włączonego RCON albo jest wyłączony. Wpisz ją w konsoli serwera:
          <div className="ci-protip" style={{ marginTop: "0.4rem" }}>
            <CopyRow cmd={manual} what="skopiuj i wklej w konsoli" />
          </div>
        </div>
      )}

      <div className="ci-section-title" style={{ marginTop: "1rem" }}>
        Eventy na skup
      </div>
      {events.length === 0 && <p className="muted small">Żaden przedmiot nie ma teraz eventu.</p>}
      {events.map((e) => (
        <div key={e.key} className="ci-cat-row" style={{ alignItems: "center" }}>
          <span style={{ flex: 1 }}>
            <b>{nameOfKey(e.key)}</b>{" "}
            <span className={e.percent >= 0 ? "ci-live-up" : "ci-live-down"}>
              skup {e.percent >= 0 ? "+" : ""}
              {e.percent}%
            </span>{" "}
            <span className="muted small">{left(e.until)}</span>
          </span>
          <button type="button" onClick={() => void stopEvent(e.key)}>
            Zakończ
          </button>
        </div>
      ))}
      <div className="row" style={{ alignItems: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
        <label style={{ margin: 0 }}>
          <span className="muted small">Przedmiot</span>
          <select value={evItem} onChange={(e) => setEvItem(e.target.value)}>
            <option value="">- wybierz -</option>
            {sellable.map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ margin: 0 }}>
          <span className="muted small">Zmiana skupu</span>
          <span className="ci-unit-input">
            <input type="number" min={-90} max={500} step={5} value={evPercent} onChange={(e) => setEvPercent(Number(e.target.value) || 0)} style={{ width: "6rem" }} />
            <span className="ci-unit">%</span>
          </span>
        </label>
        <label style={{ margin: 0 }}>
          <span className="muted small">Jak długo</span>
          <DurationPicker value={evTime} onChange={setEvTime} />
        </label>
        <button type="button" className="ci-publish" disabled={!evItem || evPercent === 0} onClick={() => void startEvent()}>
          Uruchom event
        </button>
      </div>
      <p className="muted small">Np. +50% = gracze dostają za sprzedaż o połowę więcej, -20% = o 1/5 mniej.</p>

      <div className="ci-section-title" style={{ marginTop: "1.2rem" }}>
        Promocje na kupno
      </div>
      {sales.length === 0 && <p className="muted small">Nie ma teraz żadnej promocji.</p>}
      {sales.map((s) => (
        <div key={s.target} className="ci-cat-row" style={{ alignItems: "center" }}>
          <span style={{ flex: 1 }}>
            {saleLabel(s.target)} <span className="ci-live-down">kupno -{s.percent}%</span> <span className="muted small">{left(s.until)}</span>
          </span>
          <button type="button" onClick={() => void stopSale(s.target)}>
            Zakończ
          </button>
        </div>
      ))}
      <div className="row" style={{ alignItems: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
        <label style={{ margin: 0 }}>
          <span className="muted small">Na co</span>
          <select value={saleTarget} onChange={(e) => setSaleTarget(e.target.value)}>
            <option value="all">Cały sklep</option>
            <optgroup label="Kategoria">
              {cats.map((c) => (
                <option key={c.id} value={`category:${c.id}`}>
                  {plain(c.name) || c.id}
                </option>
              ))}
            </optgroup>
            <optgroup label="Przedmiot">
              {buyable.map(([k, v]) => (
                <option key={k} value={`item:${k}`}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label style={{ margin: 0 }}>
          <span className="muted small">Zniżka</span>
          <span className="ci-unit-input">
            <input type="number" min={1} max={90} step={5} value={salePercent} onChange={(e) => setSalePercent(Number(e.target.value) || 0)} style={{ width: "6rem" }} />
            <span className="ci-unit">%</span>
          </span>
        </label>
        <label style={{ margin: 0 }}>
          <span className="muted small">Jak długo</span>
          <DurationPicker value={saleTime} onChange={setSaleTime} />
        </label>
        <button type="button" className="ci-publish" disabled={salePercent < 1 || salePercent > 90} onClick={() => void startSale()}>
          Uruchom promocję
        </button>
      </div>
      <p className="muted small">
        Promocja na przedmiot wygrywa z promocją na kategorię, a ta z promocją na cały sklep. Rabat rangi gracza dolicza się do promocji.
      </p>
    </section>
  );
}

/** Jak długo: gotowe czasy albo „własny czas...” (liczba + minuty/godziny/dni). value = zapis do komendy ("45m"). */
function DurationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = DURATIONS.some(([v]) => v === value);
  const [custom, setCustom] = useState(!isPreset);
  const m = /^(\d+)([mhd])$/.exec(value);
  const [n, setN] = useState(m ? Number(m[1]) : 3);
  const [unit, setUnit] = useState<"m" | "h" | "d">(m ? (m[2] as "m" | "h" | "d") : "h");
  const setCustomValue = (nn: number, uu: "m" | "h" | "d") => {
    setN(nn);
    setUnit(uu);
    onChange(customDuration(nn, uu) || "1h");
  };
  return (
    <span className="row" style={{ gap: "0.4rem", margin: 0, alignItems: "center", flexWrap: "nowrap" }}>
      <select
        value={custom ? "custom" : value}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setCustom(true);
            setCustomValue(n, unit);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        {DURATIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
        <option value="custom">własny czas...</option>
      </select>
      {custom && (
        <>
          <input
            type="number"
            min={1}
            step={1}
            value={n}
            onChange={(e) => setCustomValue(Math.max(1, Math.floor(Number(e.target.value) || 1)), unit)}
            style={{ width: "5rem" }}
          />
          <select value={unit} onChange={(e) => setCustomValue(n, e.target.value as "m" | "h" | "d")}>
            <option value="m">minut</option>
            <option value="h">godzin</option>
            <option value="d">dni</option>
          </select>
        </>
      )}
    </span>
  );
}

/** "30m" / "2h" / "1d" -> ms (do pokazania, ile zostało, zanim odświeżysz). */
function durationMs(t: string): number {
  const n = parseInt(t, 10) || 0;
  const u = t.slice(-1);
  return n * (u === "m" ? 60_000 : u === "h" ? 3_600_000 : 86_400_000);
}
