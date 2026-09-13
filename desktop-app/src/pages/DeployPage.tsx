import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ToolbarMore from "../components/ToolbarMore";
import {
  listDistJars,
  listEmbeddedJars,
  runMavenBuild,
  sftpUploadEmbeddedJar,
  sftpUploadLocalFile,
  shopMyLicenses,
  type EmbeddedJar,
} from "../lib/api";
import { setHasDeployed } from "../lib/appSettings";
import { FREE_PLUGIN_IDS } from "../lib/freePlugins";
import { MAINPLUGINS_PROJECT_DIR_KEY as PROJECT_DIR_KEY } from "../lib/paths";
import { PLUGIN_ICONS, PLUGIN_LABELS } from "../lib/pluginIcons";
import type { LicenseRecord, LocalJar } from "../lib/types";
import { useProfiles } from "../state/ProfilesContext";

// Lista darmowych pluginów = jedno źródło prawdy w lib/freePlugins.ts (patrz też
// PluginGraph.tsx). Reszta (płatne) sama się wyłączy na serwerze bez licencji.
const ALWAYS_FREE = FREE_PLUGIN_IDS;

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
function formatTime(unixSeconds: number): string {
  if (!unixSeconds) return "-";
  return new Date(unixSeconds * 1000).toLocaleString("pl-PL");
}

function licenseGrants(licenses: LicenseRecord[], id: string): boolean {
  return licenses.some(
    (l) => l.status === "active" && (l.plugin === "*" || l.plugin.split(",").map((s) => s.trim()).includes(id))
  );
}

export default function DeployPage() {
  const { profiles, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();

  const [embedded, setEmbedded] = useState<EmbeddedJar[]>([]);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [uploadState, setUploadState] = useState<Record<string, "pending" | "ok" | "error">>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // --- ścieżka developerska (build z Mavena) ---
  const [projectDir, setProjectDir] = useState(() => localStorage.getItem(PROJECT_DIR_KEY) ?? "");
  const [distJars, setDistJars] = useState<LocalJar[]>([]);
  const [distSelected, setDistSelected] = useState<Set<string>>(new Set());
  const [buildOutput, setBuildOutput] = useState<string | null>(null);

  useEffect(() => {
    listEmbeddedJars().then(setEmbedded).catch((e) => setStatus(String(e)));
    shopMyLicenses().then(setLicenses).catch(() => setLicenses([]));
  }, []);

  useEffect(() => {
    if (projectDir) localStorage.setItem(PROJECT_DIR_KEY, projectDir);
  }, [projectDir]);

  function owned(id: string): boolean {
    return ALWAYS_FREE.has(id) || licenseGrants(licenses, id);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function uploadPicked() {
    if (!profileId || picked.size === 0) return;
    setBusy(true);
    setStatus(null);
    const ids = embedded.filter((j) => picked.has(j.id)).map((j) => j.id);
    setUploadState(Object.fromEntries(ids.map((id) => [id, "pending" as const])));
    let ok = 0;
    for (const id of ids) {
      try {
        await sftpUploadEmbeddedJar(profileId, id);
        setUploadState((prev) => ({ ...prev, [id]: "ok" }));
        ok++;
      } catch (e) {
        setUploadState((prev) => ({ ...prev, [id]: "error" }));
        setStatus(`Błąd przy "${PLUGIN_LABELS[id] ?? id}": ${String(e)}`);
      }
    }
    setBusy(false);
    if (ok > 0) {
      setHasDeployed();
      setStatus(
        `Wysłano ${ok}/${ids.length} plugin(ów) do folderu plugins/ na serwerze. Zrestartuj serwer (albo /reload), żeby je załadował.`
      );
    }
  }

  // --- developerskie: build z projektu Maven ---
  async function pickProjectDir() {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") setProjectDir(sel);
  }
  async function refreshDistJars() {
    if (!projectDir) return;
    setBusy(true);
    try {
      const list = await listDistJars(projectDir);
      setDistJars(list);
      setDistSelected(new Set(list.map((j) => j.name)));
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function buildFromMaven() {
    if (!projectDir) return;
    setBusy(true);
    setStatus(null);
    setBuildOutput(null);
    try {
      const output = await runMavenBuild(projectDir);
      setBuildOutput(output);
      await refreshDistJars();
      setStatus("Build zakończony.");
    } catch (e) {
      setBuildOutput(String(e));
      setStatus("Build nie powiódł się - patrz log poniżej.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadDistSelected() {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const toUpload = distJars.filter((j) => distSelected.has(j.name));
    if (toUpload.length === 0) return;
    setBusy(true);
    try {
      for (const jar of toUpload) {
        await sftpUploadLocalFile(profileId, jar.path, `${profile.remote_plugins_path.replace(/\/+$/, "")}/${jar.name}`);
      }
      setHasDeployed();
      setStatus(`Wysłano ${toUpload.length} plik(ów) z dist/ na serwer. Zrestartuj serwer, żeby zaczęły działać.`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  const ownedIds = embedded.filter((j) => owned(j.id)).map((j) => j.id);

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Wdrożenie</h1>
      <p className="muted">
        Wysyła pluginy wbudowane w appkę prosto do folderu <code>plugins/</code> na Twoim serwerze przez SFTP - nie
        potrzebujesz kodu źródłowego ani niczego budować. Po wysyłce zrestartuj serwer (albo <code>/reload</code>).
      </p>

      <div className="card form">
        <label style={{ maxWidth: 320 }}>
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
        {profiles.length === 0 && (
          <p className="muted small">
            Najpierw dodaj serwer w <Link to="/servers">Serwery</Link> (host SFTP + dane logowania).
          </p>
        )}

        <div className="row">
          <button type="button" onClick={() => setPicked(new Set(embedded.map((j) => j.id)))} disabled={embedded.length === 0}>
            Zaznacz wszystko
          </button>
          <button type="button" onClick={() => setPicked(new Set(ownedIds))} disabled={ownedIds.length === 0}>
            Zaznacz posiadane ({ownedIds.length})
          </button>
          <button type="button" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
            Wyczyść
          </button>
        </div>

        <fieldset>
          <legend>Pluginy w appce ({embedded.length})</legend>
          <div className="rp-texture-list">
            {embedded.map((jar) => {
              const Icon = PLUGIN_ICONS[jar.id];
              const st = uploadState[jar.id];
              return (
                <label key={jar.id} className="rp-texture-list-row" style={{ cursor: "pointer" }}>
                  <span className="checkbox" style={{ gap: "0.5rem" }}>
                    <input type="checkbox" checked={picked.has(jar.id)} onChange={() => toggle(jar.id)} />
                    {Icon && <Icon size={15} strokeWidth={1.75} />}
                    {PLUGIN_LABELS[jar.id] ?? jar.id}
                  </span>
                  <span className="row" style={{ margin: 0, gap: "0.5rem" }}>
                    {owned(jar.id) ? (
                      <span className="badge badge-on">{ALWAYS_FREE.has(jar.id) ? "za darmo" : "masz licencję"}</span>
                    ) : (
                      <span className="badge">wymaga licencji</span>
                    )}
                    {st === "ok" && <span className="badge badge-on">wysłano</span>}
                    {st === "error" && <span className="badge">błąd</span>}
                    {st === "pending" && <span className="muted small">wysyłam...</span>}
                    <span className="muted small">{formatSize(jar.size)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="row">
            <button onClick={uploadPicked} disabled={busy || !profileId || picked.size === 0}>
              Wyślij zaznaczone ({picked.size})
            </button>
          </div>
        </fieldset>
      </div>

      {/* Ścieżka developerska (build z Mavena) - widoczna TYLKO w trybie dev (npm run
          tauri dev). W wersji zbudowanej dla klienta znika: klient i tak nie ma kodu
          źródłowego Mainplugins, więc te przyciski byłyby dla niego mylące. */}
      {import.meta.env.DEV && (
      <ToolbarMore>
        <p className="muted small" style={{ marginTop: 0 }}>
          Dla developera: zbuduj świeże jary z lokalnego projektu Maven (mvn package) i wyślij z folderu <code>dist/</code>.
          Zwykły użytkownik tego nie potrzebuje - wersje w appce wyżej wystarczą.
        </p>
        <label>
          Lokalny folder projektu (Maven)
          <div className="row">
            <input placeholder="C:\Users\...\IdeaProjects\Mainplugins" value={projectDir} onChange={(e) => setProjectDir(e.target.value)} />
            <button onClick={pickProjectDir}>Wybierz...</button>
          </div>
        </label>
        <div className="row">
          <button onClick={buildFromMaven} disabled={busy || !projectDir}>Zbuduj</button>
          <button onClick={refreshDistJars} disabled={busy || !projectDir}>Odśwież listę jarów</button>
        </div>
        {distJars.length > 0 && (
          <fieldset>
            <legend>Jary w dist/ ({distJars.length})</legend>
            <div className="rp-texture-list">
              {distJars.map((jar) => (
                <div key={jar.name} className="rp-texture-list-row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={distSelected.has(jar.name)}
                      onChange={() =>
                        setDistSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(jar.name)) next.delete(jar.name);
                          else next.add(jar.name);
                          return next;
                        })
                      }
                    />
                    {jar.name}
                  </label>
                  <span className="muted small">
                    {formatSize(jar.size)} · {formatTime(jar.modified_unix)}
                  </span>
                </div>
              ))}
            </div>
            <div className="row">
              <button onClick={uploadDistSelected} disabled={busy || !profileId || distSelected.size === 0}>
                Wyślij zaznaczone ({distSelected.size})
              </button>
            </div>
          </fieldset>
        )}
        {buildOutput && (
          <fieldset>
            <legend>Log budowania</legend>
            <pre className="build-log">{buildOutput}</pre>
          </fieldset>
        )}
      </ToolbarMore>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
