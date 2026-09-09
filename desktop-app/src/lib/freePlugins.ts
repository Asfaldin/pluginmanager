// Pluginy dołączone za darmo do każdej instalacji - nie mają licencji/ceny, więc nie
// żyją w katalogu license-servera (ten zna tylko płatne pozycje). Lista czysto
// informacyjna, do ręcznego uzupełniania w miarę powstawania kolejnych darmowych
// pluginów. Współdzielone przez ShopPage (karty) i PluginDetailPage (dedykowana strona).
export interface FreePlugin {
  id: string;
  label: string;
  description: string;
}

export const FREE_PLUGINS: FreePlugin[] = [
  {
    id: "announcer",
    label: "Announcer",
    description: "Cykliczne ogłoszenia na czacie - za darmo w każdej instalacji.",
  },
];
