import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { listTexturePacks, rconSendCommand, rpMakeTransparent, rpTextureStatus, rpWriteTextFile } from "../lib/api";
import { changedFiles, DEFAULT_FILE, duplicateIds, normalizeEntry } from "../lib/itemCatalog";
import { itemsDir, loadItemCatalog, saveItemFiles } from "../lib/itemCatalogRemote";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { COMMON_ENCHANTMENTS, COMMON_MATERIALS } from "../lib/minecraftData";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { CustomItemEntry, TexturePackProject } from "../lib/types";

// KOPIA: zakładka Custom itemy z 2026-09-11 w starym wyglądzie (dwie kolumny), już na
// folderze items/ z enchantami i "niezniszczalny" - sprzed przeróbki na kategorie.

const LAST_USED_KEY = "customitems";
const ALL_FILES = "";

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

export default function CustomItemsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [fileFilter, setFileFilter] = useState(ALL_FILES);
  const [items, setItems] = useState<CustomItemEntry[]>(EMPTY_ITEMS);
  const [serverItems, setServerItems] = useState<CustomItemEntry[]>(EMPTY_ITEMS);
  const [editing, setEditing] = useState<CustomItemEntry>(EMPTY_ITEM);
  const [editingKey, setEditingKey] = useState<{ id: string; file: string } | null>(null);
  const [testPlayer, setTestPlayer] = useState("");
  const [reloadCommand, setReloadCommand] = useState("@reloadcustomitems");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  const [packProjects, setPackProjects] = useState<TexturePackProject[]>([]);
  const [selectedPackId, setSelectedPackId] = useState("");

  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<CustomItemEntry[]>("customitems");

  useEffect(() => {
    listTexturePacks()
      .then(setPackProjects)
      .catch(() => {});
  }, []);

  // Pliki do wyboru przy nowym itemie: te z serwera + te dodane lokalnie + zawsze "my-items.yml".
  const allFiles = useMemo(
    () => [...new Set([...files, ...items.map((it) => it.file), DEFAULT_FILE])].sort(),
    [files, items]
  );
  const dups = useMemo(() => duplicateIds(items), [items]);
  const visible = fileFilter === ALL_FILES ? items : items.filter((it) => it.file === fileFilter);

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
      let statusMsg = `Wysłano na serwer (${toWrite.length ? toWrite.join(", ") : "bez zmian"}).`;
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
    clearForm();
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
    setItems(found.map(normalizeEntry));
    setStatus(`Wczytano preset „${name}" do edycji — kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function clearForm() {
    setEditing({ ...EMPTY_ITEM, file: fileFilter || DEFAULT_FILE });
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
    const idx = next.findIndex((it) => it.id === key.id && it.file === key.file);
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

  function removeItem(item: CustomItemEntry) {
    setItems(items.filter((it) => !(it.id === item.id && it.file === item.file)));
    if (editingKey?.id === item.id && editingKey.file === item.file) clearForm();
  }

  async function testGive(id: string) {
    if (!testPlayer.trim()) {
      setStatus("Podaj nick gracza do testu (konsola RCON nie ma własnej pozycji/tożsamości).");
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

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Custom itemy</h1>
      <p className="muted">
        Katalog itemów mainplugins-core (folder items/, każdy plik *.yml) — materiał, nazwa, lore, blask, enchanty,
        niezniszczalność i opcjonalny własny model z resource packa. ID itemu działa wszędzie: w nagrodach
        („custom: ID”), sklepie, skrzynkach i questach.
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
          <span className="muted small">Folder: {pluginsPath ? itemsDir(pluginsPath) : "—"}</span>
          <button onClick={() => load()} disabled={!profileId || busy}>
            Wczytaj ponownie
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

      {dups.length > 0 && (
        <p className="error">
          To samo ID jest w kilku plikach: {dups.join(", ")}. Plugin użyje tylko pierwszego (alfabetycznie wg pliku) —
          zmień ID albo usuń duplikat.
        </p>
      )}

      <div className="two-col">
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Itemy ({visible.length})</h2>
            <select value={fileFilter} onChange={(e) => setFileFilter(e.target.value)}>
              <option value={ALL_FILES}>Wszystkie pliki</option>
              {allFiles.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="card-grid">
            {visible.map((item) => (
              <div key={`${item.file}/${item.id}`} className="card">
                <div className="card-title">{item.id}</div>
                <div className="muted small">
                  {item.material} · {item.file}
                  {item.model ? ` · model: ${item.model}` : ""}
                  {item.glint ? " · blask" : ""}
                  {item.enchants.length ? ` · ${item.enchants.map((e) => `${e.name} ${e.level}`).join(", ")}` : ""}
                  {item.unbreakable ? " · niezniszczalny" : ""}
                </div>
                <div className="row">
                  <button onClick={() => editItem(item)}>Edytuj</button>
                  <button onClick={() => removeItem(item)}>Usuń</button>
                  <button onClick={() => testGive(item.id)} disabled={busy || !profileId}>
                    Wydaj testowo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card form">
          <h2>{editingKey ? "Edytuj item" : "Nowy item"}</h2>

          <label>
            ID (WIELKIMI LITERAMI, np. MOJ_CUSTOM_MIECZ)
            <input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
          </label>

          <label>
            Plik w folderze items/
            <input
              list="item-files"
              value={editing.file}
              onChange={(e) => setEditing({ ...editing, file: e.target.value })}
            />
            <datalist id="item-files">
              {allFiles.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>

          <label>
            Materiał
            <input
              list="materials"
              value={editing.material}
              onChange={(e) => setEditing({ ...editing, material: e.target.value })}
            />
            <datalist id="materials">
              {COMMON_MATERIALS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <label>
            Nazwa (opcjonalnie — bez tego item ma domyślną nazwę materiału)
            <MinecraftTextInput
              value={editing.name}
              onChange={(v) => setEditing({ ...editing, name: v })}
              placeholder="&b&lNazwa itemu"
            />
          </label>

          <fieldset>
            <legend>Lore</legend>
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
          </fieldset>

          <fieldset>
            <legend>Enchanty</legend>
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
          </fieldset>

          <label className="checkbox">
            <input type="checkbox" checked={editing.glint} onChange={(e) => setEditing({ ...editing, glint: e.target.checked })} />
            Wymuszony blask (jak z enczantu)
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={editing.unbreakable}
              onChange={(e) => setEditing({ ...editing, unbreakable: e.target.checked })}
            />
            Niezniszczalny
          </label>

          <fieldset>
            <legend>Własny model (opcjonalnie)</legend>
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
            <p className="muted small">
              Tworzy assets/&lt;ns&gt;/items/&lt;ścieżka&gt;.json + assets/&lt;ns&gt;/models/item/&lt;ścieżka&gt;.json + pustą
              teksturę — dalej otwórz teksturę w Texture Pack, żeby ją narysować.
            </p>
          </fieldset>

          <div className="row">
            <button onClick={upsertEditing} disabled={!profileId}>
              Zapisz item
            </button>
            <button type="button" onClick={clearForm}>
              Wyczyść formularz
            </button>
          </div>

          <div className="row">
            <input placeholder="Nick gracza do testu" value={testPlayer} onChange={(e) => setTestPlayer(e.target.value)} />
          </div>

          <div className="row">
            <input
              placeholder="komenda RCON, np. @reloadcustomitems"
              value={reloadCommand}
              onChange={(e) => setReloadCommand(e.target.value)}
            />
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
