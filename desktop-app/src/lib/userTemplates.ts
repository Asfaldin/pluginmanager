// Szablony zapisane albo wgrane przez właściciela (Sklep, Targ...) - pamiętane w aplikacji na tym komputerze
// (lista „Twoje szablony” w menu „Szablon”). Plik na Pulpicie to osobna kopia - usunięcie z listy go nie rusza.

export interface UserTemplate<T> {
  id: string;
  name: string;
  /** Kiedy zapisany/wgrany (ms). */
  savedAt: number;
  template: T;
}

/**
 * Dodaje szablon na początek listy jako osobną pozycję - nigdy nie zastępuje istniejących. Gdy nazwa
 * już jest, nowy dostaje dopisek " (2)", " (3)"...
 */
export function withUserTemplate<T>(list: UserTemplate<T>[], name: string, template: T, now = Date.now()): UserTemplate<T>[] {
  const taken = new Set(list.map((t) => t.name));
  let unique = name;
  for (let n = 2; taken.has(unique); n++) unique = `${name} (${n})`;
  return [{ id: `${now}-${Math.random().toString(36).slice(2, 7)}`, name: unique, savedAt: now, template }, ...list];
}

/** Lista szablonów jednego pluginu w pamięci aplikacji (`key` = osobne miejsce dla każdego pluginu). */
export function userTemplateStore<T>(key: string, isTemplate: (t: unknown) => boolean) {
  function load(): UserTemplate<T>[] {
    try {
      const raw = localStorage.getItem(key);
      const list = raw ? (JSON.parse(raw) as UserTemplate<T>[]) : [];
      return Array.isArray(list) ? list.filter((t) => t && typeof t.name === "string" && isTemplate(t.template)) : [];
    } catch {
      return [];
    }
  }
  function store(list: UserTemplate<T>[]) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // bez localStorage - lista zniknie po zamknięciu, plik na Pulpicie zostaje
    }
  }
  return {
    load,
    add(name: string, template: T): UserTemplate<T>[] {
      const next = withUserTemplate(load(), name, template);
      store(next);
      return next;
    },
    /** Nowa nazwa; gdy taka już jest u innego szablonu - dostaje numer, jak przy zapisie. */
    rename(id: string, name: string): UserTemplate<T>[] {
      const list = load();
      const taken = new Set(list.filter((t) => t.id !== id).map((t) => t.name));
      let unique = name;
      for (let n = 2; taken.has(unique); n++) unique = `${name} (${n})`;
      const next = list.map((t) => (t.id === id ? { ...t, name: unique } : t));
      store(next);
      return next;
    },
    remove(id: string): UserTemplate<T>[] {
      const next = load().filter((t) => t.id !== id);
      store(next);
      return next;
    },
  };
}
