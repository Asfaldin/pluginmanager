import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MaterialField from "../components/MaterialField";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { DEFAULT_DUNGEON_CONFIG } from "../lib/dungeonsDefaults";
import { parseDungeonConfig, serializeDungeonConfig } from "../lib/dungeonsYaml";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { DungeonConfig } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "dungeons";

export default function DungeonsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [config, setConfig] = useState<DungeonConfig | null>(null);
  const [serverConfig, setServerConfig] = useState<DungeonConfig | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloaddungeons");
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
  } = useLocalPresets<DungeonConfig>("dungeons");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsDungeons/dungeons-config.yml`;
  }

  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseDungeonConfig(text);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeDungeonConfig(DEFAULT_DUNGEON_CONFIG));
        setConfig(DEFAULT_DUNGEON_CONFIG);
        setServerConfig(DEFAULT_DUNGEON_CONFIG);
        setStatus("dungeons-config.yml nie istniało — wgrano domyślną wersję. Serwer użyje jej po /@reloaddungeons albo restarcie.");
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

  function updateMiejsce(patch: Partial<DungeonConfig["miejsce"]>) {
    if (!config) return;
    setConfig({ ...config, miejsce: { ...config.miejsce, ...patch } });
  }
  function updatePokoje(patch: Partial<DungeonConfig["pokoje"]>) {
    if (!config) return;
    setConfig({ ...config, pokoje: { ...config.pokoje, ...patch } });
  }
  function updateBoss(patch: Partial<DungeonConfig["boss"]>) {
    if (!config) return;
    setConfig({ ...config, boss: { ...config.boss, ...patch } });
  }

  async function publish() {
    if (!profileId || !remotePath || !config) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeDungeonConfig(config));
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
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
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

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Loch i boss</h1>
      <p className="muted small">
        Proof-of-concept (patrz README/komentarze w kodzie) - platformy generowane proceduralnie, nie schematem.
        Przeładowanie działa tylko na PRZYSZŁE generowanie/spawny — już postawione bloki nie są przebudowywane
        retroaktywnie. Trofeum bossa (custom-id) zostaje na stałe w kodzie, wymagane przez quest "Pierwszy Loch".
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

      {config && (
        <div className="two-col">
          <div className="card">
            <h2>Miejsce i platformy</h2>
            <div className="row">
              <label>
                Bazowy X
                <input type="number" value={config.miejsce.bazowyX} onChange={(e) => updateMiejsce({ bazowyX: Number(e.target.value) })} />
              </label>
              <label>
                Bazowy Y
                <input type="number" value={config.miejsce.bazowyY} onChange={(e) => updateMiejsce({ bazowyY: Number(e.target.value) })} />
              </label>
              <label>
                Bazowy Z
                <input type="number" value={config.miejsce.bazowyZ} onChange={(e) => updateMiejsce({ bazowyZ: Number(e.target.value) })} />
              </label>
            </div>
            <div className="row">
              <label>
                Liczba pokoi
                <input type="number" min={0} value={config.miejsce.liczbaPokoi} onChange={(e) => updateMiejsce({ liczbaPokoi: Number(e.target.value) })} />
              </label>
              <label>
                Odstęp pokoi
                <input type="number" value={config.miejsce.odstepPokoi} onChange={(e) => updateMiejsce({ odstepPokoi: Number(e.target.value) })} />
              </label>
            </div>

            <p className="card-title" style={{ marginTop: "0.5rem" }}>Pokoje z mobami</p>
            <div className="row">
              <label>
                Promień
                <input type="number" value={config.miejsce.promienPokoju} onChange={(e) => updateMiejsce({ promienPokoju: Number(e.target.value) })} />
              </label>
              <label>
                Wysokość ściany
                <input type="number" value={config.miejsce.wysokoscScianyPokoju} onChange={(e) => updateMiejsce({ wysokoscScianyPokoju: Number(e.target.value) })} />
              </label>
            </div>
            <label>
              Materiał podłogi
              <MaterialField datalistId="materials" iconPackDir={iconPackDir} value={config.miejsce.materialPodlogiPokoju} onChange={(v) => updateMiejsce({ materialPodlogiPokoju: v })} />
            </label>
            <label>
              Materiał ściany
              <MaterialField datalistId="materials" iconPackDir={iconPackDir} value={config.miejsce.materialScianyPokoju} onChange={(v) => updateMiejsce({ materialScianyPokoju: v })} />
            </label>

            <p className="card-title" style={{ marginTop: "0.5rem" }}>Arena bossa</p>
            <div className="row">
              <label>
                Promień
                <input type="number" value={config.miejsce.promienArenyBossa} onChange={(e) => updateMiejsce({ promienArenyBossa: Number(e.target.value) })} />
              </label>
              <label>
                Wysokość ściany
                <input type="number" value={config.miejsce.wysokoscScianyAreny} onChange={(e) => updateMiejsce({ wysokoscScianyAreny: Number(e.target.value) })} />
              </label>
            </div>
            <label>
              Materiał podłogi
              <MaterialField datalistId="materials" iconPackDir={iconPackDir} value={config.miejsce.materialPodlogiAreny} onChange={(v) => updateMiejsce({ materialPodlogiAreny: v })} />
            </label>
            <label>
              Materiał ściany
              <MaterialField datalistId="materials" iconPackDir={iconPackDir} value={config.miejsce.materialScianyAreny} onChange={(v) => updateMiejsce({ materialScianyAreny: v })} />
            </label>
          </div>

          <div className="card">
            <h2>Strażnicy pokoi</h2>
            <p className="muted small">Ilość/HP/obrażenia strażnika w pokoju N (licząc od 0) = bazowa + na-pokój × N.</p>
            <label>
              Encja (EntityType)
              <input value={config.pokoje.encja} onChange={(e) => updatePokoje({ encja: e.target.value.toUpperCase() })} />
            </label>
            <div className="row">
              <label>
                Ilość — bazowa
                <input type="number" value={config.pokoje.iloscBazowa} onChange={(e) => updatePokoje({ iloscBazowa: Number(e.target.value) })} />
              </label>
              <label>
                Ilość — na pokój
                <input type="number" value={config.pokoje.iloscNaPokoj} onChange={(e) => updatePokoje({ iloscNaPokoj: Number(e.target.value) })} />
              </label>
            </div>
            <div className="row">
              <label>
                HP — bazowe
                <input type="number" value={config.pokoje.hpBazowe} onChange={(e) => updatePokoje({ hpBazowe: Number(e.target.value) })} />
              </label>
              <label>
                HP — na pokój
                <input type="number" value={config.pokoje.hpNaPokoj} onChange={(e) => updatePokoje({ hpNaPokoj: Number(e.target.value) })} />
              </label>
            </div>
            <div className="row">
              <label>
                Obrażenia — bazowe
                <input type="number" value={config.pokoje.obrazeniaBazowe} onChange={(e) => updatePokoje({ obrazeniaBazowe: Number(e.target.value) })} />
              </label>
              <label>
                Obrażenia — na pokój
                <input type="number" value={config.pokoje.obrazeniaNaPokoj} onChange={(e) => updatePokoje({ obrazeniaNaPokoj: Number(e.target.value) })} />
              </label>
            </div>

            <h2 style={{ marginTop: "1rem" }}>Boss</h2>
            <div className="row">
              <label>
                Encja
                <input value={config.boss.encja} onChange={(e) => updateBoss({ encja: e.target.value.toUpperCase() })} />
              </label>
              <label>
                Encja sług
                <input value={config.boss.encjaSlugi} onChange={(e) => updateBoss({ encjaSlugi: e.target.value.toUpperCase() })} />
              </label>
            </div>
            <div className="row">
              <label>
                Max HP
                <input type="number" value={config.boss.maxHp} onChange={(e) => updateBoss({ maxHp: Number(e.target.value) })} />
              </label>
              <label>
                Obrażenia ataku
                <input type="number" value={config.boss.obrazeniaAtaku} onChange={(e) => updateBoss({ obrazeniaAtaku: Number(e.target.value) })} />
              </label>
              <label>
                Obrażenia pocisku
                <input type="number" value={config.boss.obrazeniaPocisku} onChange={(e) => updateBoss({ obrazeniaPocisku: Number(e.target.value) })} />
              </label>
            </div>
            <div className="row">
              <label>
                Okres umiejętności (sek.)
                <input type="number" min={1} value={config.boss.okresUmiejetnosciSekundy} onChange={(e) => updateBoss({ okresUmiejetnosciSekundy: Number(e.target.value) })} />
              </label>
              <label>
                Nagroda (monety)
                <input type="number" value={config.boss.nagrodaMonety} onChange={(e) => updateBoss({ nagrodaMonety: Number(e.target.value) })} />
              </label>
            </div>
            <p className="card-title" style={{ marginTop: "0.5rem" }}>Progi fazowe (udział HP, 0-1)</p>
            <div className="row">
              <label>
                Przywołanie sług #1
                <input type="number" min={0} max={1} step={0.01} value={config.boss.progPrzywolaniaSlug1} onChange={(e) => updateBoss({ progPrzywolaniaSlug1: Number(e.target.value) })} />
              </label>
              <label>
                Przywołanie sług #2
                <input type="number" min={0} max={1} step={0.01} value={config.boss.progPrzywolaniaSlug2} onChange={(e) => updateBoss({ progPrzywolaniaSlug2: Number(e.target.value) })} />
              </label>
              <label>
                Faza szału
                <input type="number" min={0} max={1} step={0.01} value={config.boss.progSzalu} onChange={(e) => updateBoss({ progSzalu: Number(e.target.value) })} />
              </label>
            </div>
          </div>
        </div>
      )}

      {!config && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloaddungeons" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
