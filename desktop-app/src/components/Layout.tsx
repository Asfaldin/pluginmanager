import { Blocks, LayoutDashboard, LifeBuoy, LogIn, Palette, Server, Settings, ShoppingCart, SlidersHorizontal, User, Wrench, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import AccountLoginCard from "./AccountLoginCard";
import logo from "../assets/logo.png";
import { setLastPath } from "../lib/appSettings";
import { useT, type StringKey } from "../lib/i18n";
import { useAuth } from "../state/AuthContext";
import { useProfiles } from "../state/ProfilesContext";
import { useSidebar } from "../state/SidebarContext";

// Strony, które MUSZĄ zostać dostępne mimo bramki logowania niżej - inaczej nikt nigdy
// by się nie zalogował (login jest w środku bramki, na /account) ani nie przeczytał
// Regulaminu/Polityki (link z checkboxa rejestracji w AccountLoginCard.tsx). Wsparcie też -
// to właśnie ludzie z problemami przy logowaniu najbardziej go potrzebują.
function isGateExempt(pathname: string): boolean {
  return pathname === "/account" || pathname === "/support" || pathname.startsWith("/legal/");
}

const NAV_ITEMS: Array<{ to: string; labelKey: StringKey; icon: LucideIcon; end?: boolean }> = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/shop", labelKey: "nav.shop", icon: ShoppingCart },
  { to: "/tools", labelKey: "nav.tools", icon: Wrench },
];

// Zakładki-zapowiedzi (patrz ComingSoonPage.tsx) - osobno od działających funkcji wyżej,
// żeby menu od razu pokazywało, co jest gotowe do klikania, a co na razie i tak wyląduje
// na "już wkrótce". Wymieszane z resztą wyglądały jak zepsute linki.
const SOON_ITEMS: Array<{ to: string; labelKey: StringKey; icon: LucideIcon }> = [
  { to: "/resourcepack", labelKey: "nav.resourcepack", icon: Palette },
  { to: "/schematics", labelKey: "nav.schematics", icon: Blocks },
];

// Zaraz pod wyborem "Aktywny serwer" - logicznie bliżej niego niż reszty menu (patrz render
// niżej), nie dociśnięte już do dołu paska.
const SERVER_NAV_ITEMS: Array<{ to: string; labelKey: StringKey; icon: LucideIcon }> = [
  { to: "/core", labelKey: "nav.coreSettings", icon: SlidersHorizontal },
  { to: "/servers", labelKey: "nav.servers", icon: Server },
];

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

  const { collapsed, setCollapsed } = useSidebar();
  const t = useT();

  return (
    <div className="app-shell">
      <nav className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Rozwiń" : "Zwiń"}>
          {collapsed ? "›" : "‹"}
        </button>
        <div className="sidebar-header">
          <img src={logo} alt="" className="sidebar-logo" />
          <div className="sidebar-title-block">
            <span className="sidebar-title-text">RSMCMANAGER</span>
            <span className="sidebar-title-beta">BETA</span>
          </div>
        </div>
        {customer && (
          <div className="sidebar-server-picker">
            <label className="muted small">{t("nav.activeServer")}</label>
            <select value={activeProfileId} onChange={(e) => setActiveProfileId(e.target.value)}>
              <option value="">{t("nav.chooseServer")}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={navLinkClass} title={collapsed ? t(item.labelKey) : undefined}>
                <span className="nav-icon">
                  <item.icon size={18} strokeWidth={1.75} />
                </span>
                <span>{t(item.labelKey)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <ul className="sidebar-server-nav">
          {SERVER_NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={navLinkClass} title={collapsed ? t(item.labelKey) : undefined}>
                <span className="nav-icon">
                  <item.icon size={18} strokeWidth={1.75} />
                </span>
                <span>{t(item.labelKey)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {!collapsed && <div className="sidebar-section-label">{t("nav.soonLabel")}</div>}
        <ul>
          {SOON_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => `nav-link soon${isActive ? " active" : ""}`}
                title={collapsed ? `${t(item.labelKey)} (${t("nav.soonLabel")})` : undefined}
              >
                <span className="nav-icon">
                  <item.icon size={18} strokeWidth={1.75} />
                </span>
                <span>{t(item.labelKey)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {/* margin-top: auto dociska tę grupę (Konto/Wsparcie/Ustawienia) do samego dołu
            paska, niezależnie od tego, ile pozycji jest wyżej. */}
        <div className="sidebar-bottom-group">
          <div className="sidebar-account">
            {/* Status konta obok Ustawień na dole - osobna, pełnowymiarowa strona /account
                (patrz AccountPage.tsx), NIE Ustawienia i NIE małe okienko - profil (mail,
                wylogowanie, zmiana hasła, moje licencje) zasługuje na tyle samo miejsca
                co reszta zakładek. */}
            <NavLink
              to="/account"
              className={({ isActive }) => `sidebar-account-status${isActive ? " active" : ""}`}
              title={collapsed ? (customer ? customer.email : t("nav.login")) : undefined}
            >
              <span className="nav-icon">{customer ? <User size={14} strokeWidth={1.75} /> : <LogIn size={14} strokeWidth={1.75} />}</span>
              <span className="sidebar-account-status-text">{customer ? customer.email : t("nav.login")}</span>
            </NavLink>
            <NavLink to="/support" className={navLinkClass} title={collapsed ? t("nav.support") : undefined}>
              <span className="nav-icon">
                <LifeBuoy size={18} strokeWidth={1.75} />
              </span>
              <span>{t("nav.support")}</span>
            </NavLink>
            <NavLink to="/settings" className={navLinkClass} title={collapsed ? t("nav.settings") : undefined}>
              <span className="nav-icon">
                <Settings size={18} strokeWidth={1.75} />
              </span>
              <span>{t("nav.settings")}</span>
            </NavLink>
          </div>
        </div>
      </nav>
      <main className="content">
        {customer || isGateExempt(location.pathname) ? (
          <Outlet />
        ) : (
          <div className="app-gate-wrap">
            <div className="app-gate-overlay">
              <div style={{ width: "360px" }}>
                <AccountLoginCard />
              </div>
            </div>
            <div className="app-gate-dimmed" aria-hidden="true">
              <Outlet />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
