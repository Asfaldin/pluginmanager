import { useLanguage } from "../state/LanguageContext";

// Słownik dwóch języków appki (patrz LanguageContext.tsx) - na razie obejmuje pasek
// boczny, Dashboard i Ustawienia (najbardziej widoczne miejsca, patrz rozmowa o
// ustawieniach językowych). Reszta appki (27 edytorów configów) zostaje na razie po
// polsku - to głęboko techniczne narzędzia, gdzie priorytetem nie jest angielski,
// a przepisanie wszystkich naraz to tygodnie roboty. Dokładanie kolejnych stron do i18n:
// dopisz klucze tutaj, zamień stringi w JSX na t("klucz").
export const STRINGS = {
  // Pasek boczny (Layout.tsx)
  "nav.dashboard": { pl: "Dashboard", en: "Dashboard" },
  "nav.shop": { pl: "Sklep", en: "Shop" },
  "nav.tools": { pl: "Twoje pluginy", en: "Your plugins" },
  "nav.coreSettings": { pl: "Ustawienia serwera", en: "Server settings" },
  "nav.servers": { pl: "Serwery", en: "Servers" },
  "nav.soonLabel": { pl: "Wkrótce", en: "Coming soon" },
  "nav.resourcepack": { pl: "Texturepack Creator", en: "Texturepack Creator" },
  "nav.schematics": { pl: "Budowle i schematy", en: "Structures & schematics" },
  "nav.support": { pl: "Wsparcie", en: "Support" },
  "nav.settings": { pl: "Ustawienia", en: "Settings" },
  "nav.login": { pl: "Zaloguj się", en: "Log in" },
  "nav.activeServer": { pl: "Aktywny serwer", en: "Active server" },
  "nav.chooseServer": { pl: "- wybierz -", en: "- choose -" },

  // Dashboard (DashboardPage.tsx)
  "dashboard.welcome": { pl: "Witaj", en: "Welcome" },
  "dashboard.subtitle": {
    pl: "Skrót do tego, co najważniejsze - status serwerów i licencje.",
    en: "A shortcut to what matters most - server status and licenses.",
  },
  "dashboard.firstSteps": { pl: "Pierwsze kroki", en: "First steps" },
  "dashboard.step.connectServer": { pl: "Połącz serwer", en: "Connect a server" },
  "dashboard.step.testConnection": { pl: "Przetestuj połączenie", en: "Test the connection" },
  "dashboard.step.configureFirstPlugin": { pl: "Skonfiguruj pierwszy plugin", en: "Configure your first plugin" },
  "dashboard.step.deploy": { pl: "Wrzuć na serwer", en: "Deploy to the server" },
  "dashboard.freePluginsOnly": {
    pl: "Korzystasz na razie tylko z darmowych pluginów.",
    en: "You're currently only using free plugins.",
  },
  "dashboard.checkShop": { pl: "Zajrzyj do Sklepu", en: "Check out the Shop" },
  "dashboard.configuredServers": { pl: "skonfigurowanych serwerów", en: "configured servers" },
  "dashboard.activeLicenses": { pl: "aktywnych licencji", en: "active licenses" },
  "dashboard.freeAlwaysAvailable": { pl: "darmowych zawsze dostępnych", en: "free ones always available" },
  "dashboard.availableEditors": { pl: "dostępnych edytorów", en: "available editors" },
  "dashboard.servers": { pl: "Serwery", en: "Servers" },
  "dashboard.loading": { pl: "Ładowanie...", en: "Loading..." },
  "dashboard.noServerYet": { pl: "Nie masz jeszcze skonfigurowanego serwera.", en: "You haven't set up a server yet." },
  "dashboard.addServer": { pl: "Dodaj serwer", en: "Add server" },
  "dashboard.testConnection": { pl: "Testuj połączenie", en: "Test connection" },
  "dashboard.testing": { pl: "Sprawdzam...", en: "Testing..." },
  "dashboard.ecosystem": { pl: "Ekosystem pluginów", en: "Plugin ecosystem" },
  "dashboard.ecosystemSubtitle": {
    pl: 'Co masz, co jest zablokowane, i które pluginy realnie się ze sobą łączą (nie samo "wymaga Core" - to dotyczy prawie wszystkich).',
    en: 'What you have, what\'s locked, and which plugins actually connect to each other (not just "requires Core" - that applies to almost all of them).',
  },

  // Ustawienia (SettingsPage.tsx)
  "settings.title": { pl: "Ustawienia", en: "Settings" },
  "settings.appearance": { pl: "Wygląd", en: "Appearance" },
  "settings.theme": { pl: "Motyw", en: "Theme" },
  "settings.theme.light": { pl: "Jasny", en: "Light" },
  "settings.theme.dark": { pl: "Ciemny", en: "Dark" },
  "settings.theme.system": { pl: "Systemowy", en: "System" },
  "settings.language": { pl: "Język", en: "Language" },
  "settings.language.soon": { pl: "wkrótce", en: "coming soon" },
  "settings.startupShutdown": { pl: "Uruchamianie i zamykanie", en: "Startup & shutdown" },
  "settings.defaultLandingPage": { pl: "Domyślna strona przy starcie appki", en: "Default page on startup" },
  "settings.landing.dashboard": { pl: "Dashboard", en: "Dashboard" },
  "settings.landing.tools": { pl: "Twoje pluginy", en: "Your plugins" },
  "settings.landing.last": { pl: "Ostatnio otwarta strona", en: "Last opened page" },
  "settings.confirmUnsavedOnClose": {
    pl: "Ostrzegaj przed zamknięciem appki, gdy są niezapisane zmiany",
    en: "Warn before closing the app when there are unsaved changes",
  },
  "settings.application": { pl: "Aplikacja", en: "Application" },
  "settings.version": { pl: "Wersja", en: "Version" },
  "settings.openDataDir": { pl: "Otwórz folder danych appki", en: "Open app data folder" },
  "settings.uninstall": { pl: "Usuń aplikację", en: "Uninstall app" },
  "settings.localData": { pl: "Dane lokalne", en: "Local data" },
  "settings.localDataDescription": {
    pl: "Lokalnie zapisane presety i zapamiętane ścieżki serwera dla poszczególnych edytorów (nie dotyczy konta ani licencji - te żyją na serwerze).",
    en: "Locally saved presets and remembered server paths for individual editors (doesn't affect your account or licenses - those live on the server).",
  },
  "settings.clearLocalPresets": { pl: "Wyczyść lokalne presety", en: "Clear local presets" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function useT() {
  const { language } = useLanguage();
  return (key: StringKey): string => STRINGS[key][language];
}
