// Proste ustawienia appki, które nie potrzebują reaktywnego kontekstu (czytane raz w
// jednym miejscu, nie renderują nic na ich podstawie na bieżąco w wielu komponentach) -
// w przeciwieństwie do motywu (ThemeContext) czy stanu "dirty" (DirtyContext).

export type LandingPage = "dashboard" | "tools" | "last";

// Język appki (patrz LanguageContext.tsx) NIE jest tu, mimo że wzorcem pasowałby do
// reszty tego pliku - musi być reaktywny (pasek boczny i strony mają przerysować się
// natychmiast po zmianie w Ustawieniach), a zwykłe get/set jak niżej tego nie dają.

const LANDING_PAGE_KEY = "pluginmanager.defaultLandingPage";
const CONFIRM_UNSAVED_KEY = "pluginmanager.confirmUnsavedOnClose";
const LAST_PATH_KEY = "pluginmanager.lastPath";
const HAS_DEPLOYED_KEY = "pluginmanager.hasDeployed";
const HAS_TESTED_CONNECTION_KEY = "pluginmanager.hasTestedConnection";
const HAS_CONFIGURED_KEY = "pluginmanager.hasConfigured";

export function getDefaultLandingPage(): LandingPage {
  try {
    const v = localStorage.getItem(LANDING_PAGE_KEY);
    if (v === "dashboard" || v === "tools" || v === "last") return v;
  } catch {
    // localStorage niedostępny - wracamy do domyślnej wartości poniżej.
  }
  return "dashboard";
}

export function setDefaultLandingPage(value: LandingPage) {
  try {
    localStorage.setItem(LANDING_PAGE_KEY, value);
  } catch {
    // Ustawienie nie przetrwa restartu, ale appka działa dalej.
  }
}

/** Domyślnie WŁĄCZONE (bezpieczniejsze zachowanie) - brak zapisanej wartości znaczy
    "user jeszcze nie dotykał tego ustawienia", nie "wyłączył ostrzeżenia". */
export function getConfirmUnsavedOnClose(): boolean {
  try {
    return localStorage.getItem(CONFIRM_UNSAVED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setConfirmUnsavedOnClose(value: boolean) {
  try {
    localStorage.setItem(CONFIRM_UNSAVED_KEY, value ? "1" : "0");
  } catch {
    // Jak wyżej - nie krytyczne.
  }
}

export function getLastPath(): string | null {
  try {
    return localStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}

export function setLastPath(path: string) {
  try {
    localStorage.setItem(LAST_PATH_KEY, path);
  } catch {
    // Jak wyżej - nie krytyczne, "ostatnio otwarta strona" po prostu nie zadziała.
  }
}

/** Czy kiedykolwiek udało się wysłać choć jeden plugin na serwer (patrz DeployPage.tsx) -
    używane przez checklistę "Pierwsze kroki" na Dashboardzie. Jednokierunkowe (raz true,
    zostaje true) - nie ma potrzeby cofać tego, nawet jeśli ktoś potem usunie profil. */
export function getHasDeployed(): boolean {
  try {
    return localStorage.getItem(HAS_DEPLOYED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHasDeployed() {
  try {
    localStorage.setItem(HAS_DEPLOYED_KEY, "1");
  } catch {
    // Nie krytyczne - checklista po prostu nie zapamięta tego kroku między sesjami.
  }
}

/** Jak wyżej, ale dla udanego "Testuj połączenie" na Dashboardzie. */
export function getHasTestedConnection(): boolean {
  try {
    return localStorage.getItem(HAS_TESTED_CONNECTION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHasTestedConnection() {
  try {
    localStorage.setItem(HAS_TESTED_CONNECTION_KEY, "1");
  } catch {
    // Jak wyżej.
  }
}

/** Jak wyżej, ale dla pierwszego udanego zapisu configu na serwer - ustawiane w jednym
    miejscu (sftpWriteFile w api.ts), przez które przechodzi "Wyślij na serwer" ze
    wszystkich edytorów configów, więc nie trzeba tego dotykać w każdym z osobna. */
export function getHasConfigured(): boolean {
  try {
    return localStorage.getItem(HAS_CONFIGURED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHasConfigured() {
  try {
    localStorage.setItem(HAS_CONFIGURED_KEY, "1");
  } catch {
    // Jak wyżej.
  }
}
