import { ask } from "@tauri-apps/plugin-dialog";
import { Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getDefaultLandingPage, getConfirmUnsavedOnClose, setDefaultLandingPage, setConfirmUnsavedOnClose, type LandingPage } from "../lib/appSettings";
import { appVersion, openAppDataDir, uninstallApp } from "../lib/api";
import { useT, type StringKey } from "../lib/i18n";
import { useLanguage, type Language } from "../state/LanguageContext";
import { useTheme, type Theme } from "../state/ThemeContext";

const THEME_OPTIONS: Array<{ value: Theme; labelKey: StringKey; icon: typeof Sun }> = [
  { value: "light", labelKey: "settings.theme.light", icon: Sun },
  { value: "dark", labelKey: "settings.theme.dark", icon: Moon },
  { value: "system", labelKey: "settings.theme.system", icon: Monitor },
];

// "en" (i inne) czekają na faktyczne tłumaczenie reszty appki (patrz i18n.ts) - widoczne
// od razu w ustawieniach, ale nieklikalne, żeby appka nie zmieniała się na pół-przetłumaczony
// miszmasz.
const LANGUAGE_OPTIONS: Array<{ value: Language; label: string; soon?: boolean }> = [
  { value: "pl", label: "Polski" },
  { value: "en", label: "English", soon: true },
];

const LANDING_OPTIONS: Array<{ value: LandingPage; labelKey: StringKey }> = [
  { value: "dashboard", labelKey: "settings.landing.dashboard" },
  { value: "tools", labelKey: "settings.landing.tools" },
  { value: "last", labelKey: "settings.landing.last" },
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
  const t = useT();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const [version, setVersion] = useState("");
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);
  const [uninstallMsg, setUninstallMsg] = useState<string | null>(null);
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

  useEffect(() => {
    appVersion().then(setVersion).catch(() => {});
  }, []);

  async function clearLocalCache() {
    const keys = countLocalCacheKeys();
    if (keys.length === 0) {
      setCacheMsg("Nie ma nic do wyczyszczenia.");
      return;
    }
    const confirmed = await ask(
      `Usunąć ${keys.length} lokalnie zapisanych presetów/ścieżek ze wszystkich edytorów? Tego nie da się cofnąć (serwera to nie dotyczy).`,
      { title: "Wyczyścić lokalne dane?", kind: "warning" }
    );
    if (!confirmed) return;
    keys.forEach((k) => localStorage.removeItem(k));
    setCacheMsg(`Wyczyszczono ${keys.length} pozycji.`);
  }

  async function doUninstall() {
    setUninstallMsg(null);
    const confirmed = await ask(
      "To CAŁKOWICIE odinstaluje aplikację z tego komputera (nie tylko dane lokalne) i ją zamknie. Tej operacji nie da się cofnąć.",
      { title: "Odinstalować aplikację?", kind: "warning" }
    );
    if (!confirmed) return;
    try {
      await uninstallApp();
    } catch (e) {
      setUninstallMsg(String(e));
    }
  }

  return (
    <div className="page">
      <h1>{t("settings.title")}</h1>

      <div className="two-col">
        <div className="card">
          <div className="card-title">{t("settings.appearance")}</div>
          <div className="muted small" style={{ marginBottom: "0.5rem" }}>{t("settings.theme")}</div>
          <div className="row" style={{ margin: 0 }}>
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={theme === opt.value ? "active" : undefined}
                onClick={() => setTheme(opt.value)}
              >
                <opt.icon size={14} strokeWidth={1.75} /> {t(opt.labelKey)}
              </button>
            ))}
          </div>

          <div className="muted small" style={{ margin: "0.9rem 0 0.5rem" }}>{t("settings.language")}</div>
          <div className="row" style={{ margin: 0 }}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={language === opt.value ? "active" : undefined}
                disabled={opt.soon}
                title={opt.soon ? "Wkrótce - jeszcze nie przetłumaczone" : undefined}
                onClick={() => setLanguage(opt.value)}
              >
                {opt.label}
                {opt.soon && <span className="muted small"> ({t("settings.language.soon")})</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="card form">
          <div className="card-title">{t("settings.startupShutdown")}</div>
          <div className="muted small" style={{ marginBottom: "0.5rem" }}>{t("settings.defaultLandingPage")}</div>
          <select value={landingPage} onChange={(e) => changeLandingPage(e.target.value as LandingPage)}>
            {LANDING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <label className="checkbox" style={{ marginTop: "0.75rem" }}>
            <input type="checkbox" checked={confirmUnsaved} onChange={(e) => changeConfirmUnsaved(e.target.checked)} />
            {t("settings.confirmUnsavedOnClose")}
          </label>
        </div>

        <div className="card">
          <div className="card-title">{t("settings.application")}</div>
          <div className="muted small">{t("settings.version")}</div>
          <div style={{ marginBottom: "0.5rem" }}>{version || "..."}</div>
          <div className="row" style={{ margin: 0 }}>
            <button onClick={() => openAppDataDir()}>{t("settings.openDataDir")}</button>
            <button type="button" onClick={doUninstall}>
              <Trash2 size={14} strokeWidth={1.75} /> {t("settings.uninstall")}
            </button>
          </div>
          {uninstallMsg && <p className="status status-error small">{uninstallMsg}</p>}
        </div>

        <div className="card">
          <div className="card-title">{t("settings.localData")}</div>
          <p className="muted small" style={{ marginTop: 0 }}>
            {t("settings.localDataDescription")}
          </p>
          <div className="row" style={{ margin: 0 }}>
            <button type="button" onClick={clearLocalCache}>
              <Trash2 size={16} strokeWidth={1.75} /> {t("settings.clearLocalPresets")}
            </button>
          </div>
          {cacheMsg && <p className="status small">{cacheMsg}</p>}
        </div>
      </div>
    </div>
  );
}
