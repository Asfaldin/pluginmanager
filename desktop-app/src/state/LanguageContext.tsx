import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Language = "pl" | "en";

const LANGUAGE_KEY = "pluginmanager.language";

function isLanguage(v: string | null): v is Language {
  return v === "pl" || v === "en";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Ten sam wzorzec co ThemeContext.tsx (localStorage + reaktywny stan) - musi być
    kontekstem, nie zwykłymi funkcjami get/set w appSettings.ts, bo pasek boczny
    (poza drzewem stron) i każda strona muszą przerysować się NATYCHMIAST po zmianie
    języka w Ustawieniach, bez przeładowania appki. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      return isLanguage(stored) ? stored : "pl";
    } catch {
      return "pl";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // localStorage niedostępny - wybór języka nie przetrwa restartu appki.
    }
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage: setLanguageState }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
