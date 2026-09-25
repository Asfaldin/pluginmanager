import type { ShopTemplate } from "./shopTemplates";

// Szablony Sklepu zapisane albo wgrane przez właściciela - pamiętane w aplikacji na tym komputerze
// (lista w menu „Szablon”). Sam plik na Pulpicie to osobna kopia - usunięcie z listy go nie rusza.

export interface UserShopTemplate {
  id: string;
  name: string;
  /** Kiedy zapisany/wgrany (ms). */
  savedAt: number;
  template: ShopTemplate;
}

const KEY = "pm-shop-user-templates";

export function loadUserTemplates(): UserShopTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as UserShopTemplate[]) : [];
    return Array.isArray(list) ? list.filter((t) => t && typeof t.name === "string" && t.template) : [];
  } catch {
    return [];
  }
}

function store(list: UserShopTemplate[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * Dodaje szablon na początek listy jako osobną pozycję - nigdy nie zastępuje istniejących. Gdy nazwa
 * już jest, nowy dostaje dopisek " (2)", " (3)"...
 */
export function withUserTemplate(list: UserShopTemplate[], name: string, template: ShopTemplate, now = Date.now()): UserShopTemplate[] {
  const taken = new Set(list.map((t) => t.name));
  let unique = name;
  for (let n = 2; taken.has(unique); n++) unique = `${name} (${n})`;
  return [{ id: `${now}-${Math.random().toString(36).slice(2, 7)}`, name: unique, savedAt: now, template }, ...list];
}

export function addUserTemplate(name: string, template: ShopTemplate): UserShopTemplate[] {
  const next = withUserTemplate(loadUserTemplates(), name, template);
  store(next);
  return next;
}

export function removeUserTemplate(id: string): UserShopTemplate[] {
  const next = loadUserTemplates().filter((t) => t.id !== id);
  store(next);
  return next;
}
