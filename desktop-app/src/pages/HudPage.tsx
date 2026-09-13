import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { DEFAULT_HUD_CONFIG } from "../lib/hudDefaults";
import { parseHudConfig, serializeHudConfig } from "../lib/hudYaml";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { HudConfig } from "../lib/types";

const LAST_USED_KEY = "hud";

export default function HudPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [config, setConfig] = useState<HudConfig | null>(null);
  const [serverConfig, setServerConfig] = useState<HudConfig | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadhud");
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
  } = useLocalPresets<HudConfig>("hud");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsHUD/hud-config.yml`;
  }

  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseHudConfig(text);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeHudConfig(DEFAULT_HUD_CONFIG));
        setConfig(DEFAULT_HUD_CONFIG);
        setServerConfig(DEFAULT_HUD_CONFIG);
        setStatus("hud-config.yml nie istniało - wgrano domyślną wersję. Serwer użyje jej po /@reloadhud albo restarcie.");
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

  function updateSettings(patch: Partial<Pick<HudConfig, "maxTop" | "sekundNaSlajd" | "coKtorySlajdRynkowy" | "szerokoscProTipu" | "szerokoscPadGracza">>) {
    if (!config) return;
    setConfig({ ...config, ...patch });
  }

  function updateTip(index: number, value: string) {
    if (!config) return;
    const next = [...config.proTipy];
    next[index] = value;
    setConfig({ ...config, proTipy: next });
  }
  function removeTip(index: number) {
    if (!config) return;
    setConfig({ ...config, proTipy: config.proTipy.filter((_, i) => i !== index) });
  }
  function addTip() {
    if (!config) return;
    setConfig({ ...config, proTipy: [...config.proTipy, ""] });
  }

  function updateFakeGracz(index: number, patch: Partial<HudConfig["fakeTopGraczy"][number]>) {
    if (!config) return;
    const next = [...config.fakeTopGraczy];
    next[index] = { ...next[index], ...patch };
    setConfig({ ...config, fakeTopGraczy: next });
  }
  function removeFakeGracz(index: number) {
    if (!config) return;
    setConfig({ ...config, fakeTopGraczy: config.fakeTopGraczy.filter((_, i) => i !== index) });
  }
  function addFakeGracz() {
    if (!config) return;
    setConfig({ ...config, fakeTopGraczy: [...config.fakeTopGraczy, { nick: "", kasa: 0 }] });
  }

  function updateFakeWyspa(index: number, patch: Partial<HudConfig["fakeTopWysp"][number]>) {
    if (!config) return;
    const next = [...config.fakeTopWysp];
    next[index] = { ...next[index], ...patch };
    setConfig({ ...config, fakeTopWysp: next });
  }
  function removeFakeWyspa(index: number) {
    if (!config) return;
    setConfig({ ...config, fakeTopWysp: config.fakeTopWysp.filter((_, i) => i !== index) });
  }
  function addFakeWyspa() {
    if (!config) return;
    setConfig({ ...config, fakeTopWysp: [...config.fakeTopWysp, { nick: "", rozmiar: 0, czlonkowie: 0 }] });
  }

  async function publish() {
    if (!profileId || !remotePath || !config) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeHudConfig(config));
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

  function saveCurrentPresetAs() {
    if (!config || !profileId) return;
    const name = window.prompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
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
      <h1>HUD i placeholdery</h1>
      <p className="muted small">
        Wymaga PlaceholderAPI (i pluginu TAB do wyświetlenia) - bez tego %mainplugins_...% nie działają, ale
        konfigurację i tak można edytować/wysłać.
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
        <>
          <div className="card">
            <h2>Ustawienia rotacji stopki</h2>
            <div className="row">
              <label>
                Sekund na slajd
                <input type="number" min={1} value={config.sekundNaSlajd} onChange={(e) => updateSettings({ sekundNaSlajd: Number(e.target.value) })} />
              </label>
              <label>
                Co który slajd rynkowy
                <input type="number" min={1} value={config.coKtorySlajdRynkowy} onChange={(e) => updateSettings({ coKtorySlajdRynkowy: Number(e.target.value) })} />
              </label>
              <label>
                Szerokość pro tipu (znaki)
                <input type="number" min={1} value={config.szerokoscProTipu} onChange={(e) => updateSettings({ szerokoscProTipu: Number(e.target.value) })} />
              </label>
              <label>
                Szerokość pad gracza (znaki)
                <input type="number" min={1} value={config.szerokoscPadGracza} onChange={(e) => updateSettings({ szerokoscPadGracza: Number(e.target.value) })} />
              </label>
              <label>
                Max pozycji w topkach
                <input type="number" min={1} value={config.maxTop} onChange={(e) => updateSettings({ maxTop: Number(e.target.value) })} />
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Pro tipy ({config.proTipy.length})</h2>
            {config.proTipy.map((tip, i) => (
              <div key={i} className="mc-message-row">
                <MinecraftTextInput value={tip} onChange={(v) => updateTip(i, v)} placeholder="&7Wpisz &f/menu" />
                <button type="button" onClick={() => removeTip(i)}>
                  Usuń
                </button>
              </div>
            ))}
            <button type="button" onClick={addTip}>
              + Dodaj pro tip
            </button>
          </div>

          <div className="card">
            <h2>Fałszywy top graczy ({config.fakeTopGraczy.length})</h2>
            <p className="muted small">Pokazywane tylko dopóki nie ma prawdziwych graczy z kasą &gt; 0.</p>
            {config.fakeTopGraczy.map((g, i) => (
              <div key={i} className="row">
                <input placeholder="nick" value={g.nick} onChange={(e) => updateFakeGracz(i, { nick: e.target.value })} />
                <input type="number" placeholder="kasa" value={g.kasa} onChange={(e) => updateFakeGracz(i, { kasa: Number(e.target.value) })} />
                <button type="button" onClick={() => removeFakeGracz(i)}>
                  Usuń
                </button>
              </div>
            ))}
            <button type="button" onClick={addFakeGracz}>
              + Dodaj wpis
            </button>
          </div>

          <div className="card">
            <h2>Fałszywy top wysp ({config.fakeTopWysp.length})</h2>
            <p className="muted small">Pokazywane tylko dopóki nie ma prawdziwych wysp.</p>
            {config.fakeTopWysp.map((w, i) => (
              <div key={i} className="row">
                <input placeholder="nick" value={w.nick} onChange={(e) => updateFakeWyspa(i, { nick: e.target.value })} />
                <input type="number" placeholder="rozmiar" value={w.rozmiar} onChange={(e) => updateFakeWyspa(i, { rozmiar: Number(e.target.value) })} />
                <input type="number" placeholder="członkowie" value={w.czlonkowie} onChange={(e) => updateFakeWyspa(i, { czlonkowie: Number(e.target.value) })} />
                <button type="button" onClick={() => removeFakeWyspa(i)}>
                  Usuń
                </button>
              </div>
            ))}
            <button type="button" onClick={addFakeWyspa}>
              + Dodaj wpis
            </button>
          </div>
        </>
      )}

      {!config && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadhud" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
