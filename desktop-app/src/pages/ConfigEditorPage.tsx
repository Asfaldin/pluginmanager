import { useDirtyTracking } from "../state/DirtyContext";
import { yaml } from "@codemirror/lang-yaml";
import CodeMirror from "@uiw/react-codemirror";
import { File, Folder, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import { rconSendCommand, sftpListDir, sftpReadFile, sftpWriteFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { RemoteEntry } from "../lib/types";

const LAST_USED_KEY = "config";

interface NavState {
  profileId?: string | null;
  path?: string | null;
}

export default function ConfigEditorPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const location = useLocation();
  const navState = (location.state as NavState) ?? {};
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [serverContent, setServerContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [reloadCommand, setReloadCommand] = useState("");
  const [busy, setBusy] = useState(false);
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
  } = useLocalPresets<string>("config");

  function presetScope(pid: string, path: string): string {
    return `${pid}:${path}`;
  }

  async function browse(path: string, profileIdOverride?: string) {
    const pid = profileIdOverride ?? profileId;
    if (!pid) return;
    setBusy(true);
    setStatus(null);
    try {
      setEntries(await sftpListDir(pid, path));
      setCurrentPath(path);
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string, initialPath?: string) {
    setProfileId(id);
    setOpenFile(null);
    setContent("");
    const p = profiles.find((x) => x.id === id);
    const path = initialPath || p?.remote_plugins_path;
    if (path) browse(path, id);
  }

  useEffect(() => {
    if (navState.profileId) {
      autoLoadedRef.current = true;
      selectProfile(navState.profileId, navState.path ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kolejność pierwszeństwa: jawna nawigacja (navState, wyżej) > serwer aktywny
  // GLOBALNIE (pasek boczny) > stary zapis specyficzny dla tej strony.
  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) {
      selectProfile(profileId);
      return;
    }
    const last = getLastUsed(LAST_USED_KEY);
    if (last && profiles.some((p) => p.id === last.profileId)) {
      selectProfile(last.profileId, last.remotePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  async function openEntry(entry: RemoteEntry) {
    if (entry.is_dir) {
      browse(entry.path);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const text = await sftpReadFile(profileId, entry.path);
      setOpenFile(entry.path);
      setContent(text);
      setServerContent(text);
      loadPresets(presetScope(profileId, entry.path));
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function goUp() {
    if (!currentPath || currentPath === "/") return;
    const trimmed = currentPath.replace(/\/+$/, "");
    const parent = trimmed.substring(0, trimmed.lastIndexOf("/")) || "/";
    browse(parent);
  }

  const dirty = content !== serverContent;
  useDirtyTracking(dirty);

  // Writing the file over SFTP does NOT make the owning plugin pick it up -
  // it still has the old config cached in memory until told to reload. If a
  // reload command is already typed below, save sends it automatically right
  // after a successful write - there's no universal default here since this
  // editor opens arbitrary files across arbitrary plugins.
  async function save() {
    if (!openFile) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, openFile, content);
      setServerContent(content);
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
    setContent(serverContent);
    setStatus("Przywrócono stan z serwera - lokalne zmiany odrzucone.");
  }

  // Local presets are a separate, opt-in safety net on top of the draft -
  // saving one never touches the server. Scoped per profile+file. Loading
  // one only replaces the local draft; it still has to go through "Wyślij na
  // serwer" to go live - handy if something got overwritten on the server
  // and you want back what you had.
  function saveCurrentPresetAs() {
    if (!profileId || !openFile) return;
    const name = window.prompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(presetScope(profileId, openFile), name, content);
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (found == null) return;
    setContent(found);
    setStatus(`Wczytano preset „${name}" do edycji - kliknij "Wyślij na serwer", żeby go opublikować.`);
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
      <h1>Edytor configów</h1>

      <div className="row">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {profile && (
        <div className="two-col">
          <div className="card">
            <div className="row">
              <button onClick={goUp} disabled={busy}>
                .. Wyżej
              </button>
              <span className="muted small">{currentPath}</span>
            </div>
            <ul className="file-list">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button className="file-entry" onClick={() => openEntry(entry)}>
                    {entry.is_dir ? <Folder size={14} strokeWidth={1.75} /> : <File size={14} strokeWidth={1.75} />} {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            {openFile ? (
              <>
                <div className="row">
                  <strong className="small">{openFile}</strong>
                  <button onClick={save} disabled={!dirty || busy}>
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
                    onDelete={(name) => deletePreset(presetScope(profileId, openFile), name)}
                  />
                </ToolbarMore>
                <CodeMirror value={content} height="420px" extensions={[yaml()]} onChange={setContent} />
                <div className="row">
                  <input
                    placeholder="komenda RCON, np. plugman reload MyPlugin"
                    value={reloadCommand}
                    onChange={(e) => setReloadCommand(e.target.value)}
                  />
                  <button onClick={reload} disabled={busy}>
                    Wyślij RCON
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">Wybierz plik z listy po lewej.</p>
            )}
          </div>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
