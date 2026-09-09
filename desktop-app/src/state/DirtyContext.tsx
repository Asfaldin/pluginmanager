import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface DirtyContextValue {
  anyDirty: boolean;
  setPageDirty: (key: string, dirty: boolean) => void;
}

const DirtyContext = createContext<DirtyContextValue | null>(null);

/** Globalny rejestr "czy KTÓRAKOLWIEK strona ma niezapisane zmiany" - każda strona
    edytora zgłasza swój stan przez useDirtyTracking(dirty) (jedna linijka), a to tu
    trzyma sumę. Używane do ostrzegania przed zamknięciem appki - patrz CloseGuard.tsx. */
export function DirtyProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  function setPageDirty(key: string, dirty: boolean) {
    setDirtyKeys((prev) => {
      if (dirty === prev.has(key)) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return <DirtyContext.Provider value={{ anyDirty: dirtyKeys.size > 0, setPageDirty }}>{children}</DirtyContext.Provider>;
}

function useDirtyContext(): DirtyContextValue {
  const ctx = useContext(DirtyContext);
  if (!ctx) throw new Error("useDirtyTracking/useAnyDirty must be used within DirtyProvider");
  return ctx;
}

let nextKey = 0;

/** Zgłasza bieżący stan "niezapisane zmiany" TEJ strony do globalnego rejestru - jedna
    linijka `useDirtyTracking(dirty);` obok istniejącego `const dirty = ...`. Każde
    wywołanie dostaje własny, stabilny klucz instancji (nie nazwę strony - dwie strony
    tego samego typu, albo hot-reload, nadpisywałyby się nawzajem po nazwie), i czyści
    swój wpis przy odmontowaniu (np. zmiana strony), żeby stara wartość nie została
    "zawieszona" w rejestrze na zawsze. */
export function useDirtyTracking(dirty: boolean) {
  const { setPageDirty } = useDirtyContext();
  const keyRef = useRef<string>(undefined);
  if (keyRef.current === undefined) keyRef.current = `page-${nextKey++}`;

  useEffect(() => {
    const key = keyRef.current!;
    setPageDirty(key, dirty);
    return () => setPageDirty(key, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);
}

export function useAnyDirty(): boolean {
  return useDirtyContext().anyDirty;
}
