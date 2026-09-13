import { Navigate } from "react-router-dom";
import { getDefaultLandingPage, getLastPath } from "../lib/appSettings";
import DashboardPage from "../pages/DashboardPage";

/** Element trasy indeksowej ("/") - zamiast zawsze Dashboardu, respektuje ustawienie
    "Domyślna strona przy starcie appki" (patrz Ustawienia). "Ostatnio otwarta" pamięta
    ścieżkę z POPRZEDNIEJ sesji (patrz setLastPath w Layout.tsx) - jeśli jej nie ma
    (pierwsze uruchomienie) albo wskazuje z powrotem na "/", po prostu pokazuje
    Dashboard zamiast przekierowywać donikąd. */
export default function HomeRedirect() {
  const pref = getDefaultLandingPage();

  if (pref === "tools") {
    return <Navigate to="/tools" replace />;
  }

  if (pref === "last") {
    const last = getLastPath();
    if (last && last !== "/" && last !== "") {
      return <Navigate to={last} replace />;
    }
  }

  return <DashboardPage />;
}
