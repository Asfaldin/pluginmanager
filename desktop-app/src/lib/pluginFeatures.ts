// Rozbicie opisu pluginu na kilka konkretnych cech (patrz PluginDetailPage.tsx) zamiast
// jednego bloku tekstu - każda cecha dostaje własną ramkę i (docelowo) własny obrazek.
// image jest opcjonalny - bez niego ramka po prostu pokazuje sam tekst, więc można to
// wypełniać stopniowo w miarę powstawania grafik zamiast robić wszystko na raz.
export interface PluginFeature {
  title: string;
  description: string;
  image?: string;
}

export const PLUGIN_FEATURES: Record<string, PluginFeature[]> = {
  announcer: [
    {
      title: "Kolorowe ogłoszenia",
      description: "Cykliczne ogłoszenia na czacie serwera z pełnym kolorowaniem i formatowaniem tekstu - dokładnie tak, jak wygląda w grze.",
    },
    {
      title: "Własny interwał",
      description: "Każda wiadomość może mieć swój własny interwał - jedna wyświetla się co minutę, inna raz na kwadrans.",
    },
    {
      title: "Przeładowanie bez restartu",
      description: "Zmiany widoczne na serwerze natychmiast po komendzie przeładowania - bez restartu serwera.",
    },
  ],
};
