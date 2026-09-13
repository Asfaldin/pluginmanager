import { Blocks, LayoutDashboard, LogIn, Palette, Server, Settings, ShoppingCart, SlidersHorizontal, User, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import { setLastPath } from "../lib/appSettings";
import { useAuth } from "../state/AuthContext";
import { useProfiles } from "../state/ProfilesContext";

const NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/shop", label: "Sklep", icon: ShoppingCart },
  { to: "/tools", label: "Twoje pluginy", icon: Wrench },
  { to: "/resourcepack", label: "Texturepack Creator", icon: Palette },
  { to: "/schematics", label: "Budowle i schematy", icon: Blocks },
];

// Osobna grupa, dociśnięta do dołu paska (patrz .sidebar-server-nav w App.css) - tuż
// nad linią oddzielającą Konto/Ustawienia, ale WYŻEJ niż one, nie razem z nimi.
const SERVER_NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/core", label: "Ustawienia serwera", icon: SlidersHorizontal },
  { to: "/servers", label: "Serwery", icon: Server },
];

const COLLAPSE_STORAGE_KEY = "pluginmanager.sidebarCollapsed";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-link active" : "nav-link";
}

export default function Layout() {
  const { customer } = useAuth();
  const { profiles, activeProfileId, setActiveProfileId } = useProfiles();
  const location = useLocation();

  // Zapisuje bieżącą ścieżkę na każdą zmianę trasy - to jedyne źródło "ostatnio
  // otwartej strony" dla ustawienia domyślnej strony przy starcie appki (patrz
  // appSettings.ts + HomeRedirect w App.tsx), czytane dopiero przy NASTĘPNYM
  // uruchomieniu appki, nie w tej samej sesji.
  useEffect(() => {
    setLastPath(location.pathname);
  }, [location.pathname]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage niedostępny (np. tryb prywatny) - nic się nie stanie, po prostu
      // stan zwinięcia nie przetrwa restartu appki.
    }
  }, [collapsed]);

  return (
    <div className="app-shell">
      <nav className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Rozwiń" : "Zwiń"}>
          {collapsed ? "›" : "‹"}
        </button>
        <div className="sidebar-header">
          <img src={logo} alt="" className="sidebar-logo" />
          <span className="sidebar-title-text">RSMCMANAGER</span>
        </div>
        <div className="sidebar-server-picker">
          <label className="muted small">Aktywny serwer</label>
          <select value={activeProfileId} onChange={(e) => setActiveProfileId(e.target.value)}>
            <option value="">— wybierz —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={navLinkClass} title={collapsed ? item.label : undefined}>
                <span className="nav-icon">
                  <item.icon size={18} strokeWidth={1.75} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {/* Jeden wrapper na obie dolne grupy, z JEDNYM margin-top: auto na całości - gdyby
            każda grupa miała auto-margines osobno, flex rozdzieliłby wolne miejsce PO
            RÓWNO między nie, więc "Ustawienia serwera"/"Serwery" wisiałyby na środku
            zamiast tuż nad linią oddzielającą Konto/Ustawienia. */}
        <div className="sidebar-bottom-group">
          <ul className="sidebar-server-nav">
            {SERVER_NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navLinkClass} title={collapsed ? item.label : undefined}>
                  <span className="nav-icon">
                    <item.icon size={18} strokeWidth={1.75} />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="sidebar-account">
            {/* Status konta obok Ustawień na dole - osobna, pełnowymiarowa strona /account
                (patrz AccountPage.tsx), NIE Ustawienia i NIE małe okienko - profil (mail,
                wylogowanie, zmiana hasła, moje licencje) zasługuje na tyle samo miejsca
                co reszta zakładek. */}
            <NavLink to="/account" className="sidebar-account-status" title={collapsed ? (customer ? customer.email : "Zaloguj się") : undefined}>
              <span className="nav-icon">{customer ? <User size={14} strokeWidth={1.75} /> : <LogIn size={14} strokeWidth={1.75} />}</span>
              <span className="sidebar-account-status-text">{customer ? customer.email : "Zaloguj się"}</span>
            </NavLink>
            <NavLink to="/settings" className={navLinkClass} title={collapsed ? "Ustawienia" : undefined}>
              <span className="nav-icon">
                <Settings size={18} strokeWidth={1.75} />
              </span>
              <span>Ustawienia</span>
            </NavLink>
          </div>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
