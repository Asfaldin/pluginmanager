import { Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import logo from "../assets/logo.png";
import { useAuth } from "../state/AuthContext";

const BRAND_POINTS = [
  "Edytory configów wszystkich pluginów - bez ręcznego grzebania w YAML-u",
  "Wysyłka pluginów na serwer przez SFTP jednym kliknięciem",
  "20 gotowych pluginów wbudowanych w appkę",
];

/** Pełnoekranowy ekran logowania - blokuje dostęp do CAŁEJ appki, dopóki użytkownik się
    nie zaloguje. Układ dwukolumnowy: marka/opis po lewej, formularz po prawej; na wąskim
    oknie lewy panel znika i zostaje sam formularz. */
export default function LoginScreen() {
  const { login, register, error } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch {
      // błąd już wystawiony w AuthContext (error) - nic więcej tu nie robimy
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <div className="auth-brand-content">
          <img src={logo} alt="" className="auth-logo" />
          <h1>PluginManager</h1>
          <p>Zarządzaj pluginami i konfiguracją serwera Minecraft z jednego miejsca.</p>
          <ul className="auth-brand-points">
            {BRAND_POINTS.map((pt) => (
              <li key={pt}>
                <Check size={16} strokeWidth={2} />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-form-side">
        <form onSubmit={submit} className="card form auth-card">
          <img src={logo} alt="" className="auth-card-logo" />
          <h2 style={{ marginTop: 0 }}>{mode === "login" ? "Zaloguj się" : "Załóż konto"}</h2>
          <p className="muted small" style={{ marginTop: "-0.5rem" }}>
            {mode === "login"
              ? "Zaloguj się kontem ze sklepu, żeby wejść do aplikacji."
              : "Konto ze sklepu działa też jako logowanie do aplikacji."}
          </p>

          <label>
            E-mail
            <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Hasło
            <span className="auth-password-field">
              <input
                required
                minLength={8}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-password-toggle"
                title={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
              </button>
            </span>
          </label>
          {mode === "register" && <p className="muted small" style={{ marginTop: "-0.3rem" }}>Minimum 8 znaków.</p>}

          {error && <p className="error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "Chwila..." : mode === "login" ? "Zaloguj się" : "Załóż konto"}
          </button>

          <p className="muted small" style={{ textAlign: "center", margin: 0 }}>
            {mode === "login" ? "Nie masz jeszcze konta? " : "Masz już konto? "}
            <button type="button" className="auth-mode-link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Załóż je" : "Zaloguj się"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
