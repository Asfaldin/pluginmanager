import { BUTTON_IDS, type MarketConfig } from "./marketYaml";

// Układ okna Targu: pola ofert + przyciski. Każdy przycisk zawsze gdzieś stoi (plugin nie ma „wyłączonych”
// przycisków) - dlatego pole z przyciskiem można tylko zamienić z innym przyciskiem albo przeciągnąć.

/** Co stoi w polu: "offer", id przycisku albo null (tło). */
export type SlotThing = string | null;

export function thingAt(c: MarketConfig, slot: number): SlotThing {
  const button = BUTTON_IDS.find((id) => c.buttons[id].slot === slot);
  if (button) return button;
  return c.offerSlots.includes(slot) ? "offer" : null;
}

/** Stawia w polu `what` (oferta, przycisk albo tło). Przycisk przenosi się z poprzedniego miejsca, a to,
    co stało w polu docelowym, idzie na jego stare miejsce (zamiana) - nic innego się nie przesuwa. */
export function placeAt(c: MarketConfig, slot: number, what: SlotThing): MarketConfig {
  return swapSlots(c, slot, what && what !== "offer" ? c.buttons[what].slot : slot, what);
}

/** Zamienia zawartość dwóch pól (przeciąganie). `forceA` = co ma stanąć w polu a (gdy a === b). */
export function swapSlots(c: MarketConfig, a: number, b: number, forceA?: SlotThing): MarketConfig {
  const inA = thingAt(c, a);
  const inB = thingAt(c, b);
  const newA = forceA !== undefined ? forceA : inB;
  const newB = a === b ? newA : inA;
  if (a !== b && newA === inA && newB === inB) return c;
  const offers = new Set(c.offerSlots);
  offers.delete(a);
  offers.delete(b);
  const buttons = { ...c.buttons };
  const put = (slot: number, t: SlotThing) => {
    if (t === "offer") offers.add(slot);
    else if (t) buttons[t] = { ...buttons[t], slot };
  };
  put(a, newA);
  if (a !== b) put(b, newB);
  return { ...c, buttons, offerSlots: [...offers].sort((x, y) => x - y) };
}

/** Domyślne pola ofert dla rozmiaru: środek okna bez ramki (jak 7x3 w 54), w małych oknach - każde wolne pole. */
export function defaultOfferSlots(size: number, buttonSlots: number[] = []): number[] {
  const rows = size / 9;
  // Duże okna mają pusty rząd nad przyciskami (jak domyślne 54: oferty w rzędach 2-4).
  const lastRow = rows >= 5 ? rows - 3 : rows - 2;
  const out: number[] = [];
  for (let s = 0; s < size; s++) {
    const row = Math.floor(s / 9);
    const col = s % 9;
    const inside = rows >= 3 ? row >= 1 && row <= lastRow && col >= 1 && col <= 7 : true;
    if (inside && !buttonSlots.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Zmiana rozmiaru okna: przyciski z dolnego rzędu zostają na dole (ta sama kolumna), pozostałe zostają na miejscu,
 * a te spoza okna idą na wolne pola od końca. Pola ofert układają się od nowa w środku okna.
 */
export function resize(c: MarketConfig, size: number): MarketConfig {
  const oldBottom = c.size - 9;
  const newBottom = size - 9;
  const next: Record<string, number> = {};
  const taken = new Set<number>();
  for (const id of BUTTON_IDS) {
    const s = c.buttons[id].slot;
    if (s >= oldBottom && s < c.size && !taken.has(newBottom + (s - oldBottom))) {
      next[id] = newBottom + (s - oldBottom);
      taken.add(next[id]);
    }
  }
  for (const id of BUTTON_IDS) {
    const s = c.buttons[id].slot;
    if (next[id] == null && s >= 0 && s < size && !taken.has(s)) {
      next[id] = s;
      taken.add(s);
    }
  }
  for (const id of BUTTON_IDS) {
    if (next[id] != null) continue;
    let free = -1;
    for (let s = size - 1; s >= 0 && free < 0; s--) if (!taken.has(s)) free = s;
    next[id] = free;
    taken.add(free);
  }
  const buttons = Object.fromEntries(BUTTON_IDS.map((id) => [id, { ...c.buttons[id], slot: next[id] }]));
  return { ...c, size, buttons, offerSlots: defaultOfferSlots(size, [...taken]) };
}
