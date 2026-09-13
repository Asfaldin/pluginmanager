import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import LocalExportButton from "../components/LocalExportButton";
import MaterialField from "../components/MaterialField";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { DEFAULT_SPAWNER_CONFIG } from "../lib/spawnersDefaults";
import { parseSpawnerConfig, serializeSpawnerConfig } from "../lib/spawnersYaml";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { SpawnerConfig, SpawnerTypeDef } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "spawners";
const EMPTY_TYPE: SpawnerTypeDef = { id: "", encja: "COW", nazwaOdmieniona: "", nazwaPojedyncza: "" };

export default function SpawnersPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  // Startuje z prawdziwego domyślnego configu pluginu (nie null) - da się budować typy
  // spawnerów od zera bez wybierania serwera; serverConfig startuje jako ta sama
  // referencja, więc "dirty" jest fałszywe dopóki ktoś faktycznie coś zmieni albo wczyta
  // realny stan z serwera (patrz loadAll niżej).
  const [config, setConfig] = useState<SpawnerConfig>(DEFAULT_SPAWNER_CONFIG);
  const [serverConfig, setServerConfig] = useState<SpawnerConfig>(DEFAULT_SPAWNER_CONFIG);
  const [reloadCommand, setReloadCommand] = useState("@reloadspawnery");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  const { iconPackDir, allMaterials } = useIconPack(setStatus);
  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<SpawnerConfig>("spawners");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsSpawners/spawnery-typy.yml`;
  }

  // If mainplugins-spawners hasn't run on this server yet, spawnery-typy.yml doesn't
  // exist - bootstrap it with the plugin's real bundled default over SFTP (same idea as
  // the other pages this round) instead of requiring someone to start the plugin first.
  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseSpawnerConfig(text);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeSpawnerConfig(DEFAULT_SPAWNER_CONFIG));
        setConfig(DEFAULT_SPAWNER_CONFIG);
        setServerConfig(DEFAULT_SPAWNER_CONFIG);
        setStatus("spawnery-typy.yml nie istniało — wgrano domyślną wersję. Serwer użyje jej po /@reloadspawnery albo restarcie.");
      }
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    // Config startuje edytowalny od zera bez serwera (patrz useState wyżej) - jeśli user
    // już coś tak zbudował/zmienił, zwykłe przełączenie serwera po cichu by to nadpisało
    // wczytaną stamtąd konfiguracją. Ostrzegamy, zamiast ubić czyjąś robotę bez pytania.
    if (dirty && !window.confirm("Masz niezapisane zmiany w edytorze. Wybranie serwera wczyta stamtąd konfigurację i nadpisze je. Kontynuować?")) {
      return;
    }
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = pathFor(p.remote_plugins_path);
    setRemotePath(path);
    loadPresets(id);
    loadAll(id, path);
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

  function updateType(index: number, patch: Partial<SpawnerTypeDef>) {
    const next = [...config.typy];
    next[index] = { ...next[index], ...patch };
    setConfig({ ...config, typy: next });
  }

  function removeType(index: number) {
    setConfig({ ...config, typy: config.typy.filter((_, i) => i !== index) });
  }

  function addType() {
    setConfig({ ...config, typy: [...config.typy, { ...EMPTY_TYPE }] });
  }

  function updateSettings(patch: Partial<SpawnerConfig["ustawienia"]>) {
    setConfig({ ...config, ustawienia: { ...config.ustawienia, ...patch } });
  }

  // Writing the file over SFTP does NOT make the running plugin pick it up - it still
  // has the old types/settings cached in memory until told to reload, so publish also
  // sends the RCON reload command right after a successful write.
  async function publish() {
    if (!profileId || !remotePath) return;
    if (config.typy.some((t) => !t.id.trim())) {
      setStatus("Każdy typ musi mieć niepuste ID.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeSpawnerConfig(config));
      setServerConfig(config);
      let statusMsg = "Wysłano konfigurację na serwer.";
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

  async function saveCurrentPresetAs() {
    if (!profileId) return;
    const name = await showPrompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
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

  function interwalDlaPoziomu(u: SpawnerConfig["ustawienia"], poziom: number): number {
    return Math.max(1, u.interwalSekundBazowy + u.interwalSekundNaPoziom * poziom);
  }

  function iloscDlaPoziomu(u: SpawnerConfig["ustawienia"], poziom: number): number {
    return Math.max(0, u.iloscNaCyklBazowa + u.iloscNaCyklNaPoziom * poziom);
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Customowe spawnery</h1>
      <p className="muted small">
        Możesz budować typy i ustawienia od zera bez wybierania serwera - jest on potrzebny dopiero, żeby wysłać gotową konfigurację albo pobrać istniejącą.
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

      <div className="row">
        <LocalExportButton
          pluginId="spawners"
          pluginFolderName="MainpluginsSpawners"
          configFilename="spawnery-typy.yml"
          getConfigText={() => serializeSpawnerConfig(config)}
          profileId={profileId || undefined}
        />
        <span className="muted small">jar wbudowany w appkę - działa bez budowania czegokolwiek</span>
      </div>

      <datalist id="materials">
        {allMaterials.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

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
        ID każdego typu jest zapisywane na już postawionych spawnerach graczy i musi się zgadzać z custom-id w
        Kreatorze sklepu (kategoria "spawnery") oraz z id w konfiguracji Wysp — zmiana/usunięcie istniejącego ID
        zepsuje zapisany stan graczy, którzy już go mają.
      </p>

      <div className="card-grid">
            {config.typy.map((t, i) => (
              <div key={i} className="card">
                <label>
                  ID
                  <input value={t.id} onChange={(e) => updateType(i, { id: e.target.value.toUpperCase() })} />
                </label>
                <label>
                  Encja (EntityType)
                  <input value={t.encja} onChange={(e) => updateType(i, { encja: e.target.value.toUpperCase() })} placeholder="np. COW" />
                </label>
                <label>
                  Nazwa odmieniona (np. "Piglinów")
                  <input value={t.nazwaOdmieniona} onChange={(e) => updateType(i, { nazwaOdmieniona: e.target.value })} />
                </label>
                <label>
                  Nazwa pojedyncza (np. "Piglin")
                  <input value={t.nazwaPojedyncza} onChange={(e) => updateType(i, { nazwaPojedyncza: e.target.value })} />
                </label>
                <button type="button" onClick={() => removeType(i)}>
                  Usuń typ
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addType}>
            + Dodaj typ
          </button>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h2>Ustawienia gospodarcze</h2>
            <div className="row">
              <label>
                Limit spawnerów na wyspę
                <input type="number" min={0} value={config.ustawienia.limitSpawnerowNaWyspe} onChange={(e) => updateSettings({ limitSpawnerowNaWyspe: Number(e.target.value) })} />
              </label>
              <label>
                Promień aktywności gracza (bloki)
                <input type="number" min={0} value={config.ustawienia.promienAktywnosciGracza} onChange={(e) => updateSettings({ promienAktywnosciGracza: Number(e.target.value) })} />
              </label>
              <label>
                Limit kolejki (stos)
                <input type="number" min={0} value={config.ustawienia.limitKolejki} onChange={(e) => updateSettings({ limitKolejki: Number(e.target.value) })} />
              </label>
              <label>
                Maksymalny poziom
                <input type="number" min={1} value={config.ustawienia.maxPoziom} onChange={(e) => updateSettings({ maxPoziom: Number(e.target.value) })} />
              </label>
            </div>
            <label>
              Narzędzie do zbierania spawnera
              <MaterialField
                datalistId="materials"
                iconPackDir={iconPackDir}
                value={config.ustawienia.narzedzieZbierania}
                onChange={(v) => updateSettings({ narzedzieZbierania: v })}
              />
            </label>

            <p className="card-title" style={{ marginTop: "0.75rem" }}>
              Interwał spawnu (sekundy) = bazowy + na-poziom × poziom
            </p>
            <div className="row">
              <label>
                Bazowy
                <input type="number" value={config.ustawienia.interwalSekundBazowy} onChange={(e) => updateSettings({ interwalSekundBazowy: Number(e.target.value) })} />
              </label>
              <label>
                Na poziom
                <input type="number" value={config.ustawienia.interwalSekundNaPoziom} onChange={(e) => updateSettings({ interwalSekundNaPoziom: Number(e.target.value) })} />
              </label>
            </div>

            <p className="card-title" style={{ marginTop: "0.75rem" }}>
              Ilość na cykl = bazowa + na-poziom × poziom
            </p>
            <div className="row">
              <label>
                Bazowa
                <input type="number" value={config.ustawienia.iloscNaCyklBazowa} onChange={(e) => updateSettings({ iloscNaCyklBazowa: Number(e.target.value) })} />
              </label>
              <label>
                Na poziom
                <input type="number" value={config.ustawienia.iloscNaCyklNaPoziom} onChange={(e) => updateSettings({ iloscNaCyklNaPoziom: Number(e.target.value) })} />
              </label>
            </div>

            <p className="muted small" style={{ marginTop: "0.5rem" }}>
              Podgląd przy obecnych współczynnikach:{" "}
              {Array.from({ length: config.ustawienia.maxPoziom }, (_, i) => i + 1)
                .map((poziom) => `poz.${poziom}: ${interwalDlaPoziomu(config.ustawienia, poziom)}s/${iloscDlaPoziomu(config.ustawienia, poziom)}szt`)
                .join(", ")}
            </p>
      </div>

      {busy && <p className="muted small">Wczytywanie/zapisywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadspawnery" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
