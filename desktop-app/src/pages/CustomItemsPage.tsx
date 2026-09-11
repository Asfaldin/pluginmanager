import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
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
import { COMMON_MATERIALS } from "../lib/minecraftData";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { CustomItemEntry, TexturePackProject } from "../lib/types";

const LAST_USED_KEY = "customitems";

const EMPTY_ITEMS: CustomItemEntry[] = [];

const EMPTY_ITEM: CustomItemEntry = {
  id: "",
  material: "STONE",
  name: "",
  lore: [],
  model: "",
  glint: false,
};

const HEADER_COMMENT =
  "# Zarzadzane przez RSMCMANAGER. Wydawanie: @dajcustom <id> [gracz] [ilosc]. Przeladowanie: @reloadcustomitems.\n";

// A lore line that's just "~" (a common decorative divider in item lore)
// parses as YAML null, not the literal text "~" - unquoted, YAML only
// recognizes "~" as null when it's the WHOLE scalar. Left as null it crashes
// MinecraftTextInput's color-code parser (calls .length on it), so restore
// the most likely intended text instead of passing null through.
function sanitizeLoreLine(raw: any): string {
  return raw == null ? "~" : String(raw);
}

function parseCustomItemsYaml(text: string): CustomItemEntry[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const items = raw.items ?? {};
  return Object.entries(items).map(([id, v]: [string, any]) => ({
    id,
    material: v.material ?? "STONE",
    name: v.name ?? "",
    lore: Array.isArray(v.lore) ? v.lore.map(sanitizeLoreLine) : [],
    model: v.model ?? "",
    glint: Boolean(v.glint ?? false),
  }));
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeCustomItemsYaml(items: CustomItemEntry[]): string {
  const lines = [HEADER_COMMENT.trimEnd(), "items:"];
  for (const item of items) {
    lines.push(`  ${item.id}:`);
    lines.push(`    material: ${item.material}`);
    if (item.name.trim()) lines.push(`    name: ${quoteYamlString(item.name)}`);
    if (item.lore.length > 0) {
      lines.push("    lore:");
      for (const line of item.lore) lines.push(`      - ${quoteYamlString(line)}`);
    }
    if (item.model.trim()) lines.push(`    model: ${quoteYamlString(item.model.trim())}`);
    if (item.glint) lines.push("    glint: true");
  }
  return lines.join("\n") + "\n";
}

export default function CustomItemsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [items, setItems] = useState<CustomItemEntry[]>(EMPTY_ITEMS);
  const [serverItems, setServerItems] = useState<CustomItemEntry[]>(EMPTY_ITEMS);
  const [editing, setEditing] = useState<CustomItemEntry>(EMPTY_ITEM);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsCore/custom-items.yml`;
    setRemotePath(path);
    setLastUsed(LAST_USED_KEY, { profileId: id, remotePath: path });
    loadPresets(id);
    load(id, path);
  }

  async function load(profileIdOverride?: string, remotePathOverride?: string) {
    const pid = profileIdOverride ?? profileId;
    const path = remotePathOverride ?? remotePath;
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await sftpReadFile(pid, path);
      const parsed = parseCustomItemsYaml(text);
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

  // Edits only touch local state - nothing reaches the server until "Wyślij
  // na serwer" is clicked, and "Cofnij do stanu z serwera" throws away local
  // changes and goes back to serverItems (set on load and after a successful
  // publish). Reference equality is enough to detect "unsaved changes" since
  // every edit replaces the array/object rather than mutating in place.
  const dirty = items !== serverItems;
  useDirtyTracking(dirty);

  // Writing the file over SFTP does NOT make the running plugin pick it up -
  // it still has the old registry cached in memory until told to reload, so
  // publish also sends the RCON reload command right after a successful
  // write. Otherwise "Wyślij na serwer" would silently do nothing visible
  // in-game until someone separately remembered to click "Wyślij RCON".
  async function publish() {
    if (!profileId || !remotePath) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeCustomItemsYaml(items));
      setServerItems(items);
      let statusMsg = "Wysłano na serwer.";
      if (reloadCommand) {
        try {
          const result = await rconSendCommand(profileId, reloadCommand);
          statusMsg += ` Przeładowano (RCON: ${result || "OK"}).`;
        } catch (e) {
          statusMsg += ` Uwaga: przeładowanie nie powiodło się (${String(e)}) - zmiany są zapisane, ale serwer może jeszcze pokazywać stare dane do ręcznego "Wyślij RCON".`;
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
    setEditing(EMPTY_ITEM);
    setEditingId(null);
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
  }

  // Local presets are a separate, opt-in safety net on top of the draft -
  // saving one never touches the server. Loading one only replaces the local
  // draft; it still has to go through "Wyślij na serwer" to go live - handy
  // if something got overwritten on the server and you want back what you had.
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
      setStatus("Podaj ID itemu (WIELKIMI LITERAMI).");
      return;
    }
    const next = [...items];
    const idx = next.findIndex((it) => it.id === (editingId ?? id));
    const toSave = { ...editing, id };
    if (idx >= 0) next[idx] = toSave;
    else next.push(toSave);
    setItems(next);
    setEditing(EMPTY_ITEM);
    setEditingId(null);
  }

  function editItem(item: CustomItemEntry) {
    setEditing(item);
    setEditingId(item.id);
  }

  function removeItem(id: string) {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    if (editingId === id) {
      setEditing(EMPTY_ITEM);
      setEditingId(null);
    }
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

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Custom itemy</h1>
      <p className="muted">
        Rejestr custom itemów mainplugins-core (custom-items.yml) — material, nazwa, lore, blask, i opcjonalny
        własny model z resource packa. To samo ID można ustawić jako custom-id w sklepie, żeby sklep wydawał
        dokładnie ten item.
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
            placeholder="/plugins/MainpluginsCore/custom-items.yml"
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
          <h2>Itemy ({items.length})</h2>
          <div className="card-grid">
            {items.map((item) => (
              <div key={item.id} className="card">
                <div className="card-title">{item.id}</div>
                <div className="muted small">
                  {item.material}
                  {item.model ? ` · model: ${item.model}` : ""}
                  {item.glint ? " · blask" : ""}
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
          <h2>{editingId ? "Edytuj item" : "Nowy item"}</h2>

          <label>
            ID (WIELKIMI LITERAMI, np. MOJ_CUSTOM_MIECZ)
            <input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
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

          <label className="checkbox">
            <input type="checkbox" checked={editing.glint} onChange={(e) => setEditing({ ...editing, glint: e.target.checked })} />
            Wymuszony blask (jak z enczantu)
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
              Zapisz item (lokalnie — pamiętaj o "Wyślij na serwer")
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(EMPTY_ITEM);
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
