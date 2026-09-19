import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { StatusBar } from "../components/EditorBits";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { DEFAULT_FARMING_CONFIG } from "../lib/farmingDefaults";
import { parseFarmingConfig, serializeFarmingConfig } from "../lib/farmingYaml";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { FarmingConfig } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "farming";

export default function FarmingPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [config, setConfig] = useState<FarmingConfig | null>(null);
  const [serverConfig, setServerConfig] = useState<FarmingConfig | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadfarming");
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
  } = useLocalPresets<FarmingConfig>("farming");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsFarming/farming-config.yml`;
  }

  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseFarmingConfig(text);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeFarmingConfig(DEFAULT_FARMING_CONFIG));
        setConfig(DEFAULT_FARMING_CONFIG);
        setServerConfig(DEFAULT_FARMING_CONFIG);
        setStatus("farming-config.yml nie istniało - wgrano domyślną wersję. Serwer użyje jej po /@reloadfarming albo restarcie.");
      }
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = pathFor(p.remote_plugins_path);
    setRemotePath(path);
    loadPresets(id);
    loadAll(id, path);
  }

  // Serwer aktywny GLOBALNIE (pasek boczny) ma pierwszeństwo - dopiero gdy nic tam
  // jeszcze nie wybrano, sięgamy do starego zapisu specyficznego dla tej strony albo,
  // przy dokładnie jednym profilu, wybieramy go automatycznie.
  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) {
      selectProfile(profileId);
      return;
    }
    const last = getLastUsed(LAST_USED_KEY);
    const fallback = profiles.length === 1 ? profiles[0] : undefined;
    const pid = last && profiles.some((p) => p.id === last.profileId) ? last.profileId : fallback?.id;
    if (!pid) return;
    selectProfile(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  const dirty = config !== serverConfig;
  useDirtyTracking(dirty);

  async function publish() {
    if (!profileId || !remotePath || !config) return;
    if (config.zlotaMarchewkaIloscMax < config.zlotaMarchewkaIloscMin) {
      setStatus("Ilość maksymalna nie może być mniejsza niż minimalna.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeFarmingConfig(config));
      setServerConfig(config);
      let statusMsg = "Wysłano konfigurację na serwer.";
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
    setConfig(serverConfig);
    setStatus("Przywrócono stan z serwera - lokalne zmiany odrzucone.");
  }

  async function saveCurrentPresetAs() {
    if (!config || !profileId) return;
    const name = await showPrompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(profileId, name, config);
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    setConfig(found);
    setStatus(`Wczytano preset „${name}" do edycji - kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function refetchFromServer() {
    if (!profileId || !remotePath) return;
    loadAll(profileId, remotePath);
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
      <h1>Uprawy specjalne</h1>

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
        <PresetBar
          presets={presetList}
          selectedName={selectedPresetName}
          onSelectName={setSelectedPresetName}
          onSaveAs={saveCurrentPresetAs}
          onLoad={loadPresetIntoDraft}
          onDelete={(name) => deletePreset(profileId, name)}
          disabled={!profileId}
        />
        <div className="row">
          <button type="button" onClick={refetchFromServer} disabled={busy || !profileId}>
            <RefreshCw size={14} strokeWidth={1.75} /> Pobierz aktualny z serwera
          </button>
        </div>
      </ToolbarMore>

      {config && (
        <div className="card">
          <h2>Złota marchewka (PPM na farmland sadzi, dojrzała daje bonus)</h2>
          <div className="row">
            <label>
              Ilość minimalna
              <input
                type="number"
                min={0}
                value={config.zlotaMarchewkaIloscMin}
                onChange={(e) => setConfig({ ...config, zlotaMarchewkaIloscMin: Number(e.target.value) })}
              />
            </label>
            <label>
              Ilość maksymalna
              <input
                type="number"
                min={0}
                value={config.zlotaMarchewkaIloscMax}
                onChange={(e) => setConfig({ ...config, zlotaMarchewkaIloscMax: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
      )}

      {!config && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadfarming" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
    </div>
  );
}
