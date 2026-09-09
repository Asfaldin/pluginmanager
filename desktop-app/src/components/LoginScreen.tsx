import { useState } from "react";
import { useAuth } from "../state/AuthContext";

/** Pełnoekranowy ekran logowania - blokuje dostęp do CAŁEJ appki, dopóki użytkownik się nie zaloguje. */
export default function LoginScreen() {
  const { login, register, error } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="page" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <form onSubmit={submit} className="card form" style={{ width: "360px" }}>
        <h1 style={{ marginTop: 0 }}>PluginManager</h1>
        <h2>{mode === "login" ? "Logowanie" : "Nowe konto"}</h2>
        <label>
          E-mail
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Hasło
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
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
    </div>
  );
}
