import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { StatusBar } from "./EditorBits";
import { shopForgotPassword, shopResetPassword } from "../lib/api";
import { useAuth } from "../state/AuthContext";

type Mode = "login" | "register" | "forgot" | "reset";

/** Logowanie/rejestracja/reset hasła - dawniej osobny ekran blokujący całą appkę na
    wejściu (patrz App.tsx), teraz appka działa bez konta i logowanie jest potrzebne
    tylko do Sklepu/Twoich pluginów. Współdzielone przez Ustawienia → Konto, /account i
    /tools (gdy niezalogowany).

    Reset hasła działa na kodzie z maila zamiast linku - appka nie ma własnej domeny/
    web frontu, więc link "otwórz w przeglądarce" donikąd by nie prowadził; kod z maila
    wkleja się bezpośrednio tutaj (patrz shop_forgot_password/shop_reset_password w
    shop.rs i /api/auth/forgot-password w license-server). */
export default function AccountLoginCard({ onSuccess }: { onSuccess?: () => void }) {
  const { login, register, error, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
    setResetCode("");
    setLocalError(null);
    setLocalStatus(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setLocalStatus(null);

    if (mode === "register") {
      if (password !== confirmPassword) {
        setLocalError("Hasła się nie zgadzają.");
        return;
      }
      if (!acceptedTerms) {
        setLocalError("Zaakceptuj Regulamin i Politykę Prywatności, żeby założyć konto.");
        return;
      }
    }
    if (mode === "reset" && password !== confirmPassword) {
      setLocalError("Hasła się nie zgadzają.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
        onSuccess?.();
      } else if (mode === "register") {
        await register(email, password);
        onSuccess?.();
      } else if (mode === "forgot") {
        await shopForgotPassword(email);
        setLocalStatus("Jeśli konto z tym adresem istnieje, wysłaliśmy kod na e-mail (ważny 30 minut). Wklej go poniżej razem z nowym hasłem.");
        setMode("reset");
      } else {
        await shopResetPassword(resetCode.trim(), password);
        setLocalStatus("Hasło zostało zmienione - możesz się teraz zalogować.");
        switchMode("login");
      }
    } catch (e) {
      if (mode === "forgot" || mode === "reset") setLocalError(String(e));
      // login/register: błąd już wystawiony w AuthContext (error)
    } finally {
      setBusy(false);
    }
  }

  const title = { login: "Zaloguj się", register: "Załóż konto", forgot: "Zapomniałem hasła", reset: "Ustaw nowe hasło" }[mode];
  const subtitle = {
    login: "Zaloguj się do swojego konta.",
    register: "Załóż konto, żeby kupować pluginy i zarządzać swoimi licencjami.",
    forgot: "Podaj e-mail, na który wyślemy kod resetu hasła.",
    reset: "Wklej kod z maila i ustaw nowe hasło.",
  }[mode];

  return (
    <form onSubmit={submit} className="card form">
      <div className="card-title">{title}</div>
      <p className="muted small auth-card-subtitle">{subtitle}</p>

      {(mode === "login" || mode === "register" || mode === "forgot") && (
        <label>
          E-mail
          <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}

      {mode === "reset" && (
        <label>
          Kod z maila
          <input required value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="wklej kod z wiadomości e-mail" />
        </label>
      )}

      {(mode === "login" || mode === "register" || mode === "reset") && (
        <label>
          <span className="auth-label-row">
            <span>{mode === "reset" ? "Nowe hasło" : "Hasło"}</span>
            {mode === "login" && (
              <button type="button" className="auth-inline-link" onClick={() => switchMode("forgot")}>
                Zapomniałem hasła
              </button>
            )}
          </span>
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
      )}

      {(mode === "register" || mode === "reset") && (
        <label>
          Powtórz hasło
          <input
            required
            minLength={8}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
      )}

      {(mode === "register" || mode === "reset") && <p className="muted small" style={{ marginTop: "-0.3rem" }}>Minimum 8 znaków.</p>}

      {mode === "register" && (
        <label className="checkbox">
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
          <span>
            Akceptuję <Link to="/legal/terms">Regulamin</Link> i <Link to="/legal/privacy">Politykę Prywatności</Link>.
          </span>
        </label>
      )}

      {(error || localError) && (
        <StatusBar text={(localError ?? error) as string} tone="error" onClose={() => (localError ? setLocalError(null) : clearError())} />
      )}
      {localStatus && <StatusBar text={localStatus} onClose={() => setLocalStatus(null)} />}

      <button type="submit" className="auth-submit" disabled={busy}>
        {busy
          ? "Chwila..."
          : mode === "login"
            ? "Zaloguj się"
            : mode === "register"
              ? "Załóż konto"
              : mode === "forgot"
                ? "Wyślij kod"
                : "Ustaw nowe hasło"}
      </button>
      <p className="auth-switch-line">
        {mode === "login" && (
          <>
            Nie masz konta?{" "}
            <button type="button" className="auth-mode-link" onClick={() => switchMode("register")}>
              Zarejestruj się
            </button>
          </>
        )}
        {mode === "register" && (
          <>
            Masz już konto?{" "}
            <button type="button" className="auth-mode-link" onClick={() => switchMode("login")}>
              Zaloguj się
            </button>
          </>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button type="button" className="auth-mode-link" onClick={() => switchMode("login")}>
            Wróć do logowania
          </button>
        )}
      </p>
    </form>
  );
}
