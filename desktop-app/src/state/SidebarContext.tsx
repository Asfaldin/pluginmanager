import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Zwinięcie paska bocznego - było lokalnym stanem Layout.tsx, ale TitleBar.tsx (osobny
// komponent, siostrzany względem Layout w App.tsx) potrzebuje tej samej wartości, żeby
// lewa część paska tytułu miała dokładnie taką samą szerokość jak sidebar pod nim (patrz
// .titlebar-brand w App.css) - inaczej marka appki i pusty pasek tytułu wyglądały jak dwie
// osobne warstwy z przerwą między nimi zamiast jednej ciągłej bryły.

const COLLAPSE_KEY = "pluginmanager.sidebarCollapsed";

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage niedostępny (np. tryb prywatny) - stan zwinięcia nie przetrwa restartu.
    }
  }, [collapsed]);

  return <SidebarContext.Provider value={{ collapsed, setCollapsed }}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
