// Baner/logo pluginu na jego dedykowanej stronie w Sklepie (PluginDetailPage.tsx) -
// CELOWO osobna mapa od PLUGIN_ART (pluginArt.ts): PLUGIN_ART to zdjęcie/screenshot na
// karcie w siatce (16:9, przycięte), a to tutaj to raczej wordmark/logo pokazywane TYLKO
// po wejściu na stronę konkretnego pluginu, nie na karcie w Sklepie/Twoje pluginy.
// Dokładaj kolejne pluginy tu w miarę powstawania grafik.
import announcerBanner from "../assets/plugin-banners/announcer.png";

export const PLUGIN_BANNERS: Record<string, string> = {
  announcer: announcerBanner,
};
