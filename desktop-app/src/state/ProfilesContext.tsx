import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { listProfiles } from "../lib/api";
import type { ServerProfile } from "../lib/types";

const ACTIVE_PROFILE_KEY = "pluginmanager.activeProfileId";

interface ProfilesContextValue {
  profiles: ServerProfile[];
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Serwer aktywny GLOBALNIE dla całej appki - wybrany raz (patrz selektor w pasku
   * bocznym, Layout.tsx), każda podstrona z edytorem configu czyta go stąd zamiast
   * trzymać własny, niezależny wybór. Persystowany w localStorage, więc przetrwa
   * restart appki.
   */
  activeProfileId: string;
  setActiveProfileId: (id: string) => void;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProfileId, setActiveProfileIdState] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_PROFILE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setActiveProfileId = useCallback((id: string) => {
    setActiveProfileIdState(id);
    try {
      localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    } catch {
      // localStorage niedostępny - wybór przetrwa tylko do końca sesji appki.
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProfiles(await listProfiles());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ProfilesContext.Provider value={{ profiles, loading, refresh, activeProfileId, setActiveProfileId }}>
      {children}
    </ProfilesContext.Provider>
  );
}

export function useProfiles() {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error("useProfiles must be used within ProfilesProvider");
  return ctx;
}
