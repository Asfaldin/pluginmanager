import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";

/** Bezpośrednie zamknięcie appki (destroy(), nie close()) - pyta samo o niezapisane
    zmiany i pomija zdarzenie onCloseRequested (patrz CloseGuard.tsx), więc działa nawet
    gdyby tamten mechanizm się zablokował/zgubił. Wołane z dwóch miejsc (krzyżyk w
    TitleBar.tsx i "Zamknij aplikację" w SettingsPage.tsx) - stąd wspólna funkcja zamiast
    dwóch osobnych implementacji, które mogłyby się z czasem rozjechać. */
export async function quitApp(anyDirty: boolean): Promise<void> {
  if (
    anyDirty &&
    !(await ask("Masz niezapisane zmiany w co najmniej jednym edytorze. Zamknąć appkę mimo to?", {
      title: "Niezapisane zmiany",
      kind: "warning",
    }))
  ) {
    return;
  }
  await getCurrentWindow().destroy();
}
