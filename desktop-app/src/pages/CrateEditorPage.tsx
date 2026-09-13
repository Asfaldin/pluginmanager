import { Gift, Save, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ItemRefPicker from "../components/ItemRefPicker";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import MinecraftTextPreview from "../components/MinecraftTextPreview";
import RewardEditor from "../components/RewardEditor";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import {
  addCrate,
  chancePercent,
  DEFAULT_HOLOGRAM_HEIGHT,
  defaultHologram,
  emptyPrize,
  idFromName,
  parseCratesYaml,
  serializeCratesYaml,
  setChancePercent,
  validateCrates,
  type CrateDef,
  type CratesFile,
  type ItemRef,
  type KeyDef,
  type Prize,
} from "../lib/cratesYaml";
import { readSetting } from "../lib/coreSettings";
import { loadItemCatalog } from "../lib/itemCatalogRemote";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

const EMPTY: CratesFile = {
  settings: { hologramHeight: DEFAULT_HOLOGRAM_HEIGHT, placedBlockFromItem: true },
  keys: [],
  crates: [],
};
type View = { kind: "crate"; id: string; prize: number | "settings" } | { kind: "keys"; key: string | null };

function cratesPath(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsCrates/crates.yml`;
}

function LoreEditor({ value, onChange }: { value: string[]; onChange: (l: string[]) => void }) {
  return (
    <div>
      {value.map((line, i) => (
        <div key={i} className="mc-message-row">
          <MinecraftTextInput
            value={line}
            onChange={(v) => onChange(value.map((l, li) => (li === i ? v : l)))}
            placeholder="&7Linijka opisu"
          />
          <button type="button" onClick={() => onChange(value.filter((_, li) => li !== i))}>
            Usuń
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, ""])}>
        + Dodaj linijkę
      </button>
    </div>
  );
}

/** Jedna komenda z opisem i przyciskiem „Kopiuj” (do schowka, do wklejenia w grze/konsoli). */
function CopyRow({ cmd, what }: { cmd: string; what: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ci-protip-row">
      <code>{cmd}</code>
      <span className="muted small">{what}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(cmd)
            .then(() => {
              setCopied(true);
              // Po chwili wraca do „Kopiuj”, żeby dało się skopiować jeszcze raz.
              setTimeout(() => setCopied(false), 500);
            })
            .catch(() => {});
        }}
      >
        {copied ? "Skopiowano" : "Kopiuj"}
      </button>
    </div>
  );
}

/** Ramka „Przydatne komendy” przy skrzynce/kluczu. */
function CommandTip({ commands }: { commands: { cmd: string; what: string }[] }) {
  return (
    <div className="ci-protip">
      <div className="ci-protip-title">Przydatne komendy</div>
      {commands.map(({ cmd, what }) => (
        <CopyRow key={cmd} cmd={cmd} what={what} />
      ))}
    </div>
  );
}

const ALL_COMMANDS: { cmd: string; what: string }[] = [
  { cmd: "/@crate give <gracz> <skrzynka> 1", what: "daje graczowi skrzynkę (ostatnia liczba = ile sztuk)" },
  { cmd: "/@crate key <gracz> <klucz> 1", what: "daje graczowi klucz" },
  { cmd: "/@crate place <skrzynka>", what: "blok, na który patrzysz, staje się tą skrzynką (np. na spawnie)" },
  { cmd: "/@crate remove", what: "patrzysz na postawioną skrzynkę — wraca do zwykłego bloku" },
  { cmd: "/@crate list", what: "lista skrzynek, kluczy i miejsc, gdzie stoją skrzynki" },
  { cmd: "/@crate reload", what: "wczytuje skrzynki od nowa (aplikacja robi to sama po „Wyślij na serwer”)" },
];

/** Okienko ze wszystkimi komendami skrzynek i kluczy w jednym miejscu. */
function CrateCommandsModal({ file, onClose }: { file: CratesFile; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Komendy skrzynek</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p className="muted small">
          Dla admina (uprawnienie mainplugins.crates.admin). W konsoli serwera wpisuj bez „/” na początku. Zamiast
          &lt;gracz&gt; wpisz nick, zamiast &lt;skrzynka&gt;/&lt;klucz&gt; — ID z list niżej.
        </p>
        <div className="ci-protip">
          {ALL_COMMANDS.map((c) => (
            <CopyRow key={c.cmd} cmd={c.cmd} what={c.what} />
          ))}
        </div>

        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Twoje skrzynki
        </div>
        <div className="ci-protip">
          {file.crates.length === 0 && <span className="muted small">Brak skrzynek.</span>}
          {file.crates.map((c) => (
            <CopyRow key={c.id} cmd={`/@crate give <gracz> ${c.id} 1`} what={<MinecraftTextPreview text={c.name} emptyLabel={c.id} />} />
          ))}
        </div>

        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Twoje klucze
        </div>
        <div className="ci-protip">
          {file.keys.length === 0 && <span className="muted small">Brak kluczy.</span>}
          {file.keys.map((k) => (
            <CopyRow key={k.id} cmd={`/@crate key <gracz> ${k.id} 1`} what={<MinecraftTextPreview text={k.name} emptyLabel={k.id} />} />
          ))}
        </div>
      </div>
    </div>
  );
}

function formatPercent(v: number): string {
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

/**
 * Pole na procenty: wpisujesz spokojnie (także „0,5”), a zmiana wchodzi po Enterze
 * albo kliknięciu obok - inaczej przeliczanie pozostałych wygranych skakałoby przy każdej cyfrze.
 */
function PercentInput({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (pct: number) => void }) {
  const [text, setText] = useState(formatPercent(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(formatPercent(value));
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const n = Number(text.replace(",", ".").replace("%", "").trim());
    if (Number.isFinite(n) && n > 0) onCommit(n);
    else setText(formatPercent(value));
  }

  return (
    <div className="row" style={{ alignItems: "center" }}>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        style={{ width: "7rem" }}
      />
      <span>%</span>
    </div>
  );
}

/** Sekcja zwijana strzałką - żeby prawy panel nie pokazywał wszystkiego naraz. */
function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="ci-fold" open={open}>
      <summary>
        <span className="ci-fold-title">{title}</span>
      </summary>
      <div className="ci-fold-body">{children}</div>
    </details>
  );
}

export default function CrateEditorPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  // file = to, co widać i edytujesz; saved = zapisane w aplikacji („Zapisz”); serverFile = stan na serwerze.
  const [file, setFile] = useState<CratesFile>(EMPTY);
  const [saved, setSaved] = useState<CratesFile>(EMPTY);
  const [serverFile, setServerFile] = useState<CratesFile>(EMPTY);
  const [language, setLanguage] = useState("en");
  const [view, setView] = useState<View | null>(null);
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState<string | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const autoLoadedRef = useRef(false);
  const { iconPackDir, allMaterials } = useIconPack(setStatus);

  const unsaved = useMemo(() => serializeCratesYaml(file) !== serializeCratesYaml(saved), [file, saved]);
  const notSent = useMemo(() => serializeCratesYaml(saved) !== serializeCratesYaml(serverFile), [saved, serverFile]);
  useDirtyTracking(unsaved || notSent);
  const crateIds = file.crates.map((c) => c.id);
  const keyIds = file.keys.map((k) => k.id);
  const crate = view?.kind === "crate" ? (file.crates.find((c) => c.id === view.id) ?? null) : null;
  // Pytanie „na pewno usunąć?” znika, gdy przejdziesz do innej skrzynki/wygranej/klucza.
  useEffect(() => setConfirmDelete(false), [view]);

  async function load(pid: string, path: string) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const parsed = parseCratesYaml(await sftpReadFile(pid, cratesPath(path)));
      setFile(parsed);
      setSaved(parsed);
      setServerFile(parsed);
      setView(parsed.crates[0] ? { kind: "crate", id: parsed.crates[0].id, prize: "settings" } : null);
    } catch (e) {
      setFile(EMPTY);
      setSaved(EMPTY);
      setServerFile(EMPTY);
      setView(null);
      setStatus(`Nie udało się wczytać crates.yml (${String(e)}). Czy na serwerze jest nowa wersja pluginu Skrzynek?`);
    } finally {
      setBusy(false);
    }
    loadItemCatalog(pid, path)
      .then((c) => setCustomIds(c.items.map((it) => it.id)))
      .catch(() => setCustomIds([]));
    // Język serwera (core) - żeby domyślny napis nad skrzynką był taki, jak w grze.
    sftpReadFile(pid, `${path.replace(/\/+$/, "")}/MainpluginsCore/config.yml`)
      .then((t) => setLanguage(readSetting(t, "language") ?? "en"))
      .catch(() => setLanguage("en"));
  }

  function save() {
    setSaved(file);
    setStatus("Zapisano w aplikacji. Kliknij „Wyślij na serwer” u góry, żeby zmiany trafiły na serwer.");
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

  function updateCrate(id: string, patch: Partial<CrateDef>) {
    setFile({ ...file, crates: file.crates.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function updateKey(id: string, patch: Partial<KeyDef>) {
    setFile({ ...file, keys: file.keys.map((k) => (k.id === id ? { ...k, ...patch } : k)) });
  }

  function newCrate() {
    const name = window.prompt("Nazwa nowej skrzynki (może mieć spacje, np. Letnia Skrzynka):")?.trim();
    if (!name) return;
    const id = idFromName(name, crateIds);
    setFile(addCrate(file, id, name));
    setView({ kind: "crate", id, prize: "settings" });
    setStatus(`Dodano skrzynkę „${name}”. W komendach jej ID to: ${id} (np. /@crate give <gracz> ${id}).`);
  }

  function newKey() {
    const name = window.prompt("Nazwa nowego klucza (może mieć spacje, np. Klucz VIP):")?.trim();
    if (!name) return;
    const id = idFromName(name, keyIds);
    setFile({ ...file, keys: [...file.keys, { id, name: `&e&l${name}`, lore: [], item: { item: "TRIPWIRE_HOOK" } }] });
    setView({ kind: "keys", key: id });
    setStatus(`Dodano klucz „${name}”. W komendach jego ID to: ${id} (np. /@crate key <gracz> ${id}).`);
  }

  async function publish() {
    if (!profileId || !pluginsPath) return;
    let toSend = saved;
    if (unsaved) {
      if (!window.confirm("Masz niezapisane zmiany. Zapisać je i wysłać razem?")) return;
      toSend = file;
      setSaved(file);
    }
    const warnings = validateCrates(toSend);
    if (warnings.length && !window.confirm(`Uwaga:\n- ${warnings.join("\n- ")}\n\nPlugin pominie te elementy. Wysłać mimo to?`)) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, cratesPath(pluginsPath), serializeCratesYaml(toSend));
      setServerFile(toSend);
      let msg = "Wysłano na serwer.";
      try {
        const r = await rconSendCommand(profileId, "@crate reload");
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

  const iconOf = (r: ItemRef) =>
    r.item ? <MaterialIcon material={r.item} iconPackDir={iconPackDir} /> : <span className="ci-badge">custom</span>;

  function renderCrateSettings(c: CrateDef) {
    return (
      <>
        <h2>
          <MinecraftTextPreview text={c.name} emptyLabel={c.id} />{" "}
          <span className="muted small" title="ID używane w komendach, np. /@crate give <gracz> <id>">
            ID: {c.id}
          </span>
        </h2>
        <CommandTip
          commands={[
            { cmd: `/@crate give <gracz> ${c.id} 1`, what: "daje graczowi skrzynkę" },
            { cmd: `/@crate place ${c.id}`, what: "blok, na który patrzysz, staje się tą skrzynką" },
          ]}
        />
        <Fold title="Nazwa i wygląd" open>
          <label>
            Nazwa
            <MinecraftTextInput value={c.name} onChange={(v) => updateCrate(c.id, { name: v })} placeholder="&6&lNazwa skrzynki" />
          </label>
          <div className="ci-section-title">Wygląd (przedmiot)</div>
          <ItemRefPicker value={c.item} onChange={(r) => updateCrate(c.id, { item: r })} materials={allMaterials} customIds={customIds} />
        </Fold>
        <Fold title="Opis">
          <LoreEditor value={c.lore} onChange={(l) => updateCrate(c.id, { lore: l })} />
        </Fold>
        <Fold title="Klucze, które ją otwierają">
          {file.keys.map((k) => (
            <label key={k.id} className="checkbox">
              <input
                type="checkbox"
                checked={c.keys.includes(k.id)}
                onChange={(e) =>
                  updateCrate(c.id, { keys: e.target.checked ? [...c.keys, k.id] : c.keys.filter((x) => x !== k.id) })
                }
              />
              <MinecraftTextPreview text={k.name} emptyLabel={k.id} /> <span className="muted small">({k.id})</span>
            </label>
          ))}
        </Fold>
        <Fold title="Napis nad postawioną skrzynką">
          <p className="muted small">
            Skrzynkę stawiasz w grze: patrzysz na blok i wpisujesz /@crate place {c.id}
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={c.hologramEnabled}
              onChange={(e) => updateCrate(c.id, { hologramEnabled: e.target.checked })}
            />
            Pokaż napis nad skrzynką
          </label>
          {c.hologramEnabled && (
            <>
              <div className="ci-tooltip">
                {(c.hologram.length ? c.hologram : defaultHologram(c, language)).map((line, i) => (
                  <div key={i}>
                    <MinecraftTextPreview text={line} emptyLabel=" " />
                  </div>
                ))}
              </div>
              <LoreEditor
                value={c.hologram.length ? c.hologram : defaultHologram(c, language)}
                onChange={(l) => updateCrate(c.id, { hologram: l })}
              />
              {c.hologram.length > 0 && (
                <button type="button" onClick={() => updateCrate(c.id, { hologram: [] })}>
                  Przywróć domyślny napis
                </button>
              )}
            </>
          )}
        </Fold>
        <Fold title="Postawione skrzynki — wspólne dla wszystkich">
          <label>
            Wysokość napisu nad blokiem
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={file.settings.hologramHeight}
              onChange={(e) =>
                setFile({
                  ...file,
                  settings: { ...file.settings, hologramHeight: Math.min(5, Math.max(0, Number(e.target.value))) },
                })
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={file.settings.placedBlockFromItem}
              onChange={(e) => setFile({ ...file, settings: { ...file.settings, placedBlockFromItem: e.target.checked } })}
            />
            Postawiony blok wygląda jak przedmiot skrzynki (np. ENDER_CHEST)
          </label>
        </Fold>
      </>
    );
  }

  function renderPrize(c: CrateDef, i: number) {
    const p = c.prizes[i];
    const setPrize = (patch: Partial<Prize>) =>
      updateCrate(c.id, { prizes: c.prizes.map((x, xi) => (xi === i ? { ...x, ...patch } : x)) });
    return (
      <>
        <h2>Wygrana {i + 1}</h2>
        <div className="ci-tooltip">
          <MinecraftTextPreview text={p.name} />
          <div className="ci-tip-gray">Szansa: {chancePercent(c, p).toFixed(1)}%</div>
        </div>
        <Fold title="Nazwa i ikona" open>
          <label>
            Nazwa (w animacji i podglądzie)
            <MinecraftTextInput value={p.name} onChange={(v) => setPrize({ name: v })} placeholder="&bNazwa wygranej" />
          </label>
          <div className="ci-section-title">Ikona</div>
          <ItemRefPicker
            value={p.icon}
            onChange={(r) => setPrize({ icon: r })}
            materials={allMaterials}
            customIds={customIds}
            showAmount
          />
        </Fold>
        <Fold title="Szansa i ogłoszenie">
          <label>
            Szansa (%)
            <PercentInput
              value={chancePercent(c, p)}
              disabled={c.prizes.length <= 1}
              onCommit={(pct) => updateCrate(c.id, { prizes: setChancePercent(c.prizes, i, pct) })}
            />
          </label>
          <p className="muted small">
            {c.prizes.length <= 1
              ? "To jedyna wygrana w tej skrzynce, więc zawsze ma 100%."
              : "Pozostałe wygrane dopasują się same, żeby razem było 100%."}
          </p>
          <label className="checkbox">
            <input type="checkbox" checked={p.announce} onChange={(e) => setPrize({ announce: e.target.checked })} />
            Ogłoś na czacie, gdy ktoś to wylosuje
          </label>
        </Fold>
        <Fold title="Co gracz dostaje" open>
          <RewardEditor
            value={p.rewards}
            onChange={(l) => setPrize({ rewards: l })}
            materials={allMaterials}
            customIds={customIds}
            crateIds={crateIds}
            keyIds={keyIds}
          />
        </Fold>
      </>
    );
  }

  function renderKey(k: KeyDef) {
    const used = file.crates.filter((c) => c.keys.includes(k.id));
    return (
      <>
        <h2>
          <MinecraftTextPreview text={k.name} emptyLabel={k.id} />{" "}
          <span className="muted small" title="ID używane w komendach, np. /@crate key <gracz> <id>">
            ID: {k.id}
          </span>
        </h2>
        <CommandTip commands={[{ cmd: `/@crate key <gracz> ${k.id} 1`, what: "daje graczowi ten klucz" }]} />
        <Fold title="Nazwa i wygląd" open>
          <label>
            Nazwa
            <MinecraftTextInput value={k.name} onChange={(v) => updateKey(k.id, { name: v })} placeholder="&e&lNazwa klucza" />
          </label>
          <div className="ci-section-title">Wygląd (przedmiot)</div>
          <ItemRefPicker value={k.item} onChange={(r) => updateKey(k.id, { item: r })} materials={allMaterials} customIds={customIds} />
        </Fold>
        <Fold title="Opis">
          <LoreEditor value={k.lore} onChange={(l) => updateKey(k.id, { lore: l })} />
        </Fold>
        <p className="muted small">
          Otwiera: {used.map((c) => c.id).join(", ") || "żadnej skrzynki (ustaw w ustawieniach skrzynki)"}
        </p>
      </>
    );
  }

  const selectedKey = view?.kind === "keys" && view.key ? file.keys.find((k) => k.id === view.key) : undefined;

  // Co usuwa przycisk „Usuń” w dolnym pasku - zależy od tego, co jest otwarte po prawej.
  function deleteAction(): { label: string; question: string; blocked?: string; run: () => void } | null {
    if (crate && view?.kind === "crate" && view.prize === "settings") {
      const c = crate;
      return {
        label: "Usuń skrzynkę",
        question: `Na pewno usunąć skrzynkę ${c.id}?`,
        run: () => {
          setFile({ ...file, crates: file.crates.filter((x) => x.id !== c.id) });
          setView(null);
        },
      };
    }
    if (crate && view?.kind === "crate" && typeof view.prize === "number" && crate.prizes[view.prize]) {
      const c = crate;
      const i = view.prize;
      return {
        label: "Usuń wygraną",
        question: `Na pewno usunąć wygraną ${i + 1}?`,
        run: () => {
          updateCrate(c.id, { prizes: c.prizes.filter((_, xi) => xi !== i) });
          setView({ kind: "crate", id: c.id, prize: "settings" });
        },
      };
    }
    if (selectedKey) {
      const k = selectedKey;
      const used = file.crates.some((c) => c.keys.includes(k.id));
      return {
        label: "Usuń klucz",
        question: `Na pewno usunąć klucz ${k.id}?`,
        blocked: used ? "Najpierw odepnij ten klucz od skrzynek" : undefined,
        run: () => {
          setFile({ ...file, keys: file.keys.filter((x) => x.id !== k.id) });
          setView({ kind: "keys", key: null });
        },
      };
    }
    return null;
  }
  const del = deleteAction();

  return (
    <div className="page">
      <Link to="/tools" className="back-link">
        ← Twoje pluginy
      </Link>
      <h1>Skrzynki</h1>
      <p className="muted">
        Twoje skrzynki: wygląd, klucze, które je otwierają, i co można wygrać. Jedna wygrana może dać kilka rzeczy naraz —
        pieniądze, itemy, inne skrzynki albo klucze.
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
        <button type="button" onClick={() => setShowCommands(true)} disabled={!profileId}>
          <Terminal size={14} strokeWidth={1.75} /> Komendy
        </button>
        <span style={{ flex: 1 }} />
        {notSent && !unsaved && <span className="muted small">zapisane, jeszcze niewysłane</span>}
        <button
          type="button"
          onClick={() => {
            setFile(serverFile);
            setSaved(serverFile);
          }}
          disabled={!unsaved && !notSent}
        >
          ↶ Cofnij do stanu z serwera
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || (!unsaved && !notSent) || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
      </div>
      {status && <p className="status">{status}</p>}
      {showCommands && <CrateCommandsModal file={file} onClose={() => setShowCommands(false)} />}

      <div className="ci-layout ci-layout-crates">
        <aside className="card ci-cats">
          <div className="ci-section-title">Skrzynki</div>
          {file.crates.map((c) =>
            trashConfirm === c.id ? (
              <div key={c.id} className="ci-cat-row ci-cat-confirm">
                <span>Usunąć {c.id}?</span>
                <button
                  type="button"
                  className="ci-danger"
                  onClick={() => {
                    setFile({ ...file, crates: file.crates.filter((x) => x.id !== c.id) });
                    if (view?.kind === "crate" && view.id === c.id) setView(null);
                    setTrashConfirm(null);
                  }}
                >
                  Tak
                </button>
                <button type="button" onClick={() => setTrashConfirm(null)}>
                  Nie
                </button>
              </div>
            ) : (
              <div key={c.id} className="ci-cat-row">
                <button
                  type="button"
                  className={`ci-cat${view?.kind === "crate" && view.id === c.id ? " active" : ""}`}
                  onClick={() => setView({ kind: "crate", id: c.id, prize: "settings" })}
                >
                  <span className="ci-item-name">
                    <MinecraftTextPreview text={c.name} emptyLabel={c.id} />
                  </span>
                  <span className="ci-prize-count" title={`${c.prizes.length} wygranych w tej skrzynce`}>
                    <Gift size={12} strokeWidth={2} /> {c.prizes.length}
                  </span>
                </button>
                <button type="button" className="ci-trash" title={`Usuń skrzynkę ${c.id}`} onClick={() => setTrashConfirm(c.id)}>
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            )
          )}
          <button type="button" onClick={newCrate} disabled={!profileId}>
            + Nowa skrzynka
          </button>
          <div className="ci-section-title" style={{ marginTop: "1rem" }}>
            Klucze
          </div>
          <button
            type="button"
            className={`ci-cat${view?.kind === "keys" ? " active" : ""}`}
            onClick={() => setView({ kind: "keys", key: file.keys[0]?.id ?? null })}
          >
            <span>Wszystkie klucze</span>
            <span className="ci-count">{file.keys.length}</span>
          </button>
        </aside>

        <section className="card ci-list">
          {view?.kind === "crate" && crate && (
            <>
              <button
                type="button"
                className={`ci-item${view.prize === "settings" ? " active" : ""}`}
                onClick={() => setView({ ...view, prize: "settings" })}
              >
                {iconOf(crate.item)}
                <span className="ci-item-text">
                  <strong>Ustawienia skrzynki</strong>
                  <span className="muted small">nazwa, wygląd, klucze</span>
                </span>
              </button>
              <div className="ci-group">Wygrane ({crate.prizes.length})</div>
              {crate.prizes.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={`ci-item${view.prize === i ? " active" : ""}`}
                  onClick={() => setView({ ...view, prize: i })}
                >
                  {iconOf(p.icon)}
                  <span className="ci-item-text">
                    <span className="ci-item-name">
                      <MinecraftTextPreview text={p.name} />
                    </span>
                    <span className="ci-badges">
                      <span className="ci-badge">{chancePercent(crate, p).toFixed(1)}%</span>
                      {p.announce && <span className="ci-badge">ogłoszenie</span>}
                      {p.rewards.length === 0 && <span className="ci-badge warn">brak nagród</span>}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  updateCrate(crate.id, { prizes: [...crate.prizes, emptyPrize()] });
                  setView({ ...view, prize: crate.prizes.length });
                }}
              >
                + Dodaj wygraną
              </button>
            </>
          )}
          {view?.kind === "keys" && (
            <>
              {file.keys.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={`ci-item${view.key === k.id ? " active" : ""}`}
                  onClick={() => setView({ kind: "keys", key: k.id })}
                >
                  {iconOf(k.item)}
                  <span className="ci-item-text">
                    <span className="ci-item-name">
                      <MinecraftTextPreview text={k.name} emptyLabel={k.id} />
                    </span>
                    <span className="muted small">
                      otwiera:{" "}
                      {file.crates
                        .filter((c) => c.keys.includes(k.id))
                        .map((c) => c.id)
                        .join(", ") || "nic"}
                    </span>
                  </span>
                </button>
              ))}
              <button type="button" onClick={newKey} disabled={!profileId}>
                + Nowy klucz
              </button>
            </>
          )}
          {!view && <p className="muted">{profileId ? "Brak skrzynek — dodaj pierwszą." : "Wybierz serwer, żeby wczytać skrzynki."}</p>}
        </section>

        <section className="card form ci-editor">
          {crate && view?.kind === "crate" && view.prize === "settings" && renderCrateSettings(crate)}
          {crate && view?.kind === "crate" && typeof view.prize === "number" && crate.prizes[view.prize] && renderPrize(crate, view.prize)}
          {selectedKey && renderKey(selectedKey)}
          {(view || unsaved) && (
            <div className="ci-actions">
              {confirmDelete && del ? (
                <>
                  <span className="ci-actions-question">{del.question}</span>
                  <button
                    type="button"
                    className="ci-danger"
                    onClick={() => {
                      del.run();
                      setConfirmDelete(false);
                    }}
                  >
                    Tak, usuń
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}>
                    Anuluj
                  </button>
                </>
              ) : (
                <>
                  <button className="ci-publish" type="button" onClick={save} disabled={!unsaved}>
                    <Save size={16} strokeWidth={1.75} /> Zapisz
                  </button>
                  <button type="button" onClick={() => setFile(saved)} disabled={!unsaved}>
                    Cofnij niezapisane
                  </button>
                  {del && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      disabled={!!del.blocked}
                      title={del.blocked}
                    >
                      {del.label}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {unsaved && !confirmDelete && <p className="muted small">masz niezapisane zmiany</p>}
        </section>
      </div>
    </div>
  );
}
