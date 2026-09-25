import { Blocks, Palette } from "lucide-react";
import { HashRouter, Route, Routes } from "react-router-dom";
import CloseGuard from "./components/CloseGuard";
import PromptHost from "./components/PromptModal";
import AskHost from "./components/AskModal";
import HomeRedirect from "./components/HomeRedirect";
import Layout from "./components/Layout";
import TitleBar from "./components/TitleBar";
import AccountPage from "./pages/AccountPage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import ConfigEditorPage from "./pages/ConfigEditorPage";
import ChatFilterPage from "./pages/ChatFilterPage";
import CoreSettingsPage from "./pages/CoreSettingsPage";
import CrateEditorPage from "./pages/CrateEditorPage";
import CustomItemsPage from "./pages/CustomItemsPage";
import DeployPage from "./pages/DeployPage";
import DungeonsPage from "./pages/DungeonsPage";
import EvolvingToolsPage from "./pages/EvolvingToolsPage";
import FarmingPage from "./pages/FarmingPage";
import FishingPage from "./pages/FishingPage";
import GeneratorsPage from "./pages/GeneratorsPage";
import HudPage from "./pages/HudPage";
import IslandsPage from "./pages/IslandsPage";
import LegalPage from "./pages/LegalPage";
import MarketPage from "./pages/MarketPage";
import MenuGuiPage from "./pages/MenuGuiPage";
import QuestsPage from "./pages/QuestsPage";
import RanksPage from "./pages/RanksPage";
import RedstoneItemsPage from "./pages/RedstoneItemsPage";
import ServersPage from "./pages/ServersPage";
import SettingsPage from "./pages/SettingsPage";
import PluginDetailPage from "./pages/PluginDetailPage";
import ShopEditorPage from "./pages/ShopEditorPage";
import ShopPage from "./pages/ShopPage";
import SpawnersPage from "./pages/SpawnersPage";
import SpawnWarpsPage from "./pages/SpawnWarpsPage";
import SupportPage from "./pages/SupportPage";
import ToolsHubPage from "./pages/ToolsHubPage";
import { AuthProvider, useAuth } from "./state/AuthContext";
import { DirtyProvider } from "./state/DirtyContext";
import { LanguageProvider } from "./state/LanguageContext";
import { ProfilesProvider } from "./state/ProfilesContext";
import { SidebarProvider } from "./state/SidebarContext";
import { ThemeProvider } from "./state/ThemeContext";
import "./App.css";

// Appka jest usable BEZ logowania - edycja configów, Wdrożenie (darmowe pluginy),
// Texturepack Creator, Schematics itd. to lokalne/SFTP operacje niezwiązane z kontem.
// Logowanie jest potrzebne tylko do Sklepu (kupowanie, "Moje licencje") i odbywa się
// w środku appki, na osobnej stronie /account (patrz AccountPage.tsx, link w pasku
// bocznym) - NIE w Ustawieniach i NIE na osobnym ekranie blokującym wszystko, dawna
// bramka na wejściu (Gate) celowo usunięta.
// Dawna zakładka "Licencje" (panel admina) też nie wraca - to narzędzie operatora,
// nie klienta, patrz Mainplugins/license-server/README.md (wystawianie kluczy przez curl).
function Gate() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="page" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p className="muted">Ładowanie...</p>
      </div>
    );
  }

  return (
    <>
      <CloseGuard />
      <ProfilesProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomeRedirect />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="legal/:kind" element={<LegalPage />} />
              <Route path="servers" element={<ServersPage />} />
              <Route path="shop" element={<ShopPage />} />
              <Route path="shop/:kind/:id" element={<PluginDetailPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="config" element={<ConfigEditorPage />} />
              <Route path="items" element={<ShopEditorPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route
                path="resourcepack"
                element={<ComingSoonPage title="Texturepack Creator" icon={Palette} />}
              />
              <Route
                path="schematics"
                element={<ComingSoonPage title="Budowle i schematy" icon={Blocks} />}
              />
              <Route path="tools" element={<ToolsHubPage />} />
              <Route path="crates" element={<CrateEditorPage />} />
              <Route path="market" element={<MarketPage />} />
              <Route path="spawn" element={<SpawnWarpsPage />} />
              <Route path="deploy" element={<DeployPage />} />
              <Route path="customitems" element={<CustomItemsPage />} />
              <Route path="quests" element={<QuestsPage />} />
              <Route path="islands" element={<IslandsPage />} />
              <Route path="evolvingtools" element={<EvolvingToolsPage />} />
              <Route path="generators" element={<GeneratorsPage />} />
              <Route path="redstone" element={<RedstoneItemsPage />} />
              <Route path="menu" element={<MenuGuiPage />} />
              <Route path="chatfilter" element={<ChatFilterPage />} />
              <Route path="ranks" element={<RanksPage />} />
              <Route path="spawners" element={<SpawnersPage />} />
              <Route path="dungeons" element={<DungeonsPage />} />
              <Route path="farming" element={<FarmingPage />} />
              <Route path="fishing" element={<FishingPage />} />
              <Route path="hud" element={<HudPage />} />
              <Route path="core" element={<CoreSettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </ProfilesProvider>
    </>
  );
}

function App() {
  return (
    <LanguageProvider>
      <SidebarProvider>
        <DirtyProvider>
          {/* Okienka pytań i wpisywania - ponad resztą, żeby działały też z paska tytułu (zamykanie) i podczas wczytywania. */}
          <PromptHost />
          <AskHost />
          <div className="window-frame">
            <TitleBar />
            <div className="window-body">
              <ThemeProvider>
                <AuthProvider>
                  <Gate />
                </AuthProvider>
              </ThemeProvider>
            </div>
          </div>
        </DirtyProvider>
      </SidebarProvider>
    </LanguageProvider>
  );
}

export default App;
