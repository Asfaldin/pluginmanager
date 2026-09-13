import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { DEFAULT_CHATFILTER_CONFIG } from "../lib/chatFilterDefaults";
import { parseChatFilterConfig, serializeChatFilterConfig } from "../lib/chatFilterYaml";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { ChatFilterConfig, ChatRank } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "chatfilter";
const ALL_RANKS: ChatRank[] = ["GRACZ", "VIP", "ADMIN"];

function RankCheckboxes({ value, onChange }: { value: ChatRank[]; onChange: (next: ChatRank[]) => void }) {
  return (
    <div className="row">
      {ALL_RANKS.map((rank) => (
        <label key={rank} className="checkbox">
          <input
            type="checkbox"
            checked={value.includes(rank)}
            onChange={(e) => onChange(e.target.checked ? [...value, rank] : value.filter((r) => r !== rank))}
          />
          {rank}
        </label>
      ))}
    </div>
  );
}

export default function ChatFilterPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [config, setConfig] = useState<ChatFilterConfig | null>(null);
  const [serverConfig, setServerConfig] = useState<ChatFilterConfig | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadchatfilter");
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
  } = useLocalPresets<ChatFilterConfig>("chatfilter");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsChatFilter/chatfilter-config.yml`;
  }

  // If mainplugins-chatfilter hasn't run on this server yet, chatfilter-config.yml
  // doesn't exist - bootstrap it with the plugin's real bundled default over SFTP
  // (same idea as MenuGuiPage/IslandsPage) instead of requiring someone to start the
  // plugin first or hand-copy the file over.
  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseChatFilterConfig(text);
        setConfig(parsed);
        setServerConfig(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeChatFilterConfig(DEFAULT_CHATFILTER_CONFIG));
        setConfig(DEFAULT_CHATFILTER_CONFIG);
        setServerConfig(DEFAULT_CHATFILTER_CONFIG);
        setStatus("chatfilter-config.yml nie istniało — wgrano domyślną wersję. Serwer użyje jej po /@reloadchatfilter albo restarcie.");
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

  function set<K extends keyof ChatFilterConfig>(key: K, patch: Partial<ChatFilterConfig[K]>) {
    if (!config) return;
    setConfig({ ...config, [key]: { ...config[key], ...patch } });
  }

  // Writing the file over SFTP does NOT make the running plugin pick it up - it still
  // has the old thresholds cached in memory until told to reload, so publish also sends
  // the RCON reload command right after a successful write.
  async function publish() {
    if (!profileId || !remotePath || !config) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeChatFilterConfig(config));
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

  async function addKoncowka() {
    if (!config) return;
    const value = await showPrompt("Nowa końcówka domeny (bez kropki), np. pl", "");
    if (!value || !value.trim()) return;
    set("antyReklama", { koncowkiDomen: [...config.antyReklama.koncowkiDomen, value.trim().toLowerCase()] });
  }

  function removeKoncowka(index: number) {
    if (!config) return;
    set("antyReklama", { koncowkiDomen: config.antyReklama.koncowkiDomen.filter((_, i) => i !== index) });
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Filtr czatu</h1>

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
        <div className="two-col">
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Anty-spam (cooldown)</h2>
              <label className="checkbox">
                <input type="checkbox" checked={config.antySpam.enabled} onChange={(e) => set("antySpam", { enabled: e.target.checked })} />
                Włączony
              </label>
            </div>
            <label>
              Cooldown (sekundy)
              <input
                type="number"
                min={0}
                step={0.5}
                value={config.antySpam.cooldownSekundy}
                onChange={(e) => set("antySpam", { cooldownSekundy: Number(e.target.value) })}
              />
            </label>
            <p className="muted small">
              Gracze z permisją mainplugins.chatfilter.bypass zawsze omijają ten filtr (ustawiane w plugin.yml, nie tutaj).
            </p>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Anty-caps</h2>
              <label className="checkbox">
                <input type="checkbox" checked={config.antyCaps.enabled} onChange={(e) => set("antyCaps", { enabled: e.target.checked })} />
                Włączony
              </label>
            </div>
            <label>
              Minimalna długość wiadomości do sprawdzenia
              <input type="number" min={0} value={config.antyCaps.minDlugosc} onChange={(e) => set("antyCaps", { minDlugosc: Number(e.target.value) })} />
            </label>
            <label>
              Próg wielkich liter (%)
              <input type="number" min={0} max={100} value={config.antyCaps.progProcent} onChange={(e) => set("antyCaps", { progProcent: Number(e.target.value) })} />
            </label>
            <p className="card-title" style={{ marginTop: "0.5rem" }}>
              Wyjęte rangi (zawsze pomijają ten filtr)
            </p>
            <RankCheckboxes value={config.antyCaps.exemptRangi} onChange={(next) => set("antyCaps", { exemptRangi: next })} />
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Długość wiadomości</h2>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={config.dlugoscWiadomosci.enabled}
                  onChange={(e) => set("dlugoscWiadomosci", { enabled: e.target.checked })}
                />
                Włączony
              </label>
            </div>
            <label>
              Limit znaków
              <input
                type="number"
                min={1}
                max={256}
                value={config.dlugoscWiadomosci.limitZnakow}
                onChange={(e) => set("dlugoscWiadomosci", { limitZnakow: Number(e.target.value) })}
              />
            </label>
            <p className="muted small">256 to twardy limit klienta Minecraft - wyższa wartość nic nie zmieni.</p>
            <p className="card-title" style={{ marginTop: "0.5rem" }}>
              Wyjęte rangi
            </p>
            <RankCheckboxes value={config.dlugoscWiadomosci.exemptRangi} onChange={(next) => set("dlugoscWiadomosci", { exemptRangi: next })} />
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Anty-reklama</h2>
              <label className="checkbox">
                <input type="checkbox" checked={config.antyReklama.enabled} onChange={(e) => set("antyReklama", { enabled: e.target.checked })} />
                Włączony
              </label>
            </div>
            <p className="muted small">
              Blokuje linki (http/www), adresy IP (kształt cztery-liczby-kropka) i domeny kończące się jedną z poniższych końcówek.
            </p>
            <div className="row">
              {config.antyReklama.koncowkiDomen.map((k, i) => (
                <span key={i} className="row">
                  <code>.{k}</code>
                  <button type="button" onClick={() => removeKoncowka(i)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button type="button" onClick={addKoncowka}>
              + Dodaj końcówkę
            </button>
            <p className="card-title" style={{ marginTop: "0.5rem" }}>
              Wyjęte rangi
            </p>
            <RankCheckboxes value={config.antyReklama.exemptRangi} onChange={(next) => set("antyReklama", { exemptRangi: next })} />
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Powtórzona wiadomość</h2>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={config.powtorzonaWiadomosc.enabled}
                  onChange={(e) => set("powtorzonaWiadomosc", { enabled: e.target.checked })}
                />
                Włączony
              </label>
            </div>
            <p className="muted small">Blokuje wysłanie dokładnie tej samej wiadomości dwa razy pod rząd (ten sam gracz).</p>
            <p className="card-title" style={{ marginTop: "0.5rem" }}>
              Wyjęte rangi
            </p>
            <RankCheckboxes value={config.powtorzonaWiadomosc.exemptRangi} onChange={(next) => set("powtorzonaWiadomosc", { exemptRangi: next })} />
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Powtarzające się znaki</h2>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={config.powtarzajaceZnaki.enabled}
                  onChange={(e) => set("powtarzajaceZnaki", { enabled: e.target.checked })}
                />
                Włączony
              </label>
            </div>
            <label>
              Minimalna liczba powtórzeń tego samego znaku pod rząd
              <input
                type="number"
                min={2}
                value={config.powtarzajaceZnaki.minPowtorzen}
                onChange={(e) => set("powtarzajaceZnaki", { minPowtorzen: Number(e.target.value) })}
              />
            </label>
            <p className="card-title" style={{ marginTop: "0.5rem" }}>
              Wyjęte rangi
            </p>
            <RankCheckboxes value={config.powtarzajaceZnaki.exemptRangi} onChange={(next) => set("powtarzajaceZnaki", { exemptRangi: next })} />
          </div>
        </div>
      )}

      {!config && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadchatfilter" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
