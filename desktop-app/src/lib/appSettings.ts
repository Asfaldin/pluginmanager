// Proste ustawienia appki, które nie potrzebują reaktywnego kontekstu (czytane raz w
// jednym miejscu, nie renderują nic na ich podstawie na bieżąco w wielu komponentach) -
// w przeciwieństwie do motywu (ThemeContext) czy stanu "dirty" (DirtyContext).

export type LandingPage = "dashboard" | "tools" | "last";

const LANDING_PAGE_KEY = "pluginmanager.defaultLandingPage";
const CONFIRM_UNSAVED_KEY = "pluginmanager.confirmUnsavedOnClose";
const LAST_PATH_KEY = "pluginmanager.lastPath";

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
