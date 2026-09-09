import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDistJars, runMavenBuild, sftpUploadLocalFile } from "../lib/api";
import { MAINPLUGINS_PROJECT_DIR_KEY as PROJECT_DIR_KEY } from "../lib/paths";
import type { LocalJar } from "../lib/types";
import { useProfiles } from "../state/ProfilesContext";

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatTime(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString("pl-PL");
}

export default function DeployPage() {
  const { profiles, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [projectDir, setProjectDir] = useState(() => localStorage.getItem(PROJECT_DIR_KEY) ?? "");
  const [jars, setJars] = useState<LocalJar[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [buildOutput, setBuildOutput] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (projectDir) localStorage.setItem(PROJECT_DIR_KEY, projectDir);
  }, [projectDir]);

  async function pickProjectDir() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setProjectDir(selected);
  }

  async function refreshJars() {
    if (!projectDir) return;
    setBusy(true);
    setStatus(null);
    try {
      const list = await listDistJars(projectDir);
      setJars(list);
      setSelected(new Set(list.map((j) => j.name)));
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function build() {
    if (!projectDir) return;
    setBusy(true);
    setStatus(null);
    setBuildOutput(null);
    try {
      const output = await runMavenBuild(projectDir);
      setBuildOutput(output);
      setStatus("Build zakończony.");
      await refreshJars();
    } catch (e) {
      setBuildOutput(String(e));
      setStatus("Build nie powiódł się — patrz log poniżej.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function uploadSelected() {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const toUpload = jars.filter((j) => selected.has(j.name));
    if (toUpload.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      for (const jar of toUpload) {
        const remotePath = `${profile.remote_plugins_path.replace(/\/+$/, "")}/${jar.name}`;
        await sftpUploadLocalFile(profileId, jar.path, remotePath);
      }
      setStatus(
        `Wysłano ${toUpload.length} plik(ów) na serwer. Zrestartuj serwer ręcznie w panelu chsrv.pl, żeby zmiany zaczęły działać.`
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function buildAndUpload() {
    if (!projectDir || !profileId) return;
    setBusy(true);
    setStatus(null);
    setBuildOutput(null);
    try {
      const output = await runMavenBuild(projectDir);
      setBuildOutput(output);
      const list = await listDistJars(projectDir);
      setJars(list);
      setSelected(new Set(list.map((j) => j.name)));

      const profile = profiles.find((p) => p.id === profileId)!;
      for (const jar of list) {
        const remotePath = `${profile.remote_plugins_path.replace(/\/+$/, "")}/${jar.name}`;
        await sftpUploadLocalFile(profileId, jar.path, remotePath);
      }
      setStatus(
        `Zbudowano i wysłano ${list.length} plik(ów) na serwer. Zrestartuj serwer ręcznie w panelu chsrv.pl, żeby zmiany zaczęły działać.`
      );
    } catch (e) {
      setBuildOutput((prev) => prev ?? String(e));
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Wdrożenie</h1>
      <p className="muted">
        Buduje pluginy lokalnie (mvn package) i wysyła zbudowane jary z folderu dist/ na serwer przez SFTP. Restart
        serwera (chunkserve nie ma do tego API) zostaje ostatnim ręcznym krokiem w panelu chsrv.pl.
      </p>

      <div className="card form">
        <label>
          Lokalny folder projektu (Maven)
          <div className="row">
            <input
              placeholder="C:\Users\...\IdeaProjects\Mainplugins"
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
            />
            <button onClick={pickProjectDir}>Wybierz...</button>
          </div>
        </label>

        <label>
          Serwer docelowy
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Wybierz serwer...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <button onClick={buildAndUpload} disabled={busy || !projectDir || !profileId}>
            Zbuduj i wyślij wszystko
          </button>
          <button onClick={build} disabled={busy || !projectDir}>
            Tylko zbuduj
          </button>
          <button onClick={refreshJars} disabled={busy || !projectDir}>
            Odśwież listę jarów
          </button>
        </div>
      </div>

      {jars.length > 0 && (
        <fieldset className="card">
          <legend>Jary w dist/ ({jars.length})</legend>
          <div className="rp-texture-list">
            {jars.map((jar) => (
              <div key={jar.name} className="rp-texture-list-row">
                <label className="checkbox">
                  <input type="checkbox" checked={selected.has(jar.name)} onChange={() => toggleSelected(jar.name)} />
                  {jar.name}
                </label>
                <span className="muted small">
                  {formatSize(jar.size)} · {formatTime(jar.modified_unix)}
                </span>
              </div>
            ))}
          </div>
          <div className="row">
            <button onClick={uploadSelected} disabled={busy || !profileId || selected.size === 0}>
              Wyślij zaznaczone ({selected.size})
            </button>
          </div>
        </fieldset>
      )}

      {buildOutput && (
        <fieldset className="card">
          <legend>Log budowania</legend>
          <pre className="build-log">{buildOutput}</pre>
        </fieldset>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
