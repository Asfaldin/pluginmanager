import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "./AskModal";
import { useEffect, useRef } from "react";
import { getConfirmUnsavedOnClose } from "../lib/appSettings";
import { useAnyDirty } from "../state/DirtyContext";

/** Bez elementów wizualnych - tylko podpina się pod zamknięcie okna appki i, jeśli
    ustawienie jest włączone (patrz Ustawienia) ORAZ którakolwiek strona ma niezapisane
    zmiany (patrz DirtyContext), pyta o potwierdzenie zamiast zamykać appkę od razu.
    Listener rejestrowany RAZ (nie chcemy go odpinać/podpinać przy każdej zmianie
    dirty) - anyDirtyRef trzyma dla niego zawsze najświeższą wartość mimo to.
    getConfirmUnsavedOnClose() czytane świeżo w handlerze (nie reaktywnie) - liczy się
    tylko wartość W MOMENCIE zamykania, nie na bieżąco. */
export default function CloseGuard() {
  const anyDirty = useAnyDirty();
  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;

  useEffect(() => {
    const win = getCurrentWindow();
    // .catch() na rejestracji - jeśli by się nie powiodła (np. brak uprawnienia w tym
    // środowisku), appka ma po prostu działać dalej bez tego zabezpieczenia zamiast
    // zostawiać niezłapane odrzucenie obietnicy.
    const unlistenPromise = win
      .onCloseRequested(async (event) => {
        if (!anyDirtyRef.current || !getConfirmUnsavedOnClose()) return;
        event.preventDefault();
        try {
          const confirmed = await ask("Masz niezapisane zmiany w co najmniej jednym edytorze. Zamknąć appkę mimo to?", {
            title: "Niezapisane zmiany",
            kind: "warning",
          });
          if (confirmed) {
            await win.destroy();
          }
        } catch {
          // Dialog się nie pokazał - lepiej zostawić appkę otwartą niż ją ubić bez pytania.
        }
      })
      .catch(() => undefined);
    return () => {
      unlistenPromise.then((unlisten) => unlisten?.());
    };
  }, []);

  return null;
}
