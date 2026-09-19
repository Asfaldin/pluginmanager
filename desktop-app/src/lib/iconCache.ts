// Gotowe ikonki przedmiotów, zapamiętane na czas działania aplikacji.
//
// Znalezienie tekstury to kilka zapytań do backendu na jeden materiał (kandydaci: item/,
// block/, _top, _side...), a listy w edytorach mają ich dziesiątki - bez tej pamięci każde
// wejście na stronę odpalało setki zapytań od nowa i było to widać jako zacięcie.
//
// Klucz zawiera paczkę tekstur, więc przełączenie paczki nie miesza ikonek. Po podmianie
// tekstury w paczce trzeba jednak wyczyścić pamięć (clearIconCache), inaczej w edytorach
// wisiałby stary obrazek aż do restartu aplikacji.

const icons = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

export function iconCacheKey(iconPackDir: string, material: string): string {
  return `${iconPackDir}\n${material}`;
}

export function getCachedIcon(key: string): { hit: boolean; url: string | null } {
  return { hit: icons.has(key), url: icons.get(key) ?? null };
}

/** Jedno zapytanie na materiał, nawet gdy ta sama ikonka jest w wielu miejscach naraz. */
export function loadIconOnce(key: string, load: () => Promise<string | null>): Promise<string | null> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const started = load().then((url) => {
    icons.set(key, url);
    inFlight.delete(key);
    return url;
  });
  inFlight.set(key, started);
  return started;
}

/** Po zmianie tekstury w paczce - edytory pokażą nowy obrazek bez restartu aplikacji. */
export function clearIconCache(): void {
  icons.clear();
  inFlight.clear();
}
