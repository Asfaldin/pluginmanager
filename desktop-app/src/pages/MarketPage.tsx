import { ask } from "@tauri-apps/plugin-dialog";
import { Save, Terminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CopyRow, Fold, StatusBar } from "../components/EditorBits";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import SlotGrid, { type SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import {
  BUTTON_IDS,
  BUTTON_LABELS,
  defaultMarket,
  marketProblems,
  OFFER_SLOTS,
  parseMarketYaml,
  serializeMarketYaml,
  type MarketConfig,
} from "../lib/marketYaml";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

function marketPath(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsMarket/market.yml`;
}

function MarketCommandsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Komendy Targu</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p className="muted small">Gracz: /market (albo /targ). Admin (uprawnienie mainplugins.market.admin) - w konsoli bez „/” na początku.</p>
        <div className="ci-protip">
          <CopyRow cmd="/market" what="otwiera Targ" />
          <CopyRow cmd="/market sell <cena>" what="wystawia przedmiot z ręki (po polsku: /targ wystaw <cena>)" />
          <CopyRow cmd="/@market reload" what="wczytuje ustawienia od nowa (aplikacja robi to sama po „Wyślij na serwer”)" />
          <CopyRow cmd="/@market list <gracz>" what="pokazuje oferty gracza" />
          <CopyRow cmd="/@market remove <gracz>" what="zdejmuje wszystkie oferty gracza do jego skrzynki „Do odebrania”" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Uprawnienia
        </div>
        <div className="ci-protip">
          <CopyRow cmd="mainplugins.market.limit.15" what="gracz może mieć 15 ofert naraz (liczba dowolna, wygrywa najwyższa)" />
          <CopyRow cmd="mainplugins.market.admin" what="komendy /@market" />
        </div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [file, setFile] = useState<MarketConfig>(defaultMarket());
  const [saved, setSaved] = useState<MarketConfig>(defaultMarket());
  const [serverFile, setServerFile] = useState<MarketConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const autoLoadedRef = useRef(false);
  const { iconPackDir, allMaterials } = useIconPack(setStatus);

  const unsaved = useMemo(() => serializeMarketYaml(file) !== serializeMarketYaml(saved), [file, saved]);
  const notSent = useMemo(
    () => serverFile === null || serializeMarketYaml(saved) !== serializeMarketYaml(serverFile),
    [saved, serverFile]
  );
  useDirtyTracking(Boolean(profileId) && (unsaved || notSent));
  const problems = marketProblems(file);

  async function load(pid: string, path: string) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const parsed = parseMarketYaml(await sftpReadFile(pid, marketPath(path)));
      setFile(parsed);
      setSaved(parsed);
      setServerFile(parsed);
    } catch {
      const d = defaultMarket();
      setFile(d);
      setSaved(d);
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

  async function publish() {
    if (!profileId || !pluginsPath) return;
    let toSend = saved;
    if (unsaved) {
      if (!(await ask("Masz niezapisane zmiany. Zapisać je i wysłać razem?", { title: "Niezapisane zmiany", kind: "warning" }))) return;
      toSend = file;
      setSaved(file);
    }
    const warnings = marketProblems(toSend);
    if (warnings.length && !(await ask(`Uwaga:\n- ${warnings.join("\n- ")}\n\nWysłać mimo to?`, { title: "Uwaga", kind: "warning" }))) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, marketPath(pluginsPath), serializeMarketYaml(toSend));
      setServerFile(toSend);
      let msg = "Wysłano na serwer.";
      try {
        const r = await rconSendCommand(profileId, "@market reload");
        msg += ` Przeładowano (RCON: ${r || "OK"}).`;
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

  function set(patch: Partial<MarketConfig>) {
    setFile({ ...file, ...patch });
  }

  function numberField(label: string, value: number, onChange: (n: number) => void, hint?: string, min = 0) {
    return (
      <label>
        {label}
        <input type="number" min={min} value={value} onChange={(e) => onChange(Math.max(min, Math.floor(Number(e.target.value) || 0)))} />
        {hint && <span className="muted small">{hint}</span>}
      </label>
    );
  }

  function materialInput(value: string, onPick: (m: string) => void, listId: string) {
    return (
      <span className="row" style={{ alignItems: "center", gap: "0.4rem", margin: 0 }}>
        {value && <MaterialIcon material={value} iconPackDir={iconPackDir} />}
        <input
          list={listId}
          value={value}
          onChange={(e) => onPick(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
          style={{ minWidth: "14rem" }}
        />
        <datalist id={listId}>
          {allMaterials.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </span>
    );
  }

  // Siatka okna: oferty na stałych polach, przyciski przenosi się klikiem (wybierz przycisk, potem wolne pole).
  const grid: Record<number, SlotContent> = {};
  for (const s of OFFER_SLOTS) grid[s] = { label: "Oferta", kind: "item", dim: true };
  for (let s = 0; s < 54; s++) {
    if (grid[s]) continue;
    grid[s] = {
      label: "",
      kind: "filler",
      onClick: picked
        ? () => {
            set({ buttons: { ...file.buttons, [picked]: { ...file.buttons[picked], slot: s } } });
            setPicked(null);
          }
        : undefined,
    };
  }
  for (const id of BUTTON_IDS) {
    if (id === "mailbox" && !file.mailbox) continue;
    const b = file.buttons[id];
    if (b.slot < 0 || b.slot > 53 || OFFER_SLOTS.includes(b.slot)) continue;
    grid[b.slot] = {
      label: BUTTON_LABELS[id],
      kind: "nav",
      material: b.material,
      highlighted: picked === id,
      onClick: () => setPicked(picked === id ? null : id),
    };
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">
        ← Twoje pluginy
      </Link>
      <h1>Targ graczy</h1>
      <p className="muted">Gracze wystawiają swoje przedmioty za wybraną cenę, inni je kupują. Tu ustawiasz limity, wygasanie ofert, podatek i wygląd menu.</p>

      <div className="row">
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
        <span style={{ flex: 1 }} />
        {notSent && !unsaved && profileId && <span className="muted small">zapisane, jeszcze niewysłane</span>}
        <button
          type="button"
          onClick={() => {
            if (!serverFile) return;
            setFile(serverFile);
            setSaved(serverFile);
          }}
          disabled={!serverFile || (!unsaved && !notSent)}
        >
          ↶ Cofnij do stanu z serwera
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || (!unsaved && !notSent) || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
      </div>
      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
      {showCommands && <MarketCommandsModal onClose={() => setShowCommands(false)} />}

      <section className="card form">
        <Fold title="Limity i ceny" open>
          {numberField("Ile ofert naraz może mieć gracz", file.defaultLimit, (n) => set({ defaultLimit: n }),
            "Więcej dajesz uprawnieniem mainplugins.market.limit.<liczba>, np. mainplugins.market.limit.15 dla VIP.", 1)}
          {numberField("Najniższa cena", file.minPrice, (n) => set({ minPrice: n }), undefined, 1)}
          {numberField("Najwyższa cena", file.maxPrice, (n) => set({ maxPrice: n }), undefined, 1)}
        </Fold>
        <Fold title="Oferty" open>
          {numberField("Po ilu dniach niesprzedana oferta znika", file.expireDays, (n) => set({ expireDays: n }),
            "0 = oferty nigdy nie wygasają. Wygasły przedmiot wraca do sprzedającego.")}
          <label className="row" style={{ alignItems: "center" }}>
            <input type="checkbox" checked={file.mailbox} onChange={(e) => set({ mailbox: e.target.checked })} />
            Skrzynka „Do odebrania”
          </label>
          <p className="muted small" style={{ marginTop: 0 }}>
            Włączona: wygasłe oferty i kupione przedmioty, które nie mieszczą się w ekwipunku, czekają w przycisku „Do odebrania”.
            Wyłączona: takie przedmioty wypadają pod nogi, a wygasłe oferty wracają przy następnym wejściu gracza.
          </p>
          <label className="checkbox">
            <input type="checkbox" checked={file.taxEnabled} onChange={(e) => set({ taxEnabled: e.target.checked })} />
            Pobieraj podatek od sprzedaży
          </label>
          <p className="muted small" style={{ marginTop: 0 }}>
            Część ceny, której sprzedający nie dostaje (np. 5% = dostaje 95%). Zabiera nadmiar pieniędzy z serwera.
            Wyłączona - sprzedający dostaje całą kwotę, a procent obok zostaje zapamiętany na później.
          </p>
          {numberField("Podatek (%)", file.taxPercent, (n) => set({ taxPercent: Math.min(100, n) }),
            file.taxEnabled ? "" : "Podatek jest teraz wyłączony - ta liczba nic nie robi.")}
        </Fold>
        <Fold title="Wygląd menu" open>
          <label>
            Tytuł okna
            <MinecraftTextInput value={file.title} onChange={(v) => set({ title: v })} placeholder="puste = tekst z pliku językowego" />
            <span className="muted small">Możesz użyć {"{page}"} (numer strony).</span>
          </label>
          <label>
            Tło menu
            {materialInput(file.background, (m) => set({ background: m }), "market-bg-materials")}
          </label>
          <p className="muted small">
            {picked
              ? `Kliknij wolne pole, żeby przenieść przycisk „${BUTTON_LABELS[picked]}” (albo kliknij go ponownie, żeby anulować).`
              : "Kliknij przycisk w oknie, a potem wolne pole, żeby go przenieść. Szare pola „Oferta” są stałe."}
          </p>
          <SlotGrid content={grid} size={54} iconPackDir={iconPackDir} plain />
          <div className="ci-section-title" style={{ marginTop: "0.8rem" }}>
            Wygląd przycisków
          </div>
          {BUTTON_IDS.filter((id) => id !== "mailbox" || file.mailbox).map((id) => (
            <label key={id}>
              {BUTTON_LABELS[id]} <span className="muted small">(pole {file.buttons[id].slot})</span>
              {materialInput(file.buttons[id].material, (m) => set({ buttons: { ...file.buttons, [id]: { ...file.buttons[id], material: m } } }), `market-btn-${id}`)}
            </label>
          ))}
          <p className="muted small">Przycisk „Zamknij” zmienia się w gwiazdę „Wróć do menu głównego”, gdy gracz otworzy Targ z /menu.</p>
        </Fold>
        {problems.length > 0 && (
          <div className="ci-badges">
            {problems.map((p) => (
              <span key={p} className="ci-badge warn">
                {p}
              </span>
            ))}
          </div>
        )}
        <div className="ci-actions">
          <button className="ci-publish" type="button" onClick={save} disabled={!unsaved}>
            <Save size={16} strokeWidth={1.75} /> Zapisz
          </button>
          <button type="button" onClick={() => setFile(saved)} disabled={!unsaved}>
            Cofnij niezapisane
          </button>
        </div>
        {unsaved && <p className="muted small">masz niezapisane zmiany</p>}
      </section>
    </div>
  );
}
