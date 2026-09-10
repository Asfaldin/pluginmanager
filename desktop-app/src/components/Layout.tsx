import { LayoutDashboard, Server, Settings, ShoppingCart, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import { setLastPath } from "../lib/appSettings";
import { useProfiles } from "../state/ProfilesContext";

const NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/shop", label: "Sklep", icon: ShoppingCart },
  { to: "/tools", label: "Twoje pluginy", icon: Wrench },
  { to: "/servers", label: "Serwery", icon: Server },
];

const COLLAPSE_STORAGE_KEY = "pluginmanager.sidebarCollapsed";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-link active" : "nav-link";
}

export default function Layout() {
  const { profiles, activeProfileId, setActiveProfileId } = useProfiles();
  const location = useLocation();

  // Zapisuje bieżącą ścieżkę na każdą zmianę trasy - to jedyne źródło "ostatnio
  // otwartej strony" dla ustawienia domyślnej strony po zalogowaniu (patrz
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
          <span className="sidebar-title-text">PluginManager</span>
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
        <div className="sidebar-account">
          <NavLink to="/settings" className={navLinkClass} title={collapsed ? "Ustawienia" : undefined}>
            <span className="nav-icon">
              <Settings size={18} strokeWidth={1.75} />
            </span>
            <span>Ustawienia</span>
          </NavLink>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
