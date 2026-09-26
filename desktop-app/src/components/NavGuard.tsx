import { useEffect, useRef } from "react";
import { useAnyDirty } from "../state/DirtyContext";
import { ask } from "./AskModal";

/** Bez elementów wizualnych - gdy którakolwiek strona ma niezapisane albo niewysłane zmiany (DirtyContext),
    kliknięcie linku do innej strony aplikacji (menu z lewej, „← Twoje pluginy”) najpierw pyta „na pewno?”.
    Po wyjściu strona wczytuje się od nowa z serwera, więc takie zmiany by przepadły.
    Łapie kliknięcia na całym dokumencie (faza przechwytywania), zanim dotrą do routera. */
export default function NavGuard() {
  const anyDirty = useAnyDirty();
  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;

  useEffect(() => {
    async function onClick(e: MouseEvent) {
      if (!anyDirtyRef.current || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const link = (e.target as HTMLElement | null)?.closest("a[href]");
      const href = link?.getAttribute("href");
      // Tylko linki wewnątrz aplikacji (HashRouter: "#/...") prowadzące na inną stronę.
      if (!href || !href.startsWith("#/") || link?.getAttribute("target") === "_blank") return;
      if (href === window.location.hash) return;
      e.preventDefault();
      e.stopPropagation();
      const leave = await ask("Masz niezapisane zmiany, których nie ma na serwerze. Po wyjściu z tej strony znikną. Na pewno wyjść?", {
        title: "Niezapisane zmiany",
        kind: "warning",
        okLabel: "Wyjdź bez zapisywania",
        cancelLabel: "Zostań",
      });
      if (leave) window.location.hash = href;
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
