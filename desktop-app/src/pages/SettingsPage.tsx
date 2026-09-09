import { Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getDefaultLandingPage, getConfirmUnsavedOnClose, setDefaultLandingPage, setConfirmUnsavedOnClose, type LandingPage } from "../lib/appSettings";
import { appVersion, openAppDataDir, shopChangePassword } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import { useTheme, type Theme } from "../state/ThemeContext";

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Jasny", icon: Sun },
  { value: "dark", label: "Ciemny", icon: Moon },
  { value: "system", label: "Systemowy", icon: Monitor },
];

const LANDING_OPTIONS: Array<{ value: LandingPage; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "tools", label: "Twoje pluginy" },
  { value: "last", label: "Ostatnio otwarta strona" },
];

// Wszystko, co strony edytorów odkładają lokalnie (presety, ostatnio używany
// serwer/ścieżka per strona) - NIE licencje/konto (te żyją na serwerze) ani wybór
// aktywnego serwera/motywu/zwinięcia sidebara (to bieżący stan appki, nie "cache").
function countLocalCacheKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("preset:") || key.startsWith("pluginmanager:lastUsed:"))) {
      keys.push(key);
    }
  }
  return keys;
}

export default function SettingsPage() {
  const { customer, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [version, setVersion] = useState("");
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);
  const [landingPage, setLandingPageState] = useState<LandingPage>(getDefaultLandingPage);
  const [confirmUnsaved, setConfirmUnsavedState] = useState(getConfirmUnsavedOnClose);

  function changeLandingPage(value: LandingPage) {
    setLandingPageState(value);
    setDefaultLandingPage(value);
  }

  function changeConfirmUnsaved(value: boolean) {
    setConfirmUnsavedState(value);
    setConfirmUnsavedOnClose(value);
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(() => {
    appVersion().then(setVersion).catch(() => {});
  }, []);

  function clearLocalCache() {
    const keys = countLocalCacheKeys();
    if (keys.length === 0) {
      setCacheMsg("Nie ma nic do wyczyszczenia.");
      return;
    }
    if (!window.confirm(`Usunąć ${keys.length} lokalnie zapisanych presetów/ścieżek ze wszystkich edytorów? Tego nie da się cofnąć (serwera to nie dotyczy).`)) {
      return;
    }
    keys.forEach((k) => localStorage.removeItem(k));
    setCacheMsg(`Wyczyszczono ${keys.length} pozycji.`);
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwError(null);
    setPwSaved(false);
    try {
      await shopChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPwSaved(true);
    } catch (e) {
      setPwError(String(e));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Ustawienia</h1>

      <h2>Konto</h2>
      <div className="two-col">
        <div className="card">
          <div className="card-title">{customer?.email}</div>
          <div className="row">
            <button onClick={logout}>Wyloguj</button>
          </div>
        </div>

        <form onSubmit={submitPasswordChange} className="card form">
          <h2 style={{ marginTop: 0 }}>Zmień hasło</h2>
          <label>
            Aktualne hasło
            <input
              required
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label>
            Nowe hasło
            <input
              required
              minLength={8}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {pwError && <p className="error">{pwError}</p>}
          {pwSaved && !pwError && <p className="status">Hasło zmienione.</p>}
          <div className="row">
            <button type="submit" disabled={pwBusy}>
              {pwBusy ? "Zapisuję..." : "Zmień hasło"}
            </button>
          </div>
        </form>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Wygląd</h2>
      <div className="card" style={{ maxWidth: "400px" }}>
        <div className="muted small" style={{ marginBottom: "0.5rem" }}>Motyw</div>
        <div className="row" style={{ margin: 0 }}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={theme === opt.value ? "active" : undefined}
              onClick={() => setTheme(opt.value)}
            >
              <opt.icon size={14} strokeWidth={1.75} /> {opt.label}
            </button>
          ))}
        </div>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Aplikacja</h2>
      <div className="card" style={{ maxWidth: "400px" }}>
        <div className="muted small">Wersja</div>
        <div className="card-title">{version || "..."}</div>
        <div className="row">
          <button onClick={() => openAppDataDir()}>Otwórz folder danych appki</button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: "400px", marginTop: "0.75rem" }}>
        <div className="muted small" style={{ marginBottom: "0.5rem" }}>Domyślna strona po zalogowaniu</div>
        <select value={landingPage} onChange={(e) => changeLandingPage(e.target.value as LandingPage)}>
          {LANDING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ maxWidth: "400px", marginTop: "0.75rem" }}>
        <label className="checkbox">
          <input type="checkbox" checked={confirmUnsaved} onChange={(e) => changeConfirmUnsaved(e.target.checked)} />
          Ostrzegaj przed zamknięciem appki, gdy są niezapisane zmiany
        </label>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Dane lokalne</h2>
      <div className="card" style={{ maxWidth: "400px" }}>
        <p className="muted small" style={{ marginTop: 0 }}>
          Lokalnie zapisane presety i zapamiętane ścieżki serwera dla poszczególnych edytorów (nie dotyczy konta ani licencji - te żyją na serwerze).
        </p>
        <div className="row">
          <button type="button" onClick={clearLocalCache}>
            <Trash2 size={14} strokeWidth={1.75} /> Wyczyść lokalne presety
          </button>
        </div>
        {cacheMsg && <p className="status small">{cacheMsg}</p>}
      </div>
    </div>
  );
}
