import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

const THEME_KEY = "pluginmanager.theme";

function isTheme(v: string | null): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

// "system" = brak atrybutu na <html> - o kolorze decyduje wtedy media query
// prefers-color-scheme w App.css. "light"/"dark" wymuszają atrybut niezależnie
// od preferencji systemu. Ten sam zestaw wartości ustawia inline-owy skrypt w
// index.html (przed montowaniem Reacta), żeby uniknąć błysku złego motywu.
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return isTheme(stored) ? stored : "system";
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // localStorage niedostępny - wybór motywu nie przetrwa restartu, appka działa dalej.
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
