import { desktopDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { PackageOpen, Rocket } from "lucide-react";
import { useState } from "react";
import { exportPluginBundle, sftpUploadEmbeddedJar } from "../lib/api";

/**
 * Jar pluginu jest WBUDOWANY w appkę (patrz src-tauri/embedded_jars.rs) - klient nie
 * musi mieć kodu źródłowego Mainplugins ani niczego budować. Dwie niezależne opcje:
 *  - "Pobierz bez serwera" - zapisuje jar + aktualnie edytowany config do folderu
 *    nazwanego od id pluginu, w lokalizacji wybranej przez użytkownika. Nazwa folderu
 *    to zwykłe pole appki (od razu wypełnione, edytowalne) - NIE pole nazwy w natywnym
 *    dialogu "Zapisz jako": na Windows ten dialog czasem zostawia pole nazwy puste
 *    mimo ustawionego defaultPath (obserwowane w tej appce), więc niezawodniejsze jest
 *    trzymanie nazwy po naszej stronie i użycie dialogu tylko do wyboru lokalizacji.
 *  - "Wyślij na serwer" (widoczne tylko gdy wybrano profil) - wgrywa jar prosto przez
 *    SFTP na skonfigurowany serwer, bez pośredniego zapisu na dysk.
 */
export default function LocalExportButton({
  pluginId,
  pluginFolderName,
  configFilename,
  getConfigText,
  profileId,
}: {
  pluginId: string;
  pluginFolderName: string;
  configFilename: string;
  getConfigText: () => string;
  /** Id aktualnie wybranego profilu serwera na tej stronie - gdy podane, pokazuje też "Wyślij na serwer". */
  profileId?: string;
}) {
  const [folderName, setFolderName] = useState(pluginId);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadLocally() {
    setError(null);
    setStatus(null);
    const name = folderName.trim() || pluginId;

    // Pulpit zalogowanego użytkownika jako punkt startowy dialogu - NIE zaszywamy tu
    // żadnej konkretnej ścieżki. Gdy się nie uda (np. brak uprawnień), dialog otwiera
    // się w domyślnej lokalizacji systemu.
    let defaultPath: string | undefined;
    try {
      defaultPath = await desktopDir();
    } catch {
      defaultPath = undefined;
    }

    const parentDir = await open({
      directory: true,
      multiple: false,
      title: `Wybierz lokalizację - w niej powstanie folder "${name}"`,
      defaultPath,
    });
    if (typeof parentDir !== "string") return;
    const destDir = `${parentDir.replace(/[\\/]+$/, "")}\\${name}`;

    setBusy(true);
    try {
      const result = await exportPluginBundle(pluginId, pluginFolderName, configFilename, getConfigText(), destDir);
      setStatus(`Zapisano do: ${result} (jar pluginu + ${pluginFolderName}\\${configFilename}) - skopiuj oba do folderu plugins/ na serwerze.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadToServer() {
    if (!profileId) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const remotePath = await sftpUploadEmbeddedJar(profileId, pluginId);
      setStatus(`Jar wysłany na serwer: ${remotePath}. Pamiętaj wysłać też config ("Wyślij na serwer" wyżej) i przeładować plugin.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ margin: 0 }}>
        <label className="checkbox">
          Nazwa folderu
          <input style={{ width: 160 }} value={folderName} onChange={(e) => setFolderName(e.target.value)} />
        </label>
        <button type="button" onClick={downloadLocally} disabled={busy}>
          <PackageOpen size={14} strokeWidth={1.75} /> {busy ? "Pracuję..." : "Pobierz bez serwera"}
        </button>
        {profileId && (
          <button type="button" onClick={uploadToServer} disabled={busy}>
            <Rocket size={14} strokeWidth={1.75} /> Wyślij jar na serwer
          </button>
        )}
      </div>
      {error && <p className="error small">{error}</p>}
      {status && <p className="status small">{status}</p>}
    </div>
  );
}
