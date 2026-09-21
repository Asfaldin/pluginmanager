import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { setSessionExpiredHandler, shopLogin, shopLogout, shopMe, shopRegister } from "../lib/api";
import type { CustomerInfo } from "../lib/types";

// Logowanie NIE jest już bramką na wejściu do appki (patrz App.tsx) - appka działa
// bez konta (edycja configów, Wdrożenie, Texturepack Creator itd. to lokalne/SFTP
// operacje). Konto jest potrzebne tylko do Sklepu i "Twoich pluginów", i loguje się w
// środku, na osobnej stronie /account (patrz AccountPage.tsx, link w pasku bocznym).
// Osobny panel admina (dawna zakładka "Licencje") świadomie usunięty z appki - operator
// wystawia klucze przez curl (patrz Mainplugins/license-server/README.md), appka jest
// wyłącznie dla klienta.

interface AuthContextValue {
  customer: CustomerInfo | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    shopMe()
      .then(setCustomer)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    // Token wygasły/unieważniony W TRAKCIE pracy appki (nie tylko przy starcie - to już
    // obsługuje shop_me powyżej) - patrz SESSION_EXPIRED_MARKER w api.ts/shop.rs. Bez
    // tego appka dalej "myślała", że klient jest zalogowany, mimo że kolejne wywołania
    // Sklepu/Konta i tak dostawały niejasny błąd 401.
    setSessionExpiredHandler(() => {
      setCustomer(null);
      setError("Sesja wygasła - zaloguj się ponownie.");
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      setCustomer(await shopLogin(email, password));
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      setCustomer(await shopRegister(email, password));
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await shopLogout();
    setCustomer(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{ customer, loading, error, login, register, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
