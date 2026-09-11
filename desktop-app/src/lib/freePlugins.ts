// JEDNO ŹRÓDŁO PRAWDY o tym, co jest darmowe. Wcześniej ta sama lista żyła w trzech
// miejscach (DeployPage, PluginGraph, tu) i się rozjeżdżała - teraz importują stąd.
//
// Dwa poziomy, celowo rozdzielone:
//  - FREE_PLUGIN_IDS  - pluginy BEZ bramki licencyjnej w kodzie Javy. Działają u każdego
//                       bez klucza; darmowe konto może je legalnie wysłać na serwer.
//                       Zmiana tej listy to decyzja biznesowa (co oddajemy za darmo) i
//                       musi iść w parze ze stanem pluginów w Mainplugins.
//  - FREE_PLUGINS     - te z powyższych, które pokazujemy jako osobną kartę w sklepie
//                       (sekcja "Darmowe"). Podzbiór FREE_PLUGIN_IDS, czysto marketingowy.

/** Pluginy bez licencji - działają u każdego bez klucza. Współdzielone przez
    DeployPage (gating + plakietki) i PluginGraph (podświetlenie "posiadane"). */
export const FREE_PLUGIN_IDS: ReadonlySet<string> = new Set([
  "core",
  "announcer",
  "farming",
  "menu",
  "teleport",
  "chatfilter",
  "hud",
  "ranks",
]);

export interface FreePlugin {
  id: string;
  label: string;
  description: string;
}

/** Darmowe pluginy pokazywane jako osobne karty w sklepie (sekcja "Darmowe").
    Musi być podzbiorem FREE_PLUGIN_IDS. Uzupełniać w miarę potrzeb marketingowych. */
export const FREE_PLUGINS: FreePlugin[] = [
  {
    id: "announcer",
    label: "Announcer",
    description: "Cykliczne ogłoszenia na czacie - za darmo w każdej instalacji.",
  },
];
