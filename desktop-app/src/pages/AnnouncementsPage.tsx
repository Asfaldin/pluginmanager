import { Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AnnouncerGroupEditor from "../components/AnnouncerGroupEditor";
import ChannelPicker from "../components/ChannelPicker";
import LocalExportButton from "../components/LocalExportButton";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import RemoteFilePicker from "../components/RemoteFilePicker";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { showPrompt } from "../components/PromptModal";
import {
  EMPTY_CONFIG,
  EMPTY_EVENT,
  EMPTY_GROUP,
  EMPTY_ONBOARDING_STEP,
  parseAnnouncerConfig,
  serializeAnnouncerConfig,
  type AnnouncerConfig,
  type AnnGroup,
  type EventSpec,
} from "../lib/announcerConfig";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

const LAST_USED_KEY = "announcements";

export default function AnnouncementsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [config, setConfig] = useState<AnnouncerConfig>(EMPTY_CONFIG);
  const [serverConfig, setServerConfig] = useState<AnnouncerConfig>(EMPTY_CONFIG);
  const [reloadCommand, setReloadCommand] = useState("@reloadannouncer");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupExpand, setGroupExpand] = useState<Record<number, boolean>>({});
  const autoLoadedRef = useRef(false);

  const profile = profiles.find((p) => p.id === profileId);

  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<AnnouncerConfig>("announcements");

  function isGroupExpanded(i: number, group: AnnGroup): boolean {
    return i in groupExpand ? groupExpand[i] : group.messages.length === 0;
  }
  function toggleGroupExpanded(i: number, group: AnnGroup) {
    setGroupExpand((prev) => ({ ...prev, [i]: !isGroupExpanded(i, group) }));
  }

  function selectProfile(id: string) {
    if (dirty && !window.confirm("Masz niezapisane zmiany w edytorze. Wybranie serwera wczyta stamtąd konfigurację i nadpisze je. Kontynuować?")) {
      return;
    }
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsAnnouncer/ogloszenia.yml`;
    setRemotePath(path);
    setLastUsed(LAST_USED_KEY, { profileId: id, remotePath: path });
    loadPresets(id);
    load(id, path);
  }

  async function load(profileIdOverride?: string, remotePathOverride?: string) {
    const pid = profileIdOverride ?? profileId;
    const path = remotePathOverride ?? remotePath;
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await sftpReadFile(pid, path);
      const parsed = parseAnnouncerConfig(text);
      setConfig(parsed);
      setServerConfig(parsed);
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
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

  const dirty = config !== serverConfig;
  useDirtyTracking(dirty);

  async function save() {
    if (!profileId || !remotePath) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeAnnouncerConfig(config));
      setServerConfig(config);
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
    setConfig(serverConfig);
    setStatus("Przywrócono stan z serwera - lokalne zmiany odrzucone.");
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
    setStatus(`Wczytano preset „${name}" do edycji - kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  // ---- grupy ----
  function updateGroup(i: number, patch: Partial<AnnGroup>) {
    const next = [...config.groups];
    next[i] = { ...next[i], ...patch };
    setConfig({ ...config, groups: next });
  }
  function removeGroup(i: number) {
    if (!window.confirm("Usunąć całą grupę razem z jej wiadomościami? Tego nie da się cofnąć.")) return;
    setConfig({ ...config, groups: config.groups.filter((_, idx) => idx !== i) });
    setGroupExpand((prev) => {
      const next: Record<number, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (idx === i) continue;
        next[idx > i ? idx - 1 : idx] = v;
      }
      return next;
    });
  }
  function moveGroup(i: number, delta: number) {
    const target = i + delta;
    if (target < 0 || target >= config.groups.length) return;
    const next = [...config.groups];
    [next[i], next[target]] = [next[target], next[i]];
    setConfig({ ...config, groups: next });
  }
  function addGroup() {
    const newIndex = config.groups.length;
    setConfig({ ...config, groups: [...config.groups, { ...EMPTY_GROUP, name: `grupa-${newIndex + 1}` }] });
    setGroupExpand((prev) => ({ ...prev, [newIndex]: true }));
  }

  // ---- eventy ----
  function updateEvent(i: number, patch: Partial<EventSpec>) {
    const next = [...config.events];
    next[i] = { ...next[i], ...patch };
    setConfig({ ...config, events: next });
  }
  function removeEvent(i: number) {
    setConfig({ ...config, events: config.events.filter((_, idx) => idx !== i) });
  }
  function addEvent() {
    setConfig({ ...config, events: [...config.events, { ...EMPTY_EVENT, key: `event-${config.events.length + 1}` }] });
  }

  // ---- onboarding ----
  function updateOnboardingStep(i: number, patch: Partial<(typeof config.onboarding)[number]>) {
    const next = [...config.onboarding];
    next[i] = { ...next[i], ...patch };
    setConfig({ ...config, onboarding: next });
  }
  function removeOnboardingStep(i: number) {
    setConfig({ ...config, onboarding: config.onboarding.filter((_, idx) => idx !== i) });
  }
  function addOnboardingStep() {
    setConfig({ ...config, onboarding: [...config.onboarding, { ...EMPTY_ONBOARDING_STEP }] });
  }

  async function reload() {
    if (!reloadCommand) return;
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
      <h1>Announcer</h1>
      <p className="muted">
        Grupy ogłoszeń z własnym harmonogramem, eventy (mosty z innych pluginów), sekwencja powitalna dla nowych graczy i mirror na Discord.
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
        <input
          placeholder="/plugins/MyPlugin/ogloszenia.yml"
          value={remotePath}
          onChange={(e) => setRemotePath(e.target.value)}
        />
        <button onClick={() => setPickerOpen(true)} disabled={!profileId}>
          Przeglądaj...
        </button>
        <button onClick={() => load()} disabled={!profileId || !remotePath || busy}>
          Wczytaj
        </button>
      </div>

      {pickerOpen && profile && (
        <RemoteFilePicker
          profileId={profileId}
          startPath={profile.remote_plugins_path}
          onSelect={(path) => {
            setRemotePath(path);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="row">
        <button onClick={save} disabled={!profileId || !remotePath || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
        <button type="button" onClick={revertToServer} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        {dirty && <span className="muted small">masz niezapisane zmiany</span>}
      </div>

      <div className="row">
        <LocalExportButton
          pluginId="announcer"
          pluginFolderName="MainpluginsAnnouncer"
          configFilename="ogloszenia.yml"
          getConfigText={() => serializeAnnouncerConfig(config)}
          profileId={profileId || undefined}
        />
        <span className="muted small">jar wbudowany w appkę - działa bez budowania czegokolwiek</span>
      </div>

      <div className="card form">
        <fieldset>
          <legend>Ustawienia ogólne</legend>
          <div className="row">
            <label>
              Domyślny interwał (sekundy)
              <input
                type="number"
                min={20}
                value={config.intervalSeconds}
                onChange={(e) => setConfig({ ...config, intervalSeconds: Number(e.target.value) })}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={config.placeholdersEnabled}
                onChange={(e) => setConfig({ ...config, placeholdersEnabled: e.target.checked })}
              />
              PlaceholderAPI włączone
            </label>
          </div>
          <label style={{ maxWidth: 220 }}>
            Godziny ciszy (np. 22:00-06:00, puste = brak)
            <input
              value={config.quietHours}
              onChange={(e) => setConfig({ ...config, quietHours: e.target.value })}
              placeholder="brak"
            />
          </label>

          <ToolbarMore>
            <p className="muted small" style={{ marginTop: 0 }}>Discord (mirror wybranych ogłoszeń na webhook)</p>
            <div className="row">
              <label style={{ flex: 1 }}>
                Webhook URL
                <input
                  value={config.discordWebhookUrl}
                  onChange={(e) => setConfig({ ...config, discordWebhookUrl: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                />
              </label>
              <label>
                Nazwa bota
                <input value={config.discordUsername} onChange={(e) => setConfig({ ...config, discordUsername: e.target.value })} />
              </label>
              <label style={{ flex: 1 }}>
                Avatar URL
                <input value={config.discordAvatarUrl} onChange={(e) => setConfig({ ...config, discordAvatarUrl: e.target.value })} />
              </label>
            </div>
          </ToolbarMore>
        </fieldset>

        <fieldset>
          <legend>Grupy ogłoszeń</legend>
          {config.groups.length === 0 && <p className="muted small">Brak grup - dodaj pierwszą, żeby zacząć.</p>}
          {config.groups.map((g, i) => (
            <AnnouncerGroupEditor
              key={i}
              group={g}
              index={i}
              total={config.groups.length}
              expanded={isGroupExpanded(i, g)}
              onToggleExpand={() => toggleGroupExpanded(i, g)}
              onChange={(patch) => updateGroup(i, patch)}
              onRemove={() => removeGroup(i)}
              onMove={(delta) => moveGroup(i, delta)}
            />
          ))}
          <button type="button" onClick={addGroup}>+ Dodaj grupę</button>
        </fieldset>

        <fieldset>
          <legend>Eventy (mosty z innych pluginów)</legend>
          <p className="muted small" style={{ marginTop: 0 }}>
            Klucz musi się zgadzać z tym, co wysyła dany plugin (np. "dungeon-boss", "rare-fish", "crate-legendary", "island-created") - "first-join", "vanilla-advancement" i "death" są wbudowane w samego Announcera.
          </p>
          {config.events.map((ev, i) => (
            <div key={i} className="card" style={{ marginBottom: "0.5rem" }}>
              <div className="row">
                <label>
                  Klucz
                  <input value={ev.key} onChange={(e) => updateEvent(i, { key: e.target.value.trim() })} />
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={ev.enabled} onChange={(e) => updateEvent(i, { enabled: e.target.checked })} />
                  Włączony
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={ev.discord} onChange={(e) => updateEvent(i, { discord: e.target.checked })} />
                  Discord
                </label>
                <button type="button" onClick={() => removeEvent(i)}>Usuń</button>
              </div>
              <MinecraftTextInput value={ev.text} onChange={(v) => updateEvent(i, { text: v })} placeholder="&6%player% &epokonał..." />
              <ChannelPicker value={ev.channels} onChange={(channels) => updateEvent(i, { channels })} />
              <div className="row">
                <label>
                  Dźwięk
                  <input value={ev.sound} onChange={(e) => updateEvent(i, { sound: e.target.value })} placeholder="entity.ender_dragon.growl" />
                </label>
                <label>
                  Cooldown (s, 0 = brak)
                  <input type="number" min={0} style={{ width: 90 }} value={ev.cooldownSeconds} onChange={(e) => updateEvent(i, { cooldownSeconds: Number(e.target.value) })} />
                </label>
              </div>
            </div>
          ))}
          <button type="button" onClick={addEvent}>+ Dodaj event</button>
        </fieldset>

        <fieldset>
          <legend>Sekwencja powitalna (onboarding)</legend>
          <label className="checkbox">
            <input type="checkbox" checked={config.onboardingEnabled} onChange={(e) => setConfig({ ...config, onboardingEnabled: e.target.checked })} />
            Włączona - tylko dla graczy wchodzących pierwszy raz w życiu
          </label>
          {config.onboarding.map((step, i) => (
            <div key={i} className="card" style={{ marginTop: "0.5rem" }}>
              <div className="row">
                <label>
                  Opóźnienie po dołączeniu (s)
                  <input type="number" min={0} style={{ width: 100 }} value={step.delaySeconds} onChange={(e) => updateOnboardingStep(i, { delaySeconds: Number(e.target.value) })} />
                </label>
                <button type="button" onClick={() => removeOnboardingStep(i)}>Usuń krok</button>
              </div>
              <MinecraftTextInput value={step.text} onChange={(v) => updateOnboardingStep(i, { text: v })} placeholder="&aMiło Cię widzieć!" />
              <ChannelPicker value={step.channels} onChange={(channels) => updateOnboardingStep(i, { channels })} />
            </div>
          ))}
          <button type="button" onClick={addOnboardingStep} style={{ marginTop: "0.5rem" }}>+ Dodaj krok</button>
        </fieldset>

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
            <input
              placeholder="komenda RCON, np. @reloadannouncer"
              value={reloadCommand}
              onChange={(e) => setReloadCommand(e.target.value)}
            />
            <button onClick={reload} disabled={!profileId || busy}>
              Wyślij RCON
            </button>
          </div>
        </ToolbarMore>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
