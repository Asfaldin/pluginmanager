import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../state/AuthContext";

/** Logowanie/rejestracja - dawniej osobny ekran blokujący całą appkę na wejściu (patrz
    App.tsx), teraz appka działa bez konta i logowanie jest potrzebne tylko do Sklepu.
    Współdzielone przez Ustawienia → Konto i okno konta w pasku bocznym (AccountModal). */
export default function AccountLoginCard({ onSuccess }: { onSuccess?: () => void }) {
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
      onSuccess?.();
    } catch {
      // błąd już wystawiony w AuthContext (error) - nic więcej tu nie robimy
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card form">
      <div className="card-title">{mode === "login" ? "Zaloguj się" : "Załóż konto"}</div>
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
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? "Chwila..." : mode === "login" ? "Zaloguj się" : "Załóż konto"}
        </button>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Nie mam konta" : "Mam już konto"}
        </button>
      </div>
    </form>
  );
}
