import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MaterialField from "../components/MaterialField";
import MaterialIcon from "../components/MaterialIcon";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { DEFAULT_FISHING_CONFIG } from "../lib/fishingDefaults";
import { parseFishingConfig, serializeFishingConfig } from "../lib/fishingYaml";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { FishFormula, FishingConfig, FishRzadkosc, FishSpecies } from "../lib/types";

const LAST_USED_KEY = "fishing";
const RZADKOSCI: FishRzadkosc[] = ["ZWYKLA", "NIEZWYKLA", "RZADKA", "EPICKA", "LEGENDARNA"];
const EMPTY_SPECIES: FishSpecies = { customId: "", nazwa: "", material: "COD", kolor: "GRAY", rzadkosc: "ZWYKLA", waga: 10 };

function FormulaEditor({ label, value, onChange }: { label: string; value: FishFormula; onChange: (v: FishFormula) => void }) {
  return (
    <div className="row">
      <span className="muted small" style={{ minWidth: "9rem" }}>{label}</span>
      <label>
        bazowa
        <input type="number" step={0.01} value={value.bazowa} onChange={(e) => onChange({ ...value, bazowa: Number(e.target.value) })} style={{ width: "5rem" }} />
      </label>
      <label>
        na-trudność
        <input type="number" step={0.01} value={value.naTrudnosc} onChange={(e) => onChange({ ...value, naTrudnosc: Number(e.target.value) })} style={{ width: "5rem" }} />
      </label>
      <label>
        min
        <input type="number" step={0.01} value={value.min} onChange={(e) => onChange({ ...value, min: Number(e.target.value) })} style={{ width: "5rem" }} />
      </label>
      <label>
        max
        <input type="number" step={0.01} value={value.max} onChange={(e) => onChange({ ...value, max: Number(e.target.value) })} style={{ width: "5rem" }} />
      </label>
    </div>
  );
}

export default function FishingPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [config, setConfig] = useState<FishingConfig | null>(null);
  const [serverConfig, setServerConfig] = useState<FishingConfig | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadfishing");
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
  } = useLocalPresets<FishingConfig>("fishing");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsFishing/fishing-config.yml`;
  }

  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseFishingConfig(text);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeFishingConfig(DEFAULT_FISHING_CONFIG));
        setConfig(DEFAULT_FISHING_CONFIG);
        setServerConfig(DEFAULT_FISHING_CONFIG);
        setStatus("fishing-config.yml nie istniało - wgrano domyślną wersję. Serwer użyje jej po /@reloadfishing albo restarcie.");
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

  function updateSpecies(index: number, patch: Partial<FishSpecies>) {
    if (!config) return;
    const next = [...config.gatunki];
    next[index] = { ...next[index], ...patch };
    setConfig({ ...config, gatunki: next });
  }
  function removeSpecies(index: number) {
    if (!config) return;
    setConfig({ ...config, gatunki: config.gatunki.filter((_, i) => i !== index) });
  }
  function addSpecies() {
    if (!config) return;
    setConfig({ ...config, gatunki: [...config.gatunki, { ...EMPTY_SPECIES }] });
  }
  function updateMinigra(patch: Partial<FishingConfig["minigra"]>) {
    if (!config) return;
    setConfig({ ...config, minigra: { ...config.minigra, ...patch } });
  }

  async function publish() {
    if (!profileId || !remotePath || !config) return;
    if (config.gatunki.some((g) => !g.customId.trim())) {
      setStatus("Każdy gatunek musi mieć niepuste ID.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeFishingConfig(config));
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
      <h1>Łowienie</h1>
      <p className="muted small">
        ID każdego gatunku musi się zgadzać z custom-id w Kreatorze sklepu (kategoria "ryby_wedkarskie") oraz w
        wymogach questów kategorii "Rybak" - zmiana/usunięcie istniejącego ID zepsuje tę zgodność.
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
        <>
          <h2>Gatunki ryb ({config.gatunki.length})</h2>
          <div className="card-grid">
            {config.gatunki.map((g, i) => (
              <div key={i} className="card">
                <div className="row" style={{ alignItems: "center" }}>
                  <MaterialIcon material={g.material} iconPackDir={iconPackDir} />
                  <span className="card-title">#{i}</span>
                </div>
                <label>
                  ID
                  <input value={g.customId} onChange={(e) => updateSpecies(i, { customId: e.target.value.toUpperCase() })} />
                </label>
                <label>
                  Nazwa
                  <input value={g.nazwa} onChange={(e) => updateSpecies(i, { nazwa: e.target.value })} />
                </label>
                <label>
                  Materiał
                  <MaterialField datalistId="materials" iconPackDir={iconPackDir} value={g.material} onChange={(v) => updateSpecies(i, { material: v })} />
                </label>
                <label>
                  Kolor (NamedTextColor)
                  <input value={g.kolor} onChange={(e) => updateSpecies(i, { kolor: e.target.value.toUpperCase() })} />
                </label>
                <label>
                  Rzadkość
                  <select value={g.rzadkosc} onChange={(e) => updateSpecies(i, { rzadkosc: e.target.value as FishRzadkosc })}>
                    {RZADKOSCI.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Waga (do losowania)
                  <input type="number" min={1} value={g.waga} onChange={(e) => updateSpecies(i, { waga: Number(e.target.value) })} />
                </label>
                <button type="button" onClick={() => removeSpecies(i)}>
                  Usuń gatunek
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addSpecies}>
            + Dodaj gatunek
          </button>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h2>Minigra "pasek"</h2>
            <p className="muted small">
              Trudność = rzadkość gatunku (ZWYKLA=0 .. LEGENDARNA=4). Każdy parametr = clamp(bazowa + na-trudność ×
              trudność, min, max).
            </p>
            <div className="row">
              <label>
                Szerokość paska (znaki)
                <input type="number" value={config.minigra.szerokoscPaska} onChange={(e) => updateMinigra({ szerokoscPaska: Number(e.target.value) })} />
              </label>
              <label>
                Grawitacja
                <input type="number" step={0.01} value={config.minigra.grawitacja} onChange={(e) => updateMinigra({ grawitacja: Number(e.target.value) })} />
              </label>
              <label>
                Impuls kliknięcia
                <input type="number" step={0.01} value={config.minigra.impulsKlikniecia} onChange={(e) => updateMinigra({ impulsKlikniecia: Number(e.target.value) })} />
              </label>
              <label>
                Okres ticków
                <input type="number" min={1} value={config.minigra.okresTickow} onChange={(e) => updateMinigra({ okresTickow: Number(e.target.value) })} />
              </label>
              <label>
                Maks. czas (sek.)
                <input type="number" min={1} value={config.minigra.maksymalnyCzasSekund} onChange={(e) => updateMinigra({ maksymalnyCzasSekund: Number(e.target.value) })} />
              </label>
            </div>

            <FormulaEditor label="Połowa szer. suwaka" value={config.minigra.polowaSzerokosciSuwaka} onChange={(v) => updateMinigra({ polowaSzerokosciSuwaka: v })} />
            <FormulaEditor label="Prędkość ryby" value={config.minigra.predkoscRyby} onChange={(v) => updateMinigra({ predkoscRyby: v })} />
            <FormulaEditor label="Tempo napełniania" value={config.minigra.tempoNapelniania} onChange={(v) => updateMinigra({ tempoNapelniania: v })} />
            <FormulaEditor label="Tempo opróżniania" value={config.minigra.tempoOprozniania} onChange={(v) => updateMinigra({ tempoOprozniania: v })} />
          </div>

          <div className="card">
            <h2>Bonusowa skrzynka</h2>
            <label>
              Szansa (%) na dodatkową skrzynkę po udanym połowie
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={config.bonusowaSkrzynkaSzansaProcent}
                onChange={(e) => setConfig({ ...config, bonusowaSkrzynkaSzansaProcent: Number(e.target.value) })}
              />
            </label>
          </div>
        </>
      )}

      {!config && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadfishing" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
