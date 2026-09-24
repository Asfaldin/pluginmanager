import { ask } from "@tauri-apps/plugin-dialog";
import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
import { StatusBar, ListToggle } from "../components/EditorBits";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import MinecraftTextPreview from "../components/MinecraftTextPreview";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, rpMakeTransparent, rpTextureStatus, rpWriteTextFile } from "../lib/api";
import { categoryLabel, changedFiles, DEFAULT_FILE, duplicateIds, normalizeEntry } from "../lib/itemCatalog";
import { itemsDir, loadItemCatalog, saveItemFiles } from "../lib/itemCatalogRemote";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { COMMON_ENCHANTMENTS } from "../lib/minecraftData";
import { ALL_ITEMS } from "../lib/minecraftItems";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { CustomItemEntry } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "customitems";
const ALL = "";

const EMPTY_ITEMS: CustomItemEntry[] = [];

const EMPTY_ITEM: CustomItemEntry = {
  id: "",
  file: DEFAULT_FILE,
  material: "STONE",
  name: "",
  lore: [],
  model: "",
  glint: false,
  enchants: [],
  unbreakable: false,
};

const ENCHANT_KEYS = COMMON_ENCHANTMENTS.map((e) => e.toLowerCase());
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function roman(level: number): string {
  return ROMAN[level] ?? String(level);
}

/** Tekst bez kodów kolorów - do wyszukiwania. */
function plain(text: string): string {
  return text.replace(/&#[0-9a-fA-F]{6}|&[0-9a-fk-orA-FK-OR]/g, "");
}

function sameItem(a: CustomItemEntry, key: { id: string; file: string } | null): boolean {
  return !!key && a.id === key.id && a.file === key.file;
}

export default function CustomItemsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState("");
  // Ktore grupy itemow sa zwiniete (naglowek grupy dziala jak przycisk).
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [items, setItems] = useState<CustomItemEntry[]>(EMPTY_ITEMS);
  const [serverItems, setServerItems] = useState<CustomItemEntry[]>(EMPTY_ITEMS);
  const [editing, setEditing] = useState<CustomItemEntry>(EMPTY_ITEM);
  const [editingKey, setEditingKey] = useState<{ id: string; file: string } | null>(null);
  const [testPlayer, setTestPlayer] = useState("");
  const [reloadCommand, setReloadCommand] = useState("@reloadcustomitems");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);
  const [selectedPackId, setSelectedPackId] = useState("");
  const { iconPackDir, packProjects } = useIconPack(setStatus);

  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<CustomItemEntry[]>("customitems");

  // Kategorie = pliki z serwera + dodane lokalnie + zawsze "Moje itemy".
  const allFiles = useMemo(
    () => [...new Set([...files, ...items.map((it) => it.file), DEFAULT_FILE])].sort(),
    [files, items]
  );
  const dups = useMemo(() => new Set(duplicateIds(items).map((d) => d.toLowerCase())), [items]);
  const pending = useMemo(() => changedFiles(serverItems, items), [serverItems, items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (it) =>
        (category === ALL || it.file === category) &&
        (!q || it.id.toLowerCase().includes(q) || plain(it.name).toLowerCase().includes(q))
    );
  }, [items, category, search]);

  // Przy "Wszystkie" lista jest pogrupowana pod nagłówkami kategorii.
  const groups = useMemo(
    () =>
      allFiles
        .map((f) => ({ file: f, items: visible.filter((it) => it.file === f) }))
        .filter((g) => g.items.length > 0),
    [allFiles, visible]
  );

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setPluginsPath(p.remote_plugins_path);
    setLastUsed(LAST_USED_KEY, { profileId: id, remotePath: p.remote_plugins_path });
    loadPresets(id);
    load(id, p.remote_plugins_path);
  }

  async function load(profileIdOverride?: string, pluginsPathOverride?: string) {
    const pid = profileIdOverride ?? profileId;
    const path = pluginsPathOverride ?? pluginsPath;
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const catalog = await loadItemCatalog(pid, path);
      setFiles(catalog.files);
      setItems(catalog.items);
      setServerItems(catalog.items);
    } catch (e) {
      setStatus(
        `Nie udało się wczytać folderu ${itemsDir(path)} (${String(e)}). Czy na serwerze jest nowa wersja MainpluginsCore?`
      );
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

  // Edycje zmieniają tylko stan lokalny - nic nie trafia na serwer przed "Wyślij na serwer".
  const dirty = items !== serverItems;
  useDirtyTracking(dirty);

  // Wysyłamy tylko pliki, w których coś się zmieniło, a potem prosimy plugin o przeładowanie.
  async function publish() {
    if (!profileId || !pluginsPath) return;
    const toWrite = changedFiles(serverItems, items);
    setBusy(true);
    setStatus(null);
    try {
      await saveItemFiles(profileId, pluginsPath, items, toWrite);
      setServerItems(items);
      setFiles([...new Set([...files, ...toWrite])].sort());
      let statusMsg = `Wysłano na serwer (${toWrite.length ? toWrite.map(categoryLabel).join(", ") : "bez zmian"}).`;
      if (reloadCommand) {
        try {
          const result = await rconSendCommand(profileId, reloadCommand);
          statusMsg += ` Przeładowano (RCON: ${result || "OK"}).`;
        } catch (e) {
          statusMsg += ` ${String(e)}`;
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
    newItem();
    setStatus("Przywrócono stan z serwera - lokalne zmiany odrzucone.");
  }

  async function saveCurrentPresetAs() {
    if (!profileId) return;
    const name = await showPrompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(profileId, name, items);
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    setItems(found.map(normalizeEntry));
    setStatus(`Wczytano preset „${name}" do edycji - kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function newItem() {
    setEditing({ ...EMPTY_ITEM, file: category || DEFAULT_FILE });
    setEditingKey(null);
  }

  function upsertEditing() {
    const id = editing.id.trim().toUpperCase();
    if (!id) {
      setStatus("Podaj ID itemu (WIELKIMI LITERAMI).");
      return;
    }
    const file = editing.file.trim() || DEFAULT_FILE;
    const toSave: CustomItemEntry = {
      ...editing,
      id,
      file: file.toLowerCase().endsWith(".yml") ? file : `${file}.yml`,
      enchants: editing.enchants.filter((e) => e.name && e.level >= 1),
    };
    const next = [...items];
    const key = editingKey ?? { id, file: toSave.file };
    const idx = next.findIndex((it) => sameItem(it, key));
    if (idx >= 0) next[idx] = toSave;
    else next.push(toSave);
    setItems(next);
    // Zostajemy na zapisanym itemie - wyczyszczony formularz wyglądał jak "wyrzucenie z edycji".
    setEditing(toSave);
    setEditingKey({ id: toSave.id, file: toSave.file });
    setStatus(`Zapisano „${toSave.id}" w aplikacji. Kliknij „Wyślij na serwer" u góry, żeby zmiana trafiła na serwer.`);
  }

  function editItem(item: CustomItemEntry) {
    setEditing(item);
    setEditingKey({ id: item.id, file: item.file });
  }

  async function removeEditing() {
    if (!editingKey) return;
    const confirmed = await ask(`Usunąć item ${editingKey.id}? (Na serwerze zniknie dopiero po „Wyślij na serwer”.)`, {
      title: "Usunąć item?",
      kind: "warning",
    });
    if (!confirmed) return;
    setItems(items.filter((it) => !sameItem(it, editingKey)));
    newItem();
  }

  async function testGive(id: string) {
    if (!testPlayer.trim()) {
      setStatus("Podaj nick gracza do testu w „Więcej opcji” u góry.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, `@dajcustom ${id} ${testPlayer.trim()} 1`);
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

  async function generateModelFiles(item: CustomItemEntry) {
    const modelRef = item.model.trim();
    if (!modelRef) return;
    const pack = packProjects.find((p) => p.id === selectedPackId);
    if (!pack) {
      setStatus("Wybierz paczkę tekstur (zakładka Texture Pack), do której mają trafić pliki modelu.");
      return;
    }
    const [namespace, path] = modelRef.split(":");
    if (!namespace || !path) {
      setStatus('Pole "model" musi być w formacie namespace:sciezka, np. mainplugins:moj_miecz.');
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

  function setEnchant(i: number, patch: Partial<{ name: string; level: number }>) {
    const next = [...editing.enchants];
    next[i] = { ...next[i], ...patch };
    setEditing({ ...editing, enchants: next });
  }

  function itemRow(item: CustomItemEntry) {
    const isDup = dups.has(item.id.toLowerCase());
    return (
      <button
        key={`${item.file}/${item.id}`}
        type="button"
        className={`ci-item${sameItem(item, editingKey) ? " active" : ""}`}
        onClick={() => editItem(item)}
      >
        <MaterialIcon material={item.material} iconPackDir={iconPackDir} />
        <span className="ci-item-text">
          <span className="ci-item-name">
            <MinecraftTextPreview text={item.name} emptyLabel={item.id} />
          </span>
          <span className="ci-badges">
            <span className="muted small">{item.id}</span>
            {item.enchants.length > 0 && <span className="ci-badge">enchanty</span>}
            {item.unbreakable && <span className="ci-badge">niezniszczalny</span>}
            {item.model && <span className="ci-badge">model</span>}
            {isDup && <span className="ci-badge warn">duplikat ID</span>}
          </span>
        </span>
      </button>
    );
  }

  const catCount = (f: string) => items.filter((it) => it.file === f).length;

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Custom itemy</h1>
      <p className="muted">
        Tu tworzysz własne przedmioty z nazwą, opisem i enchantami. Każdy możesz potem dać graczom w sklepie, skrzynce
        albo jako nagrodę.
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
        <span style={{ flex: 1 }} />
        <button type="button" onClick={revertToServer} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
          {pending.length > 0 && ` (${pending.length} ${pending.length === 1 ? "zmieniona kategoria" : "zmienione kategorie"})`}
        </button>
      </div>

      <ToolbarMore>
        <div className="row">
          <span className="muted small">Folder: {pluginsPath ? itemsDir(pluginsPath) : "-"}</span>
          <button onClick={() => load()} disabled={!profileId || busy}>
            Wczytaj ponownie
          </button>
        </div>
        <div className="row">
          <input placeholder="Nick gracza do „Wydaj testowo”" value={testPlayer} onChange={(e) => setTestPlayer(e.target.value)} />
          <input
            placeholder="komenda RCON, np. @reloadcustomitems"
            value={reloadCommand}
            onChange={(e) => setReloadCommand(e.target.value)}
          />
          <button onClick={reload} disabled={busy || !profileId}>
            Wyślij RCON
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

      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
      {dups.size > 0 && (
        <p className="error">
          To samo ID jest w kilku kategoriach - plugin użyje tylko pierwszego (alfabetycznie wg pliku). Zmień ID albo usuń
          duplikat.
        </p>
      )}

      <div className="ci-layout">
        <aside className="card ci-cats">
          <input placeholder="Szukaj itemu..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className={`ci-cat${category === ALL ? " active" : ""}`} onClick={() => setCategory(ALL)}>
            <span>Wszystkie</span>
            <span className="ci-count">{items.length}</span>
          </button>
          {allFiles.map((f) => (
            <button
              key={f}
              type="button"
              className={`ci-cat${category === f ? " active" : ""}`}
              onClick={() => setCategory(f)}
            >
              <span>{categoryLabel(f)}</span>
              <span className="ci-count">{catCount(f)}</span>
            </button>
          ))}
          <button type="button" onClick={newItem} disabled={!profileId} style={{ marginTop: "0.5rem" }}>
            + Nowy item
          </button>
        </aside>

        <section className="card ci-list">
          {visible.length === 0 && <p className="muted">Brak itemów{search ? " pasujących do wyszukiwania" : ""}.</p>}
          {category === ALL
            ? groups.map((g) => (
                <div key={g.file}>
                  <ListToggle
                    open={!closedGroups.includes(g.file)}
                    onToggle={() =>
                      setClosedGroups(closedGroups.includes(g.file) ? closedGroups.filter((f) => f !== g.file) : [...closedGroups, g.file])
                    }
                    label={`${categoryLabel(g.file)} (${g.items.length})`}
                  />
                  {!closedGroups.includes(g.file) && g.items.map(itemRow)}
                </div>
              ))
            : visible.map(itemRow)}
        </section>

        <section className="card form ci-editor">
          <h2>{editingKey ? `Edycja: ${editingKey.id}` : "Nowy item"}</h2>

          <div className="ci-tooltip">
            <div>
              <MinecraftTextPreview text={editing.name} emptyLabel={editing.material || "(nazwa)"} />
            </div>
            {editing.lore.map((line, i) => (
              <div key={i}>
                <MinecraftTextPreview text={line} emptyLabel=" " />
              </div>
            ))}
            {editing.enchants.map((en, i) => (
              <div key={`e${i}`} className="ci-tip-gray">
                {en.name} {roman(en.level)}
              </div>
            ))}
            {editing.unbreakable && <div className="ci-tip-blue">Niezniszczalny</div>}
          </div>

          <div className="ci-section-title">Podstawowe</div>
          <label>
            ID (WIELKIMI LITERAMI, np. MOJ_CUSTOM_MIECZ)
            <input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
          </label>
          <label>
            Nazwa (opcjonalnie - bez tego item ma domyślną nazwę materiału)
            <MinecraftTextInput
              value={editing.name}
              onChange={(v) => setEditing({ ...editing, name: v })}
              placeholder="&b&lNazwa itemu"
            />
          </label>
          <label>
            Materiał
            <input
              list="materials"
              value={editing.material}
              onChange={(e) => setEditing({ ...editing, material: e.target.value })}
            />
            <datalist id="materials">
              {ALL_ITEMS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label>
            Kategoria
            <select value={editing.file} onChange={(e) => setEditing({ ...editing, file: e.target.value })}>
              {allFiles.map((f) => (
                <option key={f} value={f}>
                  {categoryLabel(f)}
                </option>
              ))}
            </select>
          </label>

          <div className="ci-section">
            <div className="ci-section-title">Opis (lore)</div>
            {editing.lore.map((line, i) => (
              <div key={i} className="mc-message-row">
                <MinecraftTextInput
                  value={line}
                  onChange={(v) => {
                    const next = [...editing.lore];
                    next[i] = v;
                    setEditing({ ...editing, lore: next });
                  }}
                  placeholder="&7Linijka opisu"
                />
                <button type="button" onClick={() => setEditing({ ...editing, lore: editing.lore.filter((_, li) => li !== i) })}>
                  Usuń
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setEditing({ ...editing, lore: [...editing.lore, ""] })}>
              + Dodaj linijkę
            </button>
          </div>

          <div className="ci-section">
            <div className="ci-section-title">Enchanty i właściwości</div>
            {editing.enchants.map((en, i) => (
              <div key={i} className="row">
                <select value={en.name} onChange={(e) => setEnchant(i, { name: e.target.value })}>
                  {[...new Set([en.name, ...ENCHANT_KEYS])].filter(Boolean).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={en.level}
                  onChange={(e) => setEnchant(i, { level: Number(e.target.value) })}
                  style={{ width: "5rem" }}
                />
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, enchants: editing.enchants.filter((_, ei) => ei !== i) })}
                >
                  Usuń
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditing({ ...editing, enchants: [...editing.enchants, { name: "sharpness", level: 1 }] })}
            >
              + Dodaj enchant
            </button>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editing.unbreakable}
                onChange={(e) => setEditing({ ...editing, unbreakable: e.target.checked })}
              />
              Niezniszczalny
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={editing.glint} onChange={(e) => setEditing({ ...editing, glint: e.target.checked })} />
              Wymuszony blask (jak z enczantu)
            </label>
          </div>

          <details className="ci-section">
            <summary className="ci-section-title">Zaawansowane - własny model z resource packa</summary>
            <label>
              Referencja modelu (namespace:ścieżka, bez .json)
              <input
                placeholder="mainplugins:moj_miecz"
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
              <button type="button" onClick={() => generateModelFiles(editing)} disabled={busy || !editing.model.trim() || !selectedPackId}>
                Wygeneruj pliki modelu w paczce
              </button>
            </div>
          </details>

          <div className="row ci-section">
            <button className="ci-publish" onClick={upsertEditing} disabled={!profileId}>
              Zapisz item
            </button>
            <button type="button" onClick={() => testGive(editing.id.trim().toUpperCase())} disabled={busy || !profileId || !editingKey}>
              Wydaj testowo
            </button>
            <button type="button" onClick={removeEditing} disabled={!editingKey}>
              Usuń item
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
