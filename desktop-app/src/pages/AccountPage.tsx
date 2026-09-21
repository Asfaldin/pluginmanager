import { Eye, EyeOff, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import AccountLoginCard from "../components/AccountLoginCard";
import { StatusBar } from "../components/EditorBits";
import { shopChangePassword, shopMyLicenses } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import type { LicenseRecord } from "../lib/types";

/** Osobna, pełnowymiarowa strona konta - jak Ustawienia, ale nie one (patrz Layout.tsx,
    status konta w pasku bocznym prowadzi tu, nie do /settings). Logowanie/rejestracja
    (gdy brak konta) albo profil: mail, wylogowanie, zmiana hasła i "moje licencje". */
export default function AccountPage() {
  const { customer, logout } = useAuth();
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [licensesLoading, setLicensesLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setLicensesLoading(true);
    shopMyLicenses()
      .then(setLicenses)
      .catch(() => setLicenses([]))
      .finally(() => setLicensesLoading(false));
  }, [customer]);

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSaved(false);
    if (newPassword !== newPasswordConfirm) {
      setPwError("Nowe hasła się nie zgadzają.");
      return;
    }
    setPwBusy(true);
    try {
      await shopChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPwSaved(true);
    } catch (e) {
      setPwError(String(e));
    } finally {
      setPwBusy(false);
    }
  }

  if (!customer) {
    return (
      <div className="page" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "calc(100vh - 4rem)" }}>
        <div style={{ width: "360px" }}>
          <h1 style={{ textAlign: "center" }}>Konto</h1>
          <AccountLoginCard />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Profil</h1>

      <div className="two-col">
        <div className="card">
          <div className="card-title">{customer.email}</div>
          <div className="row">
            <button onClick={logout}>
              <LogOut size={14} strokeWidth={1.75} /> Wyloguj
            </button>
          </div>
        </div>

        <form onSubmit={submitPasswordChange} className="card form">
          <h2 style={{ marginTop: 0 }}>Zmień hasło</h2>
          <label>
            Aktualne hasło
            <input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label>
            Nowe hasło
            <span className="auth-password-field">
              <input
                required
                minLength={8}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
          <label>
            Powtórz nowe hasło
            <input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
            />
          </label>
          {pwError && <StatusBar text={pwError} tone="error" onClose={() => setPwError(null)} />}
          {pwSaved && !pwError && <StatusBar text="Hasło zmienione." onClose={() => setPwSaved(false)} />}
          <div className="row">
            <button type="submit" disabled={pwBusy}>
              {pwBusy ? "Zapisuję..." : "Zmień hasło"}
            </button>
          </div>
        </form>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Moje licencje</h2>
      {!licensesLoading && licenses.length === 0 && <p className="muted">Nie masz jeszcze żadnej licencji.</p>}
      <div className="card-grid">
        {licenses.map((l) => (
          <div key={l.key} className="card">
            <div className="card-title">{l.plugin === "*" ? "Wszystko (Ultimate)" : l.plugin}</div>
            <div className="muted small">
              Klucz: <code>{l.key}</code>
            </div>
            <div className="muted small">{l.billingType === "subscription" ? "Subskrypcja" : "Zakup jednorazowy"}</div>
            <div className="row">
              <span className={l.status === "active" ? "badge badge-on" : "badge"}>
                {l.status === "active" ? "aktywna" : "nieaktywna"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
