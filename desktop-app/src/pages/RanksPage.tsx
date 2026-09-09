import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { DEFAULT_RANKS_CONFIG } from "../lib/ranksDefaults";
import { parseRanksConfig, serializeRanksConfig } from "../lib/ranksYaml";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { RankId, RanksConfig } from "../lib/types";

const LAST_USED_KEY = "ranks";
const RANK_IDS: RankId[] = ["GRACZ", "VIP", "ADMIN"];
const RANK_LABELS: Record<RankId, string> = { GRACZ: "Gracz", VIP: "VIP", ADMIN: "Admin" };

// NamedTextColor values - same list IslandsPage uses for button title color.
const KOLORY = [
  "WHITE", "GRAY", "DARK_GRAY", "BLACK", "RED", "DARK_RED", "GOLD", "YELLOW",
  "GREEN", "DARK_GREEN", "AQUA", "DARK_AQUA", "BLUE", "DARK_BLUE", "LIGHT_PURPLE", "DARK_PURPLE",
];

export default function RanksPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [config, setConfig] = useState<RanksConfig | null>(null);
  const [serverConfig, setServerConfig] = useState<RanksConfig | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadrangi");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  const [playerNick, setPlayerNick] = useState("");
  const [playerRank, setPlayerRank] = useState<RankId>("VIP");

  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<RanksConfig>("ranks");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsRanks/ranks-config.yml`;
  }

  // If mainplugins-ranks hasn't run on this server yet, ranks-config.yml doesn't
  // exist - bootstrap it with the plugin's real bundled default over SFTP (same idea as
  // MenuGuiPage/ChatFilterPage) instead of requiring someone to start the plugin first.
  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseRanksConfig(text);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeRanksConfig(DEFAULT_RANKS_CONFIG));
        setConfig(DEFAULT_RANKS_CONFIG);
        setServerConfig(DEFAULT_RANKS_CONFIG);
        setStatus("ranks-config.yml nie istniało — wgrano domyślną wersję. Serwer użyje jej po /@reloadrangi albo restarcie.");
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

  // Edits only touch local state - nothing reaches the server until "Wyślij na
  // serwer" is clicked, and "Cofnij do stanu z serwera" throws away local changes and
  // goes back to serverConfig (set on load and after a successful publish).
  const dirty = config !== serverConfig;
  useDirtyTracking(dirty);

  function updateRank(id: RankId, patch: Partial<RanksConfig["wygladu"][RankId]>) {
    if (!config) return;
    setConfig({ ...config, wygladu: { ...config.wygladu, [id]: { ...config.wygladu[id], ...patch } } });
  }

  // Writing the file over SFTP does NOT make the running plugin pick it up - it still
  // has the old prefixes/colors cached in memory until told to reload, so publish also
  // sends the RCON reload command right after a successful write.
  async function publish() {
    if (!profileId || !remotePath || !config) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeRanksConfig(config));
      setServerConfig(config);
      let statusMsg = "Wysłano wygląd rang na serwer.";
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
    setConfig(serverConfig);
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
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
    setStatus(`Wczytano preset „${name}" do edycji — kliknij "Wyślij na serwer", żeby go opublikować.`);
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

  // /@setranga i /@ranga już istnieją po stronie serwera (RankCommands.java) - to tylko
  // wygodny skrót RCON, nie osobny system. Przypisania graczy do rang (ranks.yml) są
  // stanem per-gracz, nie configiem tej strony - stąd zwykłe RCON zamiast edytora pliku.
  async function ustawRange() {
    if (!profileId || !playerNick.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, `@setranga ${playerNick.trim()} ${playerRank.toLowerCase()}`);
      setStatus(`RCON: ${result || "OK"}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sprawdzRange() {
    if (!profileId || !playerNick.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, `@ranga ${playerNick.trim()}`);
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
      <h1>Rangi</h1>

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

      <p className="muted small">
        Sam zestaw rang (Gracz/VIP/Admin - Admin to realny op serwera) jest na stałe wbudowany w cały ekosystem
        pluginów - tutaj edytujesz tylko ich wygląd na czacie i w tabliście.
      </p>

      {config && (
        <div className="two-col">
          {RANK_IDS.map((id) => (
            <div key={id} className="card">
              <h2>{RANK_LABELS[id]}</h2>
              <label>
                Prefiks (przed nickiem)
                <MinecraftTextInput value={config.wygladu[id].prefix} onChange={(v) => updateRank(id, { prefix: v })} placeholder="&6&l[VIP] " />
              </label>
              <label>
                Kolor nicku
                <select value={config.wygladu[id].kolorNicku} onChange={(e) => updateRank(id, { kolorNicku: e.target.value })}>
                  {KOLORY.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      )}

      {!config && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="card">
        <h2>Zarządzanie graczem</h2>
        <p className="muted small">Skrót do istniejących komend serwera (/@setranga, /@ranga) przez RCON - przypisania graczy nie są plikiem do edycji.</p>
        <div className="row">
          <input placeholder="nick gracza" value={playerNick} onChange={(e) => setPlayerNick(e.target.value)} />
          <select value={playerRank} onChange={(e) => setPlayerRank(e.target.value as RankId)}>
            {RANK_IDS.map((id) => (
              <option key={id} value={id}>
                {RANK_LABELS[id]}
              </option>
            ))}
          </select>
          <button type="button" onClick={ustawRange} disabled={busy || !profileId || !playerNick.trim()}>
            Ustaw rangę
          </button>
          <button type="button" onClick={sprawdzRange} disabled={busy || !profileId || !playerNick.trim()}>
            Sprawdź rangę
          </button>
        </div>
      </div>

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadrangi" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
