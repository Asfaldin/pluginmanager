import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { sftpReadFile, sftpWriteFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { NamedWarp, SpawnArea, WorldPoint } from "../lib/types";

interface SpawnPreset {
  spawnPoint: WorldPoint;
  warps: NamedWarp[];
  areas: SpawnArea[];
}

const LAST_USED_KEY = "spawn";

type SubTab = "spawn" | "warps" | "areas";

const SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: "spawn", label: "Spawn" },
  { key: "warps", label: "Warpy" },
  { key: "areas", label: "Obszary" },
];

const EMPTY_POINT: WorldPoint = { world: "world", x: 0, y: 64, z: 0, yaw: 0, pitch: 0 };
const EMPTY_WARP: NamedWarp = { name: "", ...EMPTY_POINT };
const EMPTY_WARPS: NamedWarp[] = [];
const EMPTY_AREAS: SpawnArea[] = [];
const EMPTY_AREA: SpawnArea = {
  name: "",
  world: "world",
  x1: 0,
  y1: 0,
  z1: 0,
  x2: 0,
  y2: 255,
  z2: 0,
  mobyPasywne: true,
  mobyAgresywne: true,
};

function parseSpawnYaml(text: string): WorldPoint {
  if (!text.trim()) return EMPTY_POINT;
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  return {
    world: raw.world ?? "world",
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 64),
    z: Number(raw.z ?? 0),
    yaw: Number(raw.yaw ?? 0),
    pitch: Number(raw.pitch ?? 0),
  };
}

function serializeSpawnYaml(p: WorldPoint): string {
  return [`world: ${p.world}`, `x: ${p.x}`, `y: ${p.y}`, `z: ${p.z}`, `yaw: ${p.yaw}`, `pitch: ${p.pitch}`].join("\n") + "\n";
}

function parseWarpsYaml(text: string): NamedWarp[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  return Object.entries(raw).map(([name, v]: [string, any]) => ({
    name,
    world: v.world ?? "world",
    x: Number(v.x ?? 0),
    y: Number(v.y ?? 64),
    z: Number(v.z ?? 0),
    yaw: Number(v.yaw ?? 0),
    pitch: Number(v.pitch ?? 0),
  }));
}

function serializeWarpsYaml(warps: NamedWarp[]): string {
  const lines: string[] = [];
  for (const w of warps) {
    lines.push(`${w.name}:`);
    lines.push(`  world: ${w.world}`);
    lines.push(`  x: ${w.x}`);
    lines.push(`  y: ${w.y}`);
    lines.push(`  z: ${w.z}`);
    lines.push(`  yaw: ${w.yaw}`);
    lines.push(`  pitch: ${w.pitch}`);
  }
  return lines.join("\n") + "\n";
}

function parseAreasYaml(text: string): SpawnArea[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  return Object.entries(raw).map(([name, v]: [string, any]) => ({
    name,
    world: v.world ?? "world",
    x1: Number(v.x1 ?? 0),
    y1: Number(v.y1 ?? 0),
    z1: Number(v.z1 ?? 0),
    x2: Number(v.x2 ?? 0),
    y2: Number(v.y2 ?? 255),
    z2: Number(v.z2 ?? 0),
    mobyPasywne: Boolean(v["moby-pasywne"] ?? true),
    mobyAgresywne: Boolean(v["moby-agresywne"] ?? true),
  }));
}

function serializeAreasYaml(areas: SpawnArea[]): string {
  const lines: string[] = [];
  for (const a of areas) {
    lines.push(`${a.name}:`);
    lines.push(`  world: ${a.world}`);
    lines.push(`  x1: ${a.x1}`);
    lines.push(`  y1: ${a.y1}`);
    lines.push(`  z1: ${a.z1}`);
    lines.push(`  x2: ${a.x2}`);
    lines.push(`  y2: ${a.y2}`);
    lines.push(`  z2: ${a.z2}`);
    lines.push(`  moby-pasywne: ${a.mobyPasywne}`);
    lines.push(`  moby-agresywne: ${a.mobyAgresywne}`);
  }
  return lines.join("\n") + "\n";
}

export default function SpawnWarpsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [activeTab, setActiveTab] = useState<SubTab>("spawn");

  const [spawnPoint, setSpawnPoint] = useState<WorldPoint>(EMPTY_POINT);
  const [serverSpawnPoint, setServerSpawnPoint] = useState<WorldPoint>(EMPTY_POINT);
  const [warps, setWarps] = useState<NamedWarp[]>(EMPTY_WARPS);
  const [serverWarps, setServerWarps] = useState<NamedWarp[]>(EMPTY_WARPS);
  const [editingWarp, setEditingWarp] = useState<NamedWarp>(EMPTY_WARP);
  const [editingWarpIndex, setEditingWarpIndex] = useState<number | null>(null);
  const [areas, setAreas] = useState<SpawnArea[]>(EMPTY_AREAS);
  const [serverAreas, setServerAreas] = useState<SpawnArea[]>(EMPTY_AREAS);
  const [editingArea, setEditingArea] = useState<SpawnArea>(EMPTY_AREA);
  const [editingAreaIndex, setEditingAreaIndex] = useState<number | null>(null);

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
  } = useLocalPresets<SpawnPreset>("spawn");

  function baseDir(pid: string): string {
    const p = profiles.find((x) => x.id === pid);
    return p ? `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsSpawn` : "";
  }

  async function loadAll(pid: string) {
    if (!pid) return;
    const dir = baseDir(pid);
    setBusy(true);
    setStatus(null);
    try {
      const [spawnText, warpsText, areasText] = await Promise.all([
        sftpReadFile(pid, `${dir}/spawn.yml`).catch(() => ""),
        sftpReadFile(pid, `${dir}/warps.yml`).catch(() => ""),
        sftpReadFile(pid, `${dir}/obszary.yml`).catch(() => ""),
      ]);
      const spawn = parseSpawnYaml(spawnText);
      const warpsList = parseWarpsYaml(warpsText);
      const areasList = parseAreasYaml(areasText);
      setSpawnPoint(spawn);
      setServerSpawnPoint(spawn);
      setWarps(warpsList);
      setServerWarps(warpsList);
      setAreas(areasList);
      setServerAreas(areasList);
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: dir });
      setStatus("Wczytano spawn, warpy i obszary.");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    setProfileId(id);
    loadPresets(id);
    if (id) loadAll(id);
  }

  // Serwer aktywny GLOBALNIE dla całej appki (pasek boczny) ma pierwszeństwo - dopiero
  // gdy nic tam jeszcze nie wybrano, sięgamy do starego zapisu specyficznego dla tej
  // strony (kompatybilność wsteczna dla osób, które używały appki przed wprowadzeniem
  // globalnego wyboru).
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
  // na serwer" is clicked (writes all three files at once, harmless for the
  // ones that didn't actually change), and "Cofnij do stanu z serwera" throws
  // away every local draft and goes back to the server-mirror state captured
  // on load / after the last successful publish.
  const dirty = spawnPoint !== serverSpawnPoint || warps !== serverWarps || areas !== serverAreas;
  useDirtyTracking(dirty);

  async function publish() {
    if (!profileId) return;
    setBusy(true);
    setStatus(null);
    try {
      const dir = baseDir(profileId);
      await Promise.all([
        sftpWriteFile(profileId, `${dir}/spawn.yml`, serializeSpawnYaml(spawnPoint)),
        sftpWriteFile(profileId, `${dir}/warps.yml`, serializeWarpsYaml(warps)),
        sftpWriteFile(profileId, `${dir}/obszary.yml`, serializeAreasYaml(areas)),
      ]);
      setServerSpawnPoint(spawnPoint);
      setServerWarps(warps);
      setServerAreas(areas);
      setStatus("Wysłano spawn.yml, warps.yml i obszary.yml. Wymaga restartu serwera (brak komendy reload).");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function revertToServer() {
    setSpawnPoint(serverSpawnPoint);
    setWarps(serverWarps);
    setAreas(serverAreas);
    setEditingWarp(EMPTY_WARP);
    setEditingWarpIndex(null);
    setEditingArea(EMPTY_AREA);
    setEditingAreaIndex(null);
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
    savePresetAs(profileId, name, { spawnPoint, warps, areas });
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    setSpawnPoint(found.spawnPoint);
    setWarps(found.warps);
    setAreas(found.areas);
    setStatus(`Wczytano preset „${name}" do edycji — kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function upsertWarp() {
    if (!editingWarp.name.trim()) {
      setStatus("Podaj nazwę warpu.");
      return;
    }
    const next = [...warps];
    if (editingWarpIndex != null) next[editingWarpIndex] = editingWarp;
    else next.push(editingWarp);
    setWarps(next);
    setEditingWarp(EMPTY_WARP);
    setEditingWarpIndex(null);
  }

  function removeWarp(index: number) {
    const next = warps.filter((_, i) => i !== index);
    setWarps(next);
    if (editingWarpIndex === index) {
      setEditingWarp(EMPTY_WARP);
      setEditingWarpIndex(null);
    }
  }

  function upsertArea() {
    if (!editingArea.name.trim()) {
      setStatus("Podaj nazwę obszaru.");
      return;
    }
    const next = [...areas];
    if (editingAreaIndex != null) next[editingAreaIndex] = editingArea;
    else next.push(editingArea);
    setAreas(next);
    setEditingArea(EMPTY_AREA);
    setEditingAreaIndex(null);
  }

  function removeArea(index: number) {
    const next = areas.filter((_, i) => i !== index);
    setAreas(next);
    if (editingAreaIndex === index) {
      setEditingArea(EMPTY_AREA);
      setEditingAreaIndex(null);
    }
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Spawn, warpy i obszary</h1>
      <p className="muted">
        Edytuje spawn.yml, warps.yml i obszary.yml mainplugins-spawn bezpośrednio na serwerze. Ten plugin nie ma
        komendy reload — zmiany zadziałają po restarcie serwera.
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
          <button onClick={() => loadAll(profileId)} disabled={!profileId || busy}>
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

      {profileId && (
        <>
          <div className="row subtabs">
            {SUB_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={activeTab === t.key ? "active" : ""}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "spawn" && (
            <div className="card form">
              <div className="card-title">Punkt spawnu</div>
              <div className="row">
                <label>
                  Świat
                  <input value={spawnPoint.world} onChange={(e) => setSpawnPoint({ ...spawnPoint, world: e.target.value })} />
                </label>
                <label>
                  X
                  <input
                    type="number"
                    value={spawnPoint.x}
                    onChange={(e) => setSpawnPoint({ ...spawnPoint, x: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Y
                  <input
                    type="number"
                    value={spawnPoint.y}
                    onChange={(e) => setSpawnPoint({ ...spawnPoint, y: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Z
                  <input
                    type="number"
                    value={spawnPoint.z}
                    onChange={(e) => setSpawnPoint({ ...spawnPoint, z: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Yaw
                  <input
                    type="number"
                    value={spawnPoint.yaw}
                    onChange={(e) => setSpawnPoint({ ...spawnPoint, yaw: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Pitch
                  <input
                    type="number"
                    value={spawnPoint.pitch}
                    onChange={(e) => setSpawnPoint({ ...spawnPoint, pitch: Number(e.target.value) })}
                  />
                </label>
              </div>
              <p className="muted small">Zmiany zapisują się lokalnie od razu — pamiętaj kliknąć "Wyślij na serwer" u góry.</p>
            </div>
          )}

          {activeTab === "warps" && (
            <div className="two-col">
              <div className="card">
                <h2>Warpy ({warps.length})</h2>
                <div className="card-grid">
                  {warps.map((w, index) => (
                    <div key={w.name} className="card">
                      <div className="card-title">{w.name}</div>
                      <div className="muted small">
                        {w.world} ({w.x}, {w.y}, {w.z})
                      </div>
                      <div className="row">
                        <button
                          onClick={() => {
                            setEditingWarp(w);
                            setEditingWarpIndex(index);
                          }}
                        >
                          Edytuj
                        </button>
                        <button onClick={() => removeWarp(index)}>Usuń</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card form">
                <h2>{editingWarpIndex != null ? "Edytuj warp" : "Nowy warp"}</h2>
                <label>
                  Nazwa
                  <input value={editingWarp.name} onChange={(e) => setEditingWarp({ ...editingWarp, name: e.target.value })} />
                </label>
                <div className="row">
                  <label>
                    Świat
                    <input value={editingWarp.world} onChange={(e) => setEditingWarp({ ...editingWarp, world: e.target.value })} />
                  </label>
                  <label>
                    X
                    <input
                      type="number"
                      value={editingWarp.x}
                      onChange={(e) => setEditingWarp({ ...editingWarp, x: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      value={editingWarp.y}
                      onChange={(e) => setEditingWarp({ ...editingWarp, y: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Z
                    <input
                      type="number"
                      value={editingWarp.z}
                      onChange={(e) => setEditingWarp({ ...editingWarp, z: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Yaw
                    <input
                      type="number"
                      value={editingWarp.yaw}
                      onChange={(e) => setEditingWarp({ ...editingWarp, yaw: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Pitch
                    <input
                      type="number"
                      value={editingWarp.pitch}
                      onChange={(e) => setEditingWarp({ ...editingWarp, pitch: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="row">
                  <button onClick={upsertWarp}>Zapisz warp (lokalnie — pamiętaj o "Wyślij na serwer")</button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingWarp(EMPTY_WARP);
                      setEditingWarpIndex(null);
                    }}
                  >
                    Wyczyść formularz
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "areas" && (
            <div className="two-col">
              <div className="card">
                <h2>Obszary ({areas.length})</h2>
                <div className="card-grid">
                  {areas.map((a, index) => (
                    <div key={a.name} className="card">
                      <div className="card-title">{a.name}</div>
                      <div className="muted small">
                        {a.world}: ({a.x1}, {a.y1}, {a.z1}) → ({a.x2}, {a.y2}, {a.z2})
                      </div>
                      <div className="row">
                        <button
                          onClick={() => {
                            setEditingArea(a);
                            setEditingAreaIndex(index);
                          }}
                        >
                          Edytuj
                        </button>
                        <button onClick={() => removeArea(index)}>Usuń</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card form">
                <h2>{editingAreaIndex != null ? "Edytuj obszar" : "Nowy obszar"}</h2>
                <label>
                  Nazwa
                  <input value={editingArea.name} onChange={(e) => setEditingArea({ ...editingArea, name: e.target.value })} />
                </label>
                <label>
                  Świat
                  <input value={editingArea.world} onChange={(e) => setEditingArea({ ...editingArea, world: e.target.value })} />
                </label>
                <div className="row">
                  <label>
                    X1
                    <input
                      type="number"
                      value={editingArea.x1}
                      onChange={(e) => setEditingArea({ ...editingArea, x1: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Y1
                    <input
                      type="number"
                      value={editingArea.y1}
                      onChange={(e) => setEditingArea({ ...editingArea, y1: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Z1
                    <input
                      type="number"
                      value={editingArea.z1}
                      onChange={(e) => setEditingArea({ ...editingArea, z1: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="row">
                  <label>
                    X2
                    <input
                      type="number"
                      value={editingArea.x2}
                      onChange={(e) => setEditingArea({ ...editingArea, x2: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Y2
                    <input
                      type="number"
                      value={editingArea.y2}
                      onChange={(e) => setEditingArea({ ...editingArea, y2: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Z2
                    <input
                      type="number"
                      value={editingArea.z2}
                      onChange={(e) => setEditingArea({ ...editingArea, z2: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={editingArea.mobyPasywne}
                      onChange={(e) => setEditingArea({ ...editingArea, mobyPasywne: e.target.checked })}
                    />
                    Moby pasywne
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={editingArea.mobyAgresywne}
                      onChange={(e) => setEditingArea({ ...editingArea, mobyAgresywne: e.target.checked })}
                    />
                    Moby agresywne
                  </label>
                </div>
                <div className="row">
                  <button onClick={upsertArea}>Zapisz obszar (lokalnie — pamiętaj o "Wyślij na serwer")</button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingArea(EMPTY_AREA);
                      setEditingAreaIndex(null);
                    }}
                  >
                    Wyczyść formularz
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
