import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { COMMON_MATERIALS } from "../lib/minecraftData";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { CrateReward } from "../lib/types";

const LAST_USED_KEY = "crates";

const NAMED_COLORS = [
  "BLACK",
  "DARK_BLUE",
  "DARK_GREEN",
  "DARK_AQUA",
  "DARK_RED",
  "DARK_PURPLE",
  "GOLD",
  "GRAY",
  "DARK_GRAY",
  "BLUE",
  "GREEN",
  "AQUA",
  "RED",
  "LIGHT_PURPLE",
  "YELLOW",
  "WHITE",
];

const TIERS = [
  { key: "1", file: "crate-rewards.yml", label: "Tier 1" },
  { key: "2", file: "crate-rewards-2.yml", label: "Tier 2" },
  { key: "3", file: "crate-rewards-3.yml", label: "Tier 3" },
];

const EMPTY_REWARDS: CrateReward[] = [];

const EMPTY_REWARD: CrateReward = {
  material: "STONE",
  amount: 1,
  weight: 10,
  name: "",
  color: "WHITE",
  broadcast: false,
};

function parseCrateYaml(text: string): CrateReward[] {
  if (!text.trim()) return [];
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const rewards = Array.isArray(raw.rewards) ? raw.rewards : [];
  return rewards.map((r: any) => ({
    material: r.material ?? "STONE",
    amount: Number(r.amount ?? 1),
    weight: Number(r.weight ?? 1),
    name: r.name ?? "",
    color: r.color ?? "WHITE",
    broadcast: Boolean(r.broadcast ?? false),
  }));
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeCrateYaml(rewards: CrateReward[]): string {
  const lines = ["rewards:"];
  for (const r of rewards) {
    lines.push(`  - material: ${r.material}`);
    lines.push(`    amount: ${r.amount}`);
    lines.push(`    weight: ${r.weight}`);
    lines.push(`    name: ${quoteYamlString(r.name)}`);
    lines.push(`    color: ${r.color}`);
    lines.push(`    broadcast: ${r.broadcast}`);
  }
  return lines.join("\n") + "\n";
}

export default function CrateEditorPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [tier, setTier] = useState(TIERS[0].key);
  const [rewards, setRewards] = useState<CrateReward[]>(EMPTY_REWARDS);
  const [serverRewards, setServerRewards] = useState<CrateReward[]>(EMPTY_REWARDS);
  const [editing, setEditing] = useState<CrateReward>(EMPTY_REWARD);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadcrates");
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
  } = useLocalPresets<CrateReward[]>("crates");

  function presetScope(pid: string, tierKey: string): string {
    return `${pid}:${tierKey}`;
  }

  function remotePathFor(pid: string, tierKey: string): string {
    const p = profiles.find((x) => x.id === pid);
    const file = TIERS.find((t) => t.key === tierKey)!.file;
    return p ? `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsCrates/${file}` : "";
  }

  async function load(pid: string, tierKey: string) {
    const path = remotePathFor(pid, tierKey);
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await sftpReadFile(pid, path);
      const parsed = parseCrateYaml(text);
      setRewards(parsed);
      setServerRewards(parsed);
      loadPresets(presetScope(pid, tierKey));
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: tierKey });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    setProfileId(id);
    if (id) load(id, tier);
  }

  function selectTier(key: string) {
    setTier(key);
    if (profileId) load(profileId, key);
  }

  // Serwer aktywny GLOBALNIE (pasek boczny) ma pierwszeństwo - dopiero gdy nic tam
  // jeszcze nie wybrano, sięgamy do starego zapisu specyficznego dla tej strony.
  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) {
      load(profileId, tier);
      return;
    }
    const last = getLastUsed(LAST_USED_KEY);
    if (last && profiles.some((p) => p.id === last.profileId)) {
      setProfileId(last.profileId);
      setTier(last.remotePath || TIERS[0].key);
      load(last.profileId, last.remotePath || TIERS[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  // Edits only touch local state - nothing reaches the server until "Wyślij
  // na serwer" is clicked, and "Cofnij do stanu z serwera" throws away local
  // changes and goes back to serverRewards (set on load and after publish).
  const dirty = rewards !== serverRewards;
  useDirtyTracking(dirty);

  // Writing the file over SFTP does NOT make the running plugin pick it up -
  // it still has the old reward pool cached in memory until told to reload,
  // so publish also sends the RCON reload command right after a successful
  // write. Otherwise "Wyślij na serwer" would silently do nothing visible
  // in-game until someone separately remembered to click "Wyślij RCON".
  async function publish() {
    if (!profileId) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePathFor(profileId, tier), serializeCrateYaml(rewards));
      setServerRewards(rewards);
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
    setRewards(serverRewards);
    setEditing(EMPTY_REWARD);
    setEditingIndex(null);
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
  }

  // Local presets are a separate, opt-in safety net on top of the draft -
  // saving one never touches the server. Scoped per profile+tier since each
  // tier is its own file. Loading one only replaces the local draft; it
  // still has to go through "Wyślij na serwer" to go live - handy if
  // something got overwritten on the server and you want back what you had.
  function saveCurrentPresetAs() {
    if (!profileId) return;
    const name = window.prompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(presetScope(profileId, tier), name, rewards);
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    setRewards(found);
    setStatus(`Wczytano preset „${name}" do edycji — kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function upsertEditing() {
    if (!editing.material.trim()) {
      setStatus("Podaj materiał nagrody.");
      return;
    }
    const next = [...rewards];
    if (editingIndex != null) {
      next[editingIndex] = editing;
    } else {
      next.push(editing);
    }
    setRewards(next);
    setEditing(EMPTY_REWARD);
    setEditingIndex(null);
  }

  function editReward(index: number) {
    setEditing(rewards[index]);
    setEditingIndex(index);
  }

  function removeReward(index: number) {
    const next = rewards.filter((_, i) => i !== index);
    setRewards(next);
    if (editingIndex === index) {
      setEditing(EMPTY_REWARD);
      setEditingIndex(null);
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
      <h1>Skrzynie (crates)</h1>
      <p className="muted">
        Edytuje pulę nagród skrzyń mainplugins-crates (material, amount, weight, name, color, broadcast), osobno
        dla każdego z 3 tierów.
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
        <div className="row subtabs">
          {TIERS.map((t) => (
            <button key={t.key} type="button" className={tier === t.key ? "active" : ""} onClick={() => selectTier(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={publish} disabled={!profileId || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
        <button type="button" onClick={revertToServer} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        {dirty && <span className="muted small">masz niezapisane zmiany</span>}
      </div>

      <ToolbarMore>
        <PresetBar
          presets={presetList}
          selectedName={selectedPresetName}
          onSelectName={setSelectedPresetName}
          onSaveAs={saveCurrentPresetAs}
          onLoad={loadPresetIntoDraft}
          onDelete={(name) => deletePreset(presetScope(profileId, tier), name)}
          disabled={!profileId}
        />
      </ToolbarMore>

      <div className="two-col">
        <div className="card">
          <h2>Nagrody ({rewards.length})</h2>
          <div className="card-grid">
            {rewards.map((r, index) => (
              <div key={index} className="card">
                <div className="card-title">{r.name || r.material}</div>
                <div className="muted small">
                  {r.material} x{r.amount} · waga {r.weight} · {r.color}
                </div>
                <div className="row">
                  <button onClick={() => editReward(index)}>Edytuj</button>
                  <button onClick={() => removeReward(index)}>Usuń</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card form">
          <h2>{editingIndex != null ? "Edytuj nagrodę" : "Nowa nagroda"}</h2>

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
            Nazwa
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>

          <div className="row">
            <label>
              Ilość
              <input
                type="number"
                min={1}
                max={64}
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })}
              />
            </label>
            <label>
              Waga (szansa względna)
              <input
                type="number"
                min={0}
                value={editing.weight}
                onChange={(e) => setEditing({ ...editing, weight: Number(e.target.value) })}
              />
            </label>
            <label>
              Kolor
              <select value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })}>
                {NAMED_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editing.broadcast}
                onChange={(e) => setEditing({ ...editing, broadcast: e.target.checked })}
              />
              Ogłoś na czacie
            </label>
          </div>

          <div className="row">
            <button onClick={upsertEditing} disabled={!profileId}>
              Zapisz nagrodę (lokalnie — pamiętaj o "Wyślij na serwer")
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(EMPTY_REWARD);
                setEditingIndex(null);
              }}
            >
              Wyczyść formularz
            </button>
          </div>

          <div className="row">
            <input
              placeholder="komenda RCON, np. @reloadcrates"
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
