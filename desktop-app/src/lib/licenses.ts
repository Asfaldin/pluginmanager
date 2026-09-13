import type { LicenseRecord } from "./types";

/** Czy KTÓRAKOLWIEK aktywna licencja obejmuje ten plugin - ta sama logika co
    licenseGrants w license-server/src/db.js (plugin="*", albo lista po przecinku).
    Współdzielone przez ShopPage i PluginDetailPage. */
export function ownsPluginId(licenses: LicenseRecord[], id: string): boolean {
  return licenses.some(
    (l) => l.status === "active" && (l.plugin === "*" || l.plugin.split(",").map((s) => s.trim()).includes(id))
  );
}

/** Dla pakietu - dokładne dopasowanie stringa (tak jak go zapisuje resolveVariant przy
    zakupie: "*" albo lista id po przecinku) - pakiet nie jest sam w sobie "pluginem",
    więc ownsPluginId by tu nie zadziałało. */
export function ownsPackage(licenses: LicenseRecord[], pluginsField: string): boolean {
  return licenses.some((l) => l.status === "active" && (l.plugin === "*" || l.plugin === pluginsField));
}

/** pkg.plugins to "*" albo tablica id - ownsPackage porównuje string tak, jak go zapisał
    zakup (patrz wyżej), więc tablicę trzeba najpierw złączyć przecinkami. */
export function packagePluginsField(plugins: "*" | string[]): string {
  return plugins === "*" ? "*" : plugins.join(",");
}
