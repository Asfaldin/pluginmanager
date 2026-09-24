import { Save } from "lucide-react";
import { StatusBar } from "../components/EditorBits";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { showPrompt } from "../components/PromptModal";
import { sftpReadFile, sftpWriteFile } from "../lib/api";
import {
  CURRENCY_PRESETS,
  parseCommandsYml,
  readCurrency,
  readSetting,
  serializeCommandsYml,
  writeSetting,
  type CommandRow,
} from "../lib/coreSettings";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

interface Loaded {
  configText: string;
  language: string;
  economy: string;
  currency: string;
  commands: CommandRow[];
}

const EMPTY: Loaded = { configText: "", language: "en", economy: "own", currency: "$", commands: [] };

function coreDir(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsCore`;
}

export default function CoreSettingsPage() {
  const { profiles, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [server, setServer] = useState<Loaded>(EMPTY);
  const [language, setLanguage] = useState("en");
  const [economy, setEconomy] = useState("own");
  const [currency, setCurrency] = useState("$");
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  const langChanged = language !== server.language;
  const ecoChanged = economy !== server.economy;
  const curChanged = currency !== server.currency;
  const cmdChanged = serializeCommandsYml(commands) !== serializeCommandsYml(server.commands);
  const dirty = langChanged || ecoChanged || curChanged || cmdChanged;
  useDirtyTracking(dirty);

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setPluginsPath(p.remote_plugins_path);
    load(id, p.remote_plugins_path);
  }

  async function load(pid = profileId, path = pluginsPath) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const dir = coreDir(path);
      const configText = await sftpReadFile(pid, `${dir}/config.yml`);
      const commandsText = await sftpReadFile(pid, `${dir}/commands.yml`).catch(() => "");
      const loaded: Loaded = {
        configText,
        language: readSetting(configText, "language") ?? "en",
        economy: readSetting(configText, "economy") ?? "own",
        currency: readCurrency(configText),
        commands: parseCommandsYml(commandsText),
      };
      setServer(loaded);
      setLanguage(loaded.language);
      setEconomy(loaded.economy);
      setCurrency(loaded.currency);
      setCommands(loaded.commands);
    } catch (e) {
      setStatus(`Nie udało się wczytać ustawień core (${String(e)}). Czy na serwerze jest nowa wersja MainpluginsCore?`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoLoadedRef.current || !profileId || !profiles.some((p) => p.id === profileId)) return;
    autoLoadedRef.current = true;
    selectProfile(profileId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, profileId]);

  async function publish() {
    if (!profileId || !pluginsPath) return;
    setBusy(true);
    setStatus(null);
    try {
      const dir = coreDir(pluginsPath);
      const hints: string[] = [];
      if (langChanged || ecoChanged || curChanged) {
        let text = server.configText;
        if (langChanged) text = writeSetting(text, "language", language);
        if (ecoChanged) text = writeSetting(text, "economy", economy);
        if (curChanged) text = writeSetting(text, "currency", JSON.stringify(currency));
        await sftpWriteFile(profileId, `${dir}/config.yml`, text);
        setServer((s) => ({ ...s, configText: text }));
        if (langChanged || curChanged) hints.push("język i waluta: wpisz w konsoli serwera @reloadlang");
        if (ecoChanged) hints.push("pieniądze: zrestartuj serwer");
      }
      if (cmdChanged) {
        await sftpWriteFile(profileId, `${dir}/commands.yml`, serializeCommandsYml(commands));
        hints.push("komendy: zrestartuj serwer");
      }
      setServer((s) => ({ ...s, language, economy, currency, commands }));
      setStatus(`Wysłano na serwer. Żeby zadziałało - ${hints.join("; ")}.`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function revert() {
    setLanguage(server.language);
    setEconomy(server.economy);
    setCurrency(server.currency);
    setCommands(server.commands);
    setStatus("Przywrócono stan z serwera.");
  }

  function setRow(i: number, patch: Partial<CommandRow>) {
    setCommands(commands.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }

  async function addRow() {
    const command = await showPrompt("Oryginalna nazwa komendy (np. sklep albo @reloadsklep):");
    if (!command?.trim()) return;
    setCommands([...commands, { command: command.trim().toLowerCase(), name: "", aliases: [], enabled: true }]);
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Ustawienia serwera</h1>
      <p className="muted">Język, pieniądze i nazwy komend wszystkich pluginów Mainplugins.</p>

      <div className="row">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={revert} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
      </div>

      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}

      <div className="two-col">
        <div className="card form">
          <h2>Język serwera</h2>
          <p className="muted small">W tym języku pluginy piszą do graczy na czacie.</p>
          <label className="checkbox">
            <input type="radio" name="lang" checked={language === "en"} onChange={() => setLanguage("en")} />
            English
          </label>
          <label className="checkbox">
            <input type="radio" name="lang" checked={language === "pl"} onChange={() => setLanguage("pl")} />
            Polski
          </label>
          {!["en", "pl"].includes(language) && (
            <p className="muted small">Na serwerze ustawiony jest własny język: „{language}”.</p>
          )}

          <h2 style={{ marginTop: "1.5rem" }}>Pieniądze</h2>
          <label className="checkbox">
            <input type="radio" name="eco" checked={economy === "own"} onChange={() => setEconomy("own")} />
            Nasza kasa (domyślnie)
          </label>
          <label className="checkbox">
            <input type="radio" name="eco" checked={economy === "vault"} onChange={() => setEconomy("vault")} />
            Kasa innego pluginu przez Vault (np. EssentialsX)
          </label>
          <p className="muted small">
            Przy kasie innego pluginu nie działa ranking najbogatszych graczy. Potrzebne są pluginy Vault i ten z kasą.
            Zmiana działa po restarcie serwera.
          </p>

          <h2 style={{ marginTop: "1.5rem" }}>Znaczek waluty</h2>
          <p className="muted small">Pokazuje się przy każdej kwocie we wszystkich pluginach: w Sklepie, na Targu, w Questach, w portfelu i przy przelewach.</p>
          <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
            {CURRENCY_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`ci-view-toggle${currency === p.value ? " on" : ""}`}
                onClick={() => setCurrency(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label>
            Własny znaczek
            <input
              value={currency}
              maxLength={12}
              placeholder="$"
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <p className="muted small">
            Spacja na początku robi odstęp od liczby. Tak zobaczą to gracze: <b>100{currency}</b>, <b>2,500{currency}</b>
          </p>
        </div>

        <div className="card">
          <h2>Komendy</h2>
          <p className="muted small">
            Nazwa dla graczy, dodatkowe nazwy (po przecinku) i czy komenda działa. Zmiany działają po restarcie serwera.
          </p>
          <table className="ci-table">
            <thead>
              <tr>
                <th>Komenda</th>
                <th>Nazwa dla graczy</th>
                <th>Dodatkowe nazwy</th>
                <th>Włączona</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {commands.map((r, i) => (
                <tr key={`${r.command}-${i}`} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                  <td>/{r.command}</td>
                  <td>
                    <input
                      value={r.name}
                      placeholder={r.command}
                      onChange={(e) => setRow(i, { name: e.target.value.trim().toLowerCase() })}
                    />
                  </td>
                  <td>
                    {/* Zapis po wyjściu z pola - przy zapisie na każdy znak przecinek od razu by znikał. */}
                    <input
                      key={r.aliases.join(",")}
                      defaultValue={r.aliases.join(", ")}
                      placeholder="np. sklep, buy"
                      onBlur={(e) =>
                        setRow(i, {
                          aliases: e.target.value
                            .split(",")
                            .map((a) => a.trim().toLowerCase())
                            .filter(Boolean),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input type="checkbox" checked={r.enabled} onChange={(e) => setRow(i, { enabled: e.target.checked })} />
                  </td>
                  <td>
                    <button type="button" onClick={() => setCommands(commands.filter((_, ri) => ri !== i))} title="Usuń z listy (komenda wraca do domyślnej nazwy)">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addRow} disabled={!profileId}>
            + Dodaj komendę
          </button>
        </div>
      </div>
    </div>
  );
}
