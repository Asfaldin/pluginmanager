import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MaterialField from "../components/MaterialField";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import SlotGrid from "../components/SlotGrid";
import type { SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { DEFAULT_ISLAND_CONFIG, DEFAULT_ISLAND_GUI } from "../lib/islandDefaults";
import { parseIslandConfig, parseIslandGuiContent, serializeIslandConfig, serializeIslandGuiContent } from "../lib/islandsYaml";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { IslandButton, IslandConfig, IslandGuiContent, SpawnerType } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "islands";

type ScreenKey =
  | "panelWyspy"
  | "permisjeWyspy"
  | "ustawieniaWyspy"
  | "topkaWysp"
  | "ulepszeniaWyspy"
  | "ulepszenieSpawnerow"
  | "spawnerPodmenu"
  | "czlonkowieWyspy";

const SCREEN_LABELS: Record<ScreenKey, string> = {
  panelWyspy: "Panel Wyspy",
  permisjeWyspy: "Permisje",
  ustawieniaWyspy: "Ustawienia",
  topkaWysp: "Topka Wysp",
  ulepszeniaWyspy: "Ulepszenia",
  ulepszenieSpawnerow: "Ulepszenie Spawnerów",
  spawnerPodmenu: "Spawner - podmenu",
  czlonkowieWyspy: "Członkowie Wyspy",
};

const KOLORY = [
  "WHITE", "GRAY", "DARK_GRAY", "BLACK", "RED", "DARK_RED", "GOLD", "YELLOW",
  "GREEN", "DARK_GREEN", "AQUA", "DARK_AQUA", "BLUE", "DARK_BLUE", "LIGHT_PURPLE", "DARK_PURPLE",
];

interface IslandPreset {
  guiContent: IslandGuiContent;
  config: IslandConfig;
}

export default function IslandsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [guiPath, setGuiPath] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [guiContent, setGuiContent] = useState<IslandGuiContent | null>(null);
  const [serverGuiContent, setServerGuiContent] = useState<IslandGuiContent | null>(null);
  const [config, setConfig] = useState<IslandConfig | null>(null);
  const [serverConfig, setServerConfig] = useState<IslandConfig | null>(null);
  const [activeTab, setActiveTab] = useState<"gui" | "config">("gui");
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("panelWyspy");
  const [pickedUpSlot, setPickedUpSlot] = useState<number | null>(null);
  const [editingButton, setEditingButton] = useState<{ screen: ScreenKey; akcja: string } | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadwyspy");
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
  } = useLocalPresets<IslandPreset>("islands");

  function pathsFor(base: string) {
    const clean = base.replace(/\/+$/, "");
    return {
      gui: `${clean}/MainpluginsSkyblock/wyspy-gui.yml`,
      config: `${clean}/MainpluginsSkyblock/wyspy-config.yml`,
    };
  }

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const { gui, config: cfgPath } = pathsFor(p.remote_plugins_path);
    setGuiPath(gui);
    setConfigPath(cfgPath);
    setLastUsed(LAST_USED_KEY, { profileId: id, remotePath: gui });
    loadPresets(id);
    loadAll(id, gui, cfgPath);
  }

  // If mainplugins-skyblock hasn't run on this server yet, neither file
  // exists (a real plugin would copy its own bundled defaults to disk on
  // first startup - this just does the same thing from the app instead of
  // requiring someone to start the plugin first, or worse, hand-copy the
  // files over). Bootstrapped content is byte-verified against the plugin's
  // actual resources, so it's the same file the plugin would have written.
  async function loadAll(pid: string, gui: string, cfgPath: string) {
    setBusy(true);
    setStatus(null);
    const notices: string[] = [];
    try {
      try {
        const guiText = await sftpReadFile(pid, gui);
        const parsed = parseIslandGuiContent(guiText);
        setGuiContent(parsed);
        setServerGuiContent(parsed);
      } catch {
        await sftpWriteFile(pid, gui, serializeIslandGuiContent(DEFAULT_ISLAND_GUI));
        setGuiContent(DEFAULT_ISLAND_GUI);
        setServerGuiContent(DEFAULT_ISLAND_GUI);
        notices.push("wyspy-gui.yml nie istniało - wgrano domyślną wersję");
      }
      try {
        const cfgText = await sftpReadFile(pid, cfgPath);
        const parsed = parseIslandConfig(cfgText);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, cfgPath, serializeIslandConfig(DEFAULT_ISLAND_CONFIG));
        setConfig(DEFAULT_ISLAND_CONFIG);
        setServerConfig(DEFAULT_ISLAND_CONFIG);
        notices.push("wyspy-config.yml nie istniało - wgrano domyślną wersję");
      }
      if (notices.length > 0) setStatus(notices.join("; ") + ". Serwer użyje ich po /@reloadwyspy albo restarcie.");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
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

  // Edits only touch local state - nothing reaches the server until "Wyślij
  // na serwer" is clicked, and "Cofnij do stanu z serwera" throws away local
  // changes and goes back to serverGuiContent/serverConfig (set on load and
  // after a successful publish).
  const dirty = guiContent !== serverGuiContent || config !== serverConfig;
  useDirtyTracking(dirty);

  function saveGui(next: IslandGuiContent) {
    setGuiContent(next);
  }

  function saveConfig(next: IslandConfig) {
    setConfig(next);
  }

  // Writing the files over SFTP does NOT make the running plugin pick them
  // up - it still has the old GUI/config cached in memory until told to
  // reload, so publish also sends the RCON reload command right after a
  // successful write. Otherwise "Wyślij na serwer" would silently do nothing
  // visible in-game until someone separately remembered to click "Wyślij RCON".
  async function publish() {
    if (!profileId || !guiPath || !configPath || !guiContent || !config) return;
    setBusy(true);
    setStatus(null);
    try {
      await Promise.all([
        sftpWriteFile(profileId, guiPath, serializeIslandGuiContent(guiContent)),
        sftpWriteFile(profileId, configPath, serializeIslandConfig(config)),
      ]);
      setServerGuiContent(guiContent);
      setServerConfig(config);
      let statusMsg = "Wysłano układ GUI i konfigurację na serwer.";
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
    setGuiContent(serverGuiContent);
    setConfig(serverConfig);
    setEditingButton(null);
    setPickedUpSlot(null);
    setStatus("Przywrócono stan z serwera - lokalne zmiany odrzucone.");
  }

  // Local presets are a separate, opt-in safety net on top of the draft -
  // saving one never touches the server, so you can keep several versions of
  // your work around (or a backup before trying something risky) without any
  // risk to what's currently live. Loading one only replaces the local
  // draft; it still has to go through "Wyślij na serwer" to go live -
  // exactly what you want if something got overwritten on the server and you
  // need back what you had.
  async function saveCurrentPresetAs() {
    if (!guiContent || !config || !profileId) return;
    const name = await showPrompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(profileId, name, { guiContent, config });
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    setGuiContent(found.guiContent);
    setConfig(found.config);
    setStatus(`Wczytano preset „${name}" do edycji - kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function refetchFromServer() {
    if (!profileId || !guiPath || !configPath) return;
    loadAll(profileId, guiPath, configPath);
  }

  function updateScreen(key: ScreenKey, patch: Partial<IslandGuiContent[ScreenKey]>) {
    if (!guiContent) return;
    saveGui({ ...guiContent, [key]: { ...guiContent[key], ...patch } } as IslandGuiContent);
  }

  function updateButton(key: ScreenKey, akcja: string, patch: Partial<IslandButton>) {
    if (!guiContent) return;
    const screen = guiContent[key];
    const next = screen.przyciski.map((b) => (b.akcja === akcja ? { ...b, ...patch } : b));
    updateScreen(key, { przyciski: next });
  }

  // Moving a slot relocates EVERY button currently on it together (variant
  // pairs like USUN_WYSPE/OPUSC_WYSPE must always share one slot - the
  // server picks which one to show at runtime), and swaps places with
  // whatever button(s) were at the target slot.
  function moveOrSwapSlot(key: ScreenKey, fromSlot: number, toSlot: number) {
    if (!guiContent) return;
    const screen = guiContent[key];
    const next = screen.przyciski.map((b) => {
      if (b.slot === fromSlot) return { ...b, slot: toSlot };
      if (b.slot === toSlot) return { ...b, slot: fromSlot };
      return b;
    });
    updateScreen(key, { przyciski: next });
  }

  function pickUpOrMoveSlot(key: ScreenKey, slot: number) {
    if (pickedUpSlot === null) {
      setPickedUpSlot(slot);
      return;
    }
    if (pickedUpSlot === slot) {
      setPickedUpSlot(null);
      return;
    }
    moveOrSwapSlot(key, pickedUpSlot, slot);
    setPickedUpSlot(null);
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

  function screenGridContent(key: ScreenKey): Record<number, SlotContent> {
    if (!guiContent) return {};
    const screen = guiContent[key];
    const out: Record<number, SlotContent> = {};
    for (const b of screen.przyciski) {
      const existing = out[b.slot];
      out[b.slot] = {
        label: existing ? `${existing.label} / ${b.nazwa.replace(/&./g, "")}` : b.nazwa.replace(/&./g, ""),
        kind: "nav",
        material: existing ? existing.material : b.material,
        highlighted: pickedUpSlot === b.slot,
        onClick: pickedUpSlot !== null ? () => pickUpOrMoveSlot(key, b.slot) : () => setEditingButton({ screen: key, akcja: b.akcja }),
        onPickUp: () => pickUpOrMoveSlot(key, b.slot),
      };
    }
    // Once something is picked up, every EMPTY square becomes a valid drop
    // target too - not just other occupied buttons to swap with.
    if (pickedUpSlot !== null) {
      for (let i = 0; i < screen.size; i++) {
        if (out[i]) continue;
        out[i] = { label: "", kind: "filler", onClick: () => pickUpOrMoveSlot(key, i) };
      }
    }
    return out;
  }

  const editing =
    editingButton && guiContent && editingButton.screen === activeScreen
      ? guiContent[activeScreen].przyciski.find((b) => b.akcja === editingButton.akcja) ?? null
      : null;

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Wyspy (Skyblock)</h1>

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

      <div className="row subtabs">
        <button type="button" className={activeTab === "gui" ? "active" : ""} onClick={() => setActiveTab("gui")}>
          Układ GUI
        </button>
        <button type="button" className={activeTab === "config" ? "active" : ""} onClick={() => setActiveTab("config")}>
          Konfiguracja
        </button>
      </div>

      {activeTab === "gui" && guiContent && (
        <>
          <div className="row subtabs">
            {(Object.keys(SCREEN_LABELS) as ScreenKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={activeScreen === key ? "active" : ""}
                onClick={() => {
                  setActiveScreen(key);
                  setPickedUpSlot(null);
                  setEditingButton(null);
                }}
              >
                {SCREEN_LABELS[key]}
              </button>
            ))}
          </div>

          <p className="muted small">
            Kliknij przycisk, żeby go edytować (nazwa/ikona/kolor/opis), ikona przesunięcia w rogu - żeby przenieść na inny slot
            (identyfikator akcji zostaje ten sam, więc obsługa kliknięcia w grze idzie razem z nim). "Akcja" pod
            spodem to na stałe wpisane zachowanie po stronie serwera - jej nie da się zmienić z poziomu apki.
          </p>

          <ToolbarMore>
            <PresetBar
              presets={presetList}
              selectedName={selectedPresetName}
              onSelectName={setSelectedPresetName}
              onSaveAs={saveCurrentPresetAs}
              onLoad={loadPresetIntoDraft}
              onDelete={(name) => deletePreset(profileId, name)}
            />
            <div className="row">
              <button type="button" onClick={refetchFromServer} disabled={busy || !profileId}>
                <RefreshCw size={14} strokeWidth={1.75} /> Pobierz aktualny z serwera
              </button>
            </div>
            <p className="muted small">
              Preset obejmuje CAŁY układ GUI i konfigurację naraz. "Zapisz obecny jako..." tworzy lokalną kopię -
              możesz mieć kilka wersji i przełączać się między nimi. "Wczytaj do edycji" podmienia obecny szkic na
              wybrany preset (dalej trzeba kliknąć główny przycisk "Wyślij na serwer" u góry, żeby go opublikować).
              "Pobierz aktualny z serwera" wczytuje od nowa to, co faktycznie jest teraz na serwerze (przydatne,
              jeśli ktoś zmienił plik poza aplikacją) - odrzuca niewysłane zmiany.
            </p>
          </ToolbarMore>

          <div className="row">
            <label>
              Rozmiar (9-54)
              <input
                type="number"
                min={9}
                max={54}
                step={9}
                value={guiContent[activeScreen].size}
                onChange={(e) => updateScreen(activeScreen, { size: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="two-col two-col-grid-wide">
            <div className="card">
              <h2>{SCREEN_LABELS[activeScreen]}</h2>
              <SlotGrid
                content={screenGridContent(activeScreen)}
                size={guiContent[activeScreen].size}
                iconPackDir={iconPackDir}
              />
            </div>

            <div className="card form">
              {editing ? (
                <>
                  <h2>{editing.nazwa.replace(/&./g, "") || editing.akcja}</h2>
                  <p className="muted small">Akcja: {editing.akcja} (slot {editing.slot})</p>
                  <label>
                    Nazwa
                    <MinecraftTextInput
                      value={editing.nazwa}
                      onChange={(v) => updateButton(activeScreen, editing.akcja, { nazwa: v })}
                      placeholder="&aNazwa przycisku"
                    />
                  </label>
                  <label>
                    Kolor tytułu
                    <select
                      value={editing.kolor ?? ""}
                      onChange={(e) => updateButton(activeScreen, editing.akcja, { kolor: e.target.value || undefined })}
                    >
                      <option value="">(domyślny - YELLOW)</option>
                      {KOLORY.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ikona (materiał)
                    <MaterialField
                      datalistId="materials"
                      iconPackDir={iconPackDir}
                      value={editing.material}
                      onChange={(v) => updateButton(activeScreen, editing.akcja, { material: v })}
                    />
                  </label>
                  <label>
                    Ikona w stanie wyłączonym (opcjonalnie - tylko przełączniki wł/wył)
                    <MaterialField
                      datalistId="materials"
                      iconPackDir={iconPackDir}
                      value={editing.materialWylaczone ?? ""}
                      onChange={(v) => updateButton(activeScreen, editing.akcja, { materialWylaczone: v || undefined })}
                    />
                  </label>
                  <fieldset>
                    <legend>Opis (lore)</legend>
                    {editing.lore.map((line, i) => (
                      <div key={i} className="mc-message-row">
                        <MinecraftTextInput
                          value={line}
                          onChange={(v) => {
                            const next = [...editing.lore];
                            next[i] = v;
                            updateButton(activeScreen, editing.akcja, { lore: next });
                          }}
                          placeholder="&7Linijka opisu"
                        />
                        <button
                          type="button"
                          onClick={() => updateButton(activeScreen, editing.akcja, { lore: editing.lore.filter((_, li) => li !== i) })}
                        >
                          Usuń
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => updateButton(activeScreen, editing.akcja, { lore: [...editing.lore, ""] })}>
                      + Dodaj linijkę
                    </button>
                  </fieldset>
                  <button type="button" onClick={() => setEditingButton(null)}>
                    Zamknij
                  </button>
                </>
              ) : (
                <p className="muted">Kliknij przycisk w siatce, żeby go edytować.</p>
              )}
            </div>
          </div>

          {activeScreen === "topkaWysp" && (
            <p className="muted small">
              Sloty rankingu (kolejność = miejsca 1., 2., 3. ...): {guiContent.topkaWysp.slotyRankingu.join(", ")}
            </p>
          )}
          {activeScreen === "ulepszenieSpawnerow" && (
            <p className="muted small">
              Sloty typów spawnerów (kolejność zgodna z Konfiguracja → Spawnery → Typy):{" "}
              {guiContent.ulepszenieSpawnerow.slotyTypow.join(", ")}
            </p>
          )}
          {activeScreen === "czlonkowieWyspy" && (
            <p className="muted small">
              Slot właściciela: {guiContent.czlonkowieWyspy.slotWlasciciela}, sloty członków:{" "}
              {guiContent.czlonkowieWyspy.pierwszySlotCzlonka}-{guiContent.czlonkowieWyspy.ostatniSlotCzlonka}
            </p>
          )}
        </>
      )}

      {activeTab === "config" && config && (
        <IslandConfigForm config={config} onChange={saveConfig} iconPackDir={iconPackDir} />
      )}

      {!guiContent && !config && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadwyspy" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}

function IslandConfigForm({
  config,
  onChange,
  iconPackDir,
}: {
  config: IslandConfig;
  onChange: (next: IslandConfig) => void;
  iconPackDir?: string;
}) {
  const [newBlockMaterial, setNewBlockMaterial] = useState("");

  function set<K extends keyof IslandConfig>(key: K, patch: Partial<IslandConfig[K]>) {
    onChange({ ...config, [key]: { ...(config[key] as object), ...patch } });
  }

  function updateSpawnerType(index: number, patch: Partial<SpawnerType>) {
    const next = [...config.spawnery.typy];
    next[index] = { ...next[index], ...patch };
    set("spawnery", { typy: next });
  }

  return (
    <div className="two-col">
      <div className="card">
        <h2>Tworzenie wyspy</h2>
        <label>
          Domyślny rozmiar
          <input
            type="number"
            value={config.tworzenieWyspy.domyslnyRozmiar}
            onChange={(e) => set("tworzenieWyspy", { domyslnyRozmiar: Number(e.target.value) })}
          />
        </label>
        <p className="card-title" style={{ marginTop: "0.5rem" }}>
          Cooldown kolejnych prób (od próby → sekundy)
        </p>
        {config.tworzenieWyspy.cooldownProb.map((c, i) => (
          <div key={i} className="row">
            <input
              type="number"
              style={{ width: "5rem" }}
              value={c.odProby}
              onChange={(e) => {
                const next = [...config.tworzenieWyspy.cooldownProb];
                next[i] = { ...next[i], odProby: Number(e.target.value) };
                set("tworzenieWyspy", { cooldownProb: next });
              }}
            />
            <input
              type="number"
              style={{ width: "6rem" }}
              value={c.sekundy}
              onChange={(e) => {
                const next = [...config.tworzenieWyspy.cooldownProb];
                next[i] = { ...next[i], sekundy: Number(e.target.value) };
                set("tworzenieWyspy", { cooldownProb: next });
              }}
            />
            <span className="muted small">sek.</span>
            <button
              type="button"
              onClick={() => set("tworzenieWyspy", { cooldownProb: config.tworzenieWyspy.cooldownProb.filter((_, ci) => ci !== i) })}
            >
              Usuń
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set("tworzenieWyspy", {
              cooldownProb: [...config.tworzenieWyspy.cooldownProb, { odProby: config.tworzenieWyspy.cooldownProb.length + 1, sekundy: 0 }],
            })
          }
        >
          + Dodaj próg
        </button>
      </div>

      <div className="card">
        <h2>Border</h2>
        <label>
          Przyrost promienia za ulepszenie
          <input type="number" value={config.border.przyrostNaUlepszenie} onChange={(e) => set("border", { przyrostNaUlepszenie: Number(e.target.value) })} />
        </label>
        <label>
          Koszt za blok promienia
          <input type="number" value={config.border.kosztZaBlok} onChange={(e) => set("border", { kosztZaBlok: Number(e.target.value) })} />
        </label>
        <label>
          Maksymalny rozmiar
          <input type="number" value={config.border.maxRozmiar} onChange={(e) => set("border", { maxRozmiar: Number(e.target.value) })} />
        </label>
        <label>
          Odstęp siatki wysp
          <input type="number" value={config.border.odstepSiatkiWysp} onChange={(e) => set("border", { odstepSiatkiWysp: Number(e.target.value) })} />
        </label>
      </div>

      <div className="card">
        <h2>Teleport - bezpieczeństwo</h2>
        <label>
          Maks. głębokość szukania gruntu w dół
          <input
            type="number"
            value={config.teleportBezpieczenstwo.maxGlebokoscSzukaniaWDol}
            onChange={(e) => set("teleportBezpieczenstwo", { maxGlebokoscSzukaniaWDol: Number(e.target.value) })}
          />
        </label>
        <label>
          Promień szukania obok
          <input
            type="number"
            value={config.teleportBezpieczenstwo.promienSzukaniaObok}
            onChange={(e) => set("teleportBezpieczenstwo", { promienSzukaniaObok: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="card">
        <h2>Timeouty</h2>
        <label>
          Potwierdzenie (sek.)
          <input type="number" value={config.timeouty.potwierdzenieSekundy} onChange={(e) => set("timeouty", { potwierdzenieSekundy: Number(e.target.value) })} />
        </label>
        <label>
          Zaproszenie (sek.)
          <input type="number" value={config.timeouty.zaproszenieSekundy} onChange={(e) => set("timeouty", { zaproszenieSekundy: Number(e.target.value) })} />
        </label>
        <label>
          Maks. lot Ender Pearl (sek.)
          <input type="number" value={config.timeouty.maxLotPerlySekundy} onChange={(e) => set("timeouty", { maxLotPerlySekundy: Number(e.target.value) })} />
        </label>
      </div>

      <div className="card">
        <h2>Nazwa wyspy / czyszczenie terenu</h2>
        <label>
          Maks. długość nazwy
          <input type="number" value={config.nazwaWyspy.maxDlugosc} onChange={(e) => set("nazwaWyspy", { maxDlugosc: Number(e.target.value) })} />
        </label>
        <label>
          Zapas na schemat czyszczenia
          <input type="number" value={config.wyczyszczenieTerenu.zapasNaSchemat} onChange={(e) => set("wyczyszczenieTerenu", { zapasNaSchemat: Number(e.target.value) })} />
        </label>
        <label>
          Chunki na tick
          <input type="number" value={config.wyczyszczenieTerenu.chunkiNaTick} onChange={(e) => set("wyczyszczenieTerenu", { chunkiNaTick: Number(e.target.value) })} />
        </label>
      </div>

      <div className="card">
        <h2>Wartość bloków (Topka Wysp)</h2>
        <div className="card-grid">
          {Object.entries(config.wartosciBlokow).map(([material, value]) => (
            <div key={material} className="row">
              <MaterialIcon material={material} iconPackDir={iconPackDir} />
              <span style={{ minWidth: "9rem" }}>{material}</span>
              <input
                type="number"
                style={{ width: "6rem" }}
                value={value}
                onChange={(e) => {
                  const next = { ...config.wartosciBlokow, [material]: Number(e.target.value) };
                  onChange({ ...config, wartosciBlokow: next });
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const next = { ...config.wartosciBlokow };
                  delete next[material];
                  onChange({ ...config, wartosciBlokow: next });
                }}
              >
                Usuń
              </button>
            </div>
          ))}
        </div>
        <div className="row">
          <MaterialField
            datalistId="materials"
            iconPackDir={iconPackDir}
            value={newBlockMaterial}
            onChange={setNewBlockMaterial}
            placeholder="np. DIAMOND_BLOCK"
          />
          <button
            type="button"
            onClick={() => {
              if (!newBlockMaterial.trim()) return;
              onChange({ ...config, wartosciBlokow: { ...config.wartosciBlokow, [newBlockMaterial.trim()]: 0 } });
              setNewBlockMaterial("");
            }}
          >
            + Dodaj blok
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Spawnery - typy ({config.spawnery.typy.length})</h2>
        <label>
          Maksymalny poziom
          <input type="number" value={config.spawnery.maxPoziom} onChange={(e) => set("spawnery", { maxPoziom: Number(e.target.value) })} />
        </label>
        <div className="card-grid">
          {config.spawnery.typy.map((t, i) => (
            <div key={t.id} className="card">
              <div className="row" style={{ alignItems: "center" }}>
                <MaterialIcon material={t.ikona} iconPackDir={iconPackDir} />
                <div className="card-title">{t.id}</div>
              </div>
              <label>
                Nazwa (odmieniona)
                <input value={t.nazwaOdmieniona} onChange={(e) => updateSpawnerType(i, { nazwaOdmieniona: e.target.value })} />
              </label>
              <label>
                Ikona
                <MaterialField
                  datalistId="materials"
                  iconPackDir={iconPackDir}
                  value={t.ikona}
                  onChange={(v) => updateSpawnerType(i, { ikona: v })}
                />
              </label>
              <label>
                Cena w sklepie
                <input type="number" value={t.cenaWSklepie} onChange={(e) => updateSpawnerType(i, { cenaWSklepie: Number(e.target.value) })} />
              </label>
              <p className="muted small">
                Musi się zgadzać z buy-price w categories/spawnery.yml (Kreator sklepu) - nic ich nie synchronizuje automatycznie.
              </p>
            </div>
          ))}
        </div>
      </div>

      {(["kosztBazowyIlosc", "kosztBazowySzybkosc"] as const).map((curveKey) => (
        <div className="card" key={curveKey}>
          <h2>{curveKey === "kosztBazowyIlosc" ? "Koszt ulepszenia - Ilość" : "Koszt ulepszenia - Szybkość"}</h2>
          <p className="muted small">Koszt awansu Z danego poziomu NA kolejny, przed przemnożeniem przez cenę typu spawnera.</p>
          {Object.entries(config.spawnery[curveKey].poziomy).map(([level, cost]) => (
            <div key={level} className="row">
              <span className="muted small">Poziom {level} →</span>
              <input
                type="number"
                style={{ width: "7rem" }}
                value={cost}
                onChange={(e) => {
                  const next = { ...config.spawnery[curveKey].poziomy, [level]: Number(e.target.value) };
                  set("spawnery", { [curveKey]: { ...config.spawnery[curveKey], poziomy: next } } as Partial<IslandConfig["spawnery"]>);
                }}
              />
            </div>
          ))}
          <label>
            Domyślny (poziomy spoza listy powyżej)
            <input
              type="number"
              value={config.spawnery[curveKey].domyslny}
              onChange={(e) =>
                set("spawnery", { [curveKey]: { ...config.spawnery[curveKey], domyslny: Number(e.target.value) } } as Partial<
                  IslandConfig["spawnery"]
                >)
              }
            />
          </label>
        </div>
      ))}

      <div className="card">
        <h2>Sniffer Farmera</h2>
        <label>
          Promień zbioru
          <input type="number" value={config.sniffer.promienZbioru} onChange={(e) => set("sniffer", { promienZbioru: Number(e.target.value) })} />
        </label>
        <label>
          Wysokość zbioru
          <input type="number" value={config.sniffer.wysokoscZbioru} onChange={(e) => set("sniffer", { wysokoscZbioru: Number(e.target.value) })} />
        </label>
        <label>
          Promień szukania skrzyni
          <input type="number" value={config.sniffer.promienSzukaniaSkrzyni} onChange={(e) => set("sniffer", { promienSzukaniaSkrzyni: Number(e.target.value) })} />
        </label>
        <label>
          Promień wędrowania
          <input type="number" value={config.sniffer.promienWedrowania} onChange={(e) => set("sniffer", { promienWedrowania: Number(e.target.value) })} />
        </label>
        <label>
          Odstęp skanu (sek.)
          <input type="number" value={config.sniffer.skanOdstepSekundy} onChange={(e) => set("sniffer", { skanOdstepSekundy: Number(e.target.value) })} />
        </label>
        <p className="card-title" style={{ marginTop: "0.5rem" }}>
          Zbierane uprawy
        </p>
        <div className="row">
          {config.sniffer.uprawy.map((crop, i) => (
            <span key={i} className="row">
              <input
                value={crop}
                style={{ width: "9rem" }}
                onChange={(e) => {
                  const next = [...config.sniffer.uprawy];
                  next[i] = e.target.value.toUpperCase();
                  set("sniffer", { uprawy: next });
                }}
              />
              <button type="button" onClick={() => set("sniffer", { uprawy: config.sniffer.uprawy.filter((_, ci) => ci !== i) })}>
                ×
              </button>
            </span>
          ))}
          <button type="button" onClick={() => set("sniffer", { uprawy: [...config.sniffer.uprawy, "WHEAT"] })}>
            + Dodaj uprawę
          </button>
        </div>
      </div>
    </div>
  );
}
