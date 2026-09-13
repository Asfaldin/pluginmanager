import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { COMMON_MATERIALS } from "../lib/minecraftData";
import { DEFAULT_GENERATORS_YAML } from "../lib/toolsDefaults";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { GeneratorDropEntry, GeneratorEntry, GeneratorMode, GeneratorTool } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "generators";

const MODES: GeneratorMode[] = ["PRZEPUSZCZAJACY", "BEZPOSREDNI"];
const TOOLS: GeneratorTool[] = ["PICKAXE", "SHOVEL"];

const EMPTY_GENERATOR: GeneratorEntry = {
  id: "",
  tryb: "PRZEPUSZCZAJACY",
  materialGeneratora: "ANDESITE",
  materialBazowe: "COBBLESTONE",
  narzedzie: "PICKAXE",
  odnowaTickow: 15,
  nazwa: "",
  lore: [],
  bazaDropy: [],
  bonusDropy: [],
};

const HEADER_COMMENT =
  "# Zarzadzane przez RSMCMANAGER. Silnik T2-T4, dodatkowy obok GENERATOR_BRUK_T1/GENERATOR_KRUCHY_T1\n" +
  "# (te dwa zostaja w custom-items.yml, edytowane w zakladce Custom itemy).\n" +
  "# Wydawanie: @dajgenerator <id> [gracz]. Przeladowanie: @reloadgeneratory.\n";

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseDrop(raw: any): GeneratorDropEntry {
  const szansaRaw = raw["szansa-procent"];
  return {
    material: raw.material ?? "STONE",
    szansaProcent: szansaRaw === undefined || szansaRaw === null ? null : Number(szansaRaw),
    iloscMin: Number(raw["ilosc-min"] ?? 1),
    iloscMax: Number(raw["ilosc-max"] ?? raw["ilosc-min"] ?? 1),
  };
}

function serializeDrop(d: GeneratorDropEntry): string[] {
  const lines = [`      - material: ${d.material}`];
  if (d.szansaProcent !== null) lines.push(`        szansa-procent: ${d.szansaProcent}`);
  lines.push(`        ilosc-min: ${d.iloscMin}`);
  lines.push(`        ilosc-max: ${d.iloscMax}`);
  return lines;
}

function parseGeneratorsYaml(text: string): GeneratorEntry[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const generatory = raw.generatory ?? {};
  return Object.entries(generatory).map(([id, v]: [string, any]) => ({
    id,
    tryb: v.tryb ?? "PRZEPUSZCZAJACY",
    materialGeneratora: v["material-generatora"] ?? "STONE",
    materialBazowe: v["material-bazowe"] ?? "",
    narzedzie: v.narzedzie ?? "PICKAXE",
    odnowaTickow: Number(v["odnowa-tickow"] ?? 15),
    nazwa: v.nazwa ?? "",
    lore: Array.isArray(v.lore) ? v.lore.map(String) : [],
    bazaDropy: (v["baza-dropy"] ?? []).map(parseDrop),
    bonusDropy: (v["bonus-dropy"] ?? []).map(parseDrop),
  }));
}

function serializeGeneratorsYaml(items: GeneratorEntry[]): string {
  const lines = [HEADER_COMMENT.trimEnd(), "generatory:"];
  for (const g of items) {
    lines.push(`  ${g.id}:`);
    lines.push(`    tryb: ${g.tryb}`);
    lines.push(`    material-generatora: ${g.materialGeneratora}`);
    if (g.tryb === "PRZEPUSZCZAJACY" && g.materialBazowe.trim()) {
      lines.push(`    material-bazowe: ${g.materialBazowe}`);
    }
    lines.push(`    narzedzie: ${g.narzedzie}`);
    lines.push(`    odnowa-tickow: ${g.odnowaTickow}`);
    if (g.nazwa.trim()) lines.push(`    nazwa: ${quoteYaml(g.nazwa)}`);
    if (g.lore.length > 0) {
      lines.push("    lore:");
      for (const l of g.lore) lines.push(`      - ${quoteYaml(l)}`);
    }
    if (g.tryb === "BEZPOSREDNI" && g.bazaDropy.length > 0) {
      lines.push("    baza-dropy:");
      for (const d of g.bazaDropy) lines.push(...serializeDrop(d));
    }
    if (g.bonusDropy.length > 0) {
      lines.push("    bonus-dropy:");
      for (const d of g.bonusDropy) lines.push(...serializeDrop(d));
    }
  }
  return lines.join("\n") + "\n";
}

function DropListEditor({
  title,
  dropy,
  guaranteedPick,
  onChange,
}: {
  title: string;
  dropy: GeneratorDropEntry[];
  guaranteedPick: boolean;
  onChange: (next: GeneratorDropEntry[]) => void;
}) {
  function update(i: number, patch: Partial<GeneratorDropEntry>) {
    const next = [...dropy];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  return (
    <fieldset>
      <legend>{title}</legend>
      {dropy.map((d, i) => (
        <div key={i} className="row">
          <input
            list="materials"
            placeholder="Material"
            value={d.material}
            onChange={(e) => update(i, { material: e.target.value })}
          />
          {!guaranteedPick && (
            <input
              type="number"
              placeholder="szansa %"
              value={d.szansaProcent ?? ""}
              onChange={(e) => update(i, { szansaProcent: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
          <input type="number" placeholder="ilość min" value={d.iloscMin} onChange={(e) => update(i, { iloscMin: Number(e.target.value) })} />
          <input type="number" placeholder="ilość max" value={d.iloscMax} onChange={(e) => update(i, { iloscMax: Number(e.target.value) })} />
          <button type="button" onClick={() => onChange(dropy.filter((_, di) => di !== i))}>
            Usuń
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...dropy, { material: "STONE", szansaProcent: guaranteedPick ? null : 10, iloscMin: 1, iloscMax: 1 }])}>
        + Dodaj drop
      </button>
    </fieldset>
  );
}

export default function GeneratorsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [items, setItems] = useState<GeneratorEntry[]>([]);
  const [serverItems, setServerItems] = useState<GeneratorEntry[]>([]);
  const [editing, setEditing] = useState<GeneratorEntry>(EMPTY_GENERATOR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testPlayer, setTestPlayer] = useState("");
  const [reloadCommand, setReloadCommand] = useState("@reloadgeneratory");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<GeneratorEntry[]>("generators");

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsQuests/generatory.yml`;
    setRemotePath(path);
    setLastUsed(LAST_USED_KEY, { profileId: id, remotePath: path });
    loadPresets(id);
    load(id, path);
  }

  // If mainplugins-quests hasn't had this file created yet on this server,
  // bootstrap it from the plugin's own bundled resource - same reasoning as
  // EvolvingToolsPage / IslandsPage, so a fresh server shows the real
  // default generators instead of an empty list with an error.
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
        await sftpWriteFile(pid, path, DEFAULT_GENERATORS_YAML);
        text = DEFAULT_GENERATORS_YAML;
        setStatus("generatory.yml nie istniało — wgrano domyślną wersję. Serwer użyje jej po /@reloadgeneratory albo restarcie.");
      }
      const parsed = parseGeneratorsYaml(text);
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
      await sftpWriteFile(profileId, remotePath, serializeGeneratorsYaml(items));
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
    setEditing(EMPTY_GENERATOR);
    setEditingId(null);
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
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
    setItems(found);
    setStatus(`Wczytano preset „${name}" do edycji — kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function upsertEditing() {
    const id = editing.id.trim().toUpperCase();
    if (!id) {
      setStatus("Podaj ID generatora (WIELKIMI LITERAMI).");
      return;
    }
    if (editing.tryb === "PRZEPUSZCZAJACY" && !editing.materialBazowe.trim()) {
      setStatus("Tryb PRZEPUSZCZAJACY wymaga material-bazowe.");
      return;
    }
    if (editing.tryb === "BEZPOSREDNI" && editing.bazaDropy.length === 0) {
      setStatus("Tryb BEZPOSREDNI wymaga co najmniej jednego wpisu w baza-dropy.");
      return;
    }
    const toSave = { ...editing, id };
    const next = [...items];
    const idx = next.findIndex((it) => it.id === (editingId ?? id));
    if (idx >= 0) next[idx] = toSave;
    else next.push(toSave);
    setItems(next);
    setEditing(EMPTY_GENERATOR);
    setEditingId(null);
  }

  function editItem(item: GeneratorEntry) {
    setEditing(item);
    setEditingId(item.id);
  }

  function removeItem(id: string) {
    setItems(items.filter((it) => it.id !== id));
    if (editingId === id) {
      setEditing(EMPTY_GENERATOR);
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
      const result = await rconSendCommand(profileId, `@dajgenerator ${id} ${testPlayer.trim()}`);
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

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Generatory (tier 2-4)</h1>
      <p className="muted">
        Nowy silnik generatorów mainplugins-quests (generatory.yml) — dodatkowe tiery obok istniejących, nietkniętych
        GENERATOR_BRUK_T1/GENERATOR_KRUCHY_T1 (te dwa dalej edytujesz w zakładce „Custom itemy", bo żyją w
        custom-items.yml). Tryb PRZEPUSZCZAJĄCY (rodzina kilofowa) podmienia blok na prawdziwy materiał i integruje
        się z resztą ekonomii kilofa; BEZPOŚREDNI (rodzina łopatowa) sam losuje jeden z „baza-dropy". W obu trybach
        „bonus-dropy" to niezależne % szansy na dodatkowy, rzadszy surowiec — tu ustawiasz balans per tier.
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
            placeholder="/plugins/MainpluginsQuests/generatory.yml"
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
          <h2>Generatory ({items.length})</h2>
          <div className="card-grid">
            {items.map((item) => (
              <div key={item.id} className="card">
                <div className="card-title">{item.id}</div>
                <div className="muted small">
                  {item.tryb} · {item.narzedzie} · odnowa {item.odnowaTickow}t
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
          <h2>{editingId ? "Edytuj generator" : "Nowy generator"}</h2>

          <label>
            ID (WIELKIMI LITERAMI, np. GENERATOR_BRUK_T2)
            <input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />
          </label>

          <label>
            Tryb
            <select value={editing.tryb} onChange={(e) => setEditing({ ...editing, tryb: e.target.value as GeneratorMode })}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label>
            Narzędzie wymagane
            <select value={editing.narzedzie} onChange={(e) => setEditing({ ...editing, narzedzie: e.target.value as GeneratorTool })}>
              {TOOLS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label>
            Materiał generatora (widoczny, gdy odnowiony)
            <input
              list="materials"
              value={editing.materialGeneratora}
              onChange={(e) => setEditing({ ...editing, materialGeneratora: e.target.value })}
            />
            <datalist id="materials">
              {COMMON_MATERIALS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          {editing.tryb === "PRZEPUSZCZAJACY" && (
            <label>
              Materiał bazowy (na co zamienia się blok przy wykopaniu)
              <input
                list="materials"
                value={editing.materialBazowe}
                onChange={(e) => setEditing({ ...editing, materialBazowe: e.target.value })}
              />
            </label>
          )}

          <label>
            Odnowa (ticków, 20 = 1s)
            <input type="number" value={editing.odnowaTickow} onChange={(e) => setEditing({ ...editing, odnowaTickow: Number(e.target.value) })} />
          </label>

          <label>
            Nazwa
            <MinecraftTextInput value={editing.nazwa} onChange={(v) => setEditing({ ...editing, nazwa: v })} placeholder="&6&lGenerator [T2]" />
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

          {editing.tryb === "BEZPOSREDNI" && (
            <DropListEditor
              title="Baza dropy (jeden losowany równo przy każdym wykopaniu)"
              dropy={editing.bazaDropy}
              guaranteedPick
              onChange={(bazaDropy) => setEditing({ ...editing, bazaDropy })}
            />
          )}

          <DropListEditor
            title="Bonus dropy (niezależna % szansa na dodatkowy przedmiot)"
            dropy={editing.bonusDropy}
            guaranteedPick={false}
            onChange={(bonusDropy) => setEditing({ ...editing, bonusDropy })}
          />

          <div className="row">
            <button onClick={upsertEditing} disabled={!profileId}>
              Zapisz generator (lokalnie — pamiętaj o "Wyślij na serwer")
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(EMPTY_GENERATOR);
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
            <input placeholder="komenda RCON, np. @reloadgeneratory" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
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
