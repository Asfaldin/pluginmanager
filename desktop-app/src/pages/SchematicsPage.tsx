import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { Blocks, Download, File, Folder, Trash2, Upload } from "lucide-react";
import { StatusBar } from "../components/EditorBits";
import { useEffect, useRef, useState } from "react";
import { sftpDeleteFile, sftpDownloadFile, sftpListDir, sftpUploadLocalFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import type { RemoteEntry } from "../lib/types";
import { useProfiles } from "../state/ProfilesContext";

const LAST_USED_KEY = "schematics";

// Rozpoznawane formaty struktur - .nbt to natywny format Minecrafta (np. islands/default.nbt
// w Skyblocku, budowany przez /@islandtemplate), .schem/.schematic to starsze formaty
// WorldEdita. Rozszerzenie tylko oznacza plik ikoną - przeglądarka i tak pokazuje wszystko
// w folderze, bo część serwerów trzyma struktury pod dowolnymi nazwami/folderami.
const STRUCTURE_EXTENSIONS = [".nbt", ".schem", ".schematic"];

function isStructureFile(name: string): boolean {
  const lower = name.toLowerCase();
  return STRUCTURE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function SchematicsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const autoLoadedRef = useRef(false);

  const profile = profiles.find((p) => p.id === profileId);

  async function browse(path: string, profileIdOverride?: string) {
    const pid = profileIdOverride ?? profileId;
    if (!pid) return;
    setBusy(true);
    setStatus(null);
    try {
      const list = await sftpListDir(pid, path);
      setEntries(list);
      setCurrentPath(path);
      setPathInput(path);
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string, initialPath?: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    const path = initialPath || p?.remote_plugins_path;
    if (path) browse(path, id);
  }

  // Kolejność pierwszeństwa: serwer aktywny GLOBALNIE (pasek boczny) > ostatnio użyty
  // na tej konkretnej stronie - ten sam wzorzec co ConfigEditorPage.
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

  function goUp() {
    if (!currentPath || currentPath === "/") return;
    const trimmed = currentPath.replace(/\/+$/, "");
    const parent = trimmed.substring(0, trimmed.lastIndexOf("/")) || "/";
    browse(parent);
  }

  function openEntry(entry: RemoteEntry) {
    if (entry.is_dir) browse(entry.path);
  }

  async function downloadEntry(entry: RemoteEntry) {
    const dest = await save({ defaultPath: entry.name });
    if (!dest) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpDownloadFile(profileId, entry.path, dest);
      setStatus(`Pobrano: ${entry.name} → ${dest}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry: RemoteEntry) {
    const confirmed = await ask(`Na pewno usunąć „${entry.name}" z serwera? Tej operacji nie da się cofnąć.`, {
      title: "Usunąć plik?",
      kind: "warning",
    });
    if (!confirmed) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpDeleteFile(profileId, entry.path);
      setStatus(`Usunięto: ${entry.name}`);
      await browse(currentPath);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadHere() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Struktury", extensions: ["nbt", "schem", "schematic"] }, { name: "Wszystkie pliki", extensions: ["*"] }],
    });
    if (typeof selected !== "string") return;
    const filename = selected.replace(/\\/g, "/").split("/").pop() ?? selected;
    const remotePath = `${currentPath.replace(/\/+$/, "")}/${filename}`;
    setBusy(true);
    setStatus(null);
    try {
      await sftpUploadLocalFile(profileId, selected, remotePath);
      setStatus(`Wysłano: ${filename}`);
      await browse(currentPath);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Budowle i schematy</h1>

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
        <>
          <div className="card">
            <div className="row">
              <button onClick={goUp} disabled={busy}>
                .. Wyżej
              </button>
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") browse(pathInput);
                }}
                style={{ flex: 1 }}
              />
              <button onClick={() => browse(pathInput)} disabled={busy}>
                Przejdź
              </button>
              <button onClick={uploadHere} disabled={busy}>
                <Upload size={14} strokeWidth={1.75} /> Wyślij plik tutaj...
              </button>
            </div>
            <ul className="file-list">
              {entries.map((entry) => (
                <li key={entry.path} className="row" style={{ margin: 0, justifyContent: "space-between" }}>
                  <button className="file-entry" onClick={() => openEntry(entry)} disabled={busy}>
                    {entry.is_dir ? (
                      <Folder size={14} strokeWidth={1.75} />
                    ) : isStructureFile(entry.name) ? (
                      <Blocks size={14} strokeWidth={1.75} />
                    ) : (
                      <File size={14} strokeWidth={1.75} />
                    )}{" "}
                    {entry.name}
                  </button>
                  <span className="row" style={{ margin: 0, gap: "0.4rem" }}>
                    {!entry.is_dir && <span className="muted small">{formatSize(entry.size)}</span>}
                    {!entry.is_dir && (
                      <>
                        <button type="button" onClick={() => downloadEntry(entry)} disabled={busy} title="Pobierz na dysk">
                          <Download size={14} strokeWidth={1.75} />
                        </button>
                        <button type="button" onClick={() => deleteEntry(entry)} disabled={busy} title="Usuń z serwera">
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
              {entries.length === 0 && <p className="muted small">Pusty folder.</p>}
            </ul>
          </div>
        </>
      )}

      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
    </div>
  );
}
