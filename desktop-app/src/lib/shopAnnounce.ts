import { createTextSet, fillPlaceholders as fill, type GameTexts, type TextField as GenericTextField } from "./langTexts";
import enLang from "./shopLang/en.yml?raw";
import plLang from "./shopLang/pl.yml?raw";

// Wszystkie teksty Sklepu w grze (menu, opisy przedmiotów, czat, ogłoszenia, NPC, komendy admina).
// Plugin trzyma je w lang/<język>.yml (plik na serwerze nadpisuje domyślne z jara, brakujące
// klucze biorą się z jara), więc aplikacja zmienia tylko te konkretne linijki, a resztę pliku
// zostawia nietkniętą. Domyślne teksty = kopia lang/ z pluginu (src/lib/shopLang - podmieniać
// razem z jarem, gdy w pluginie zmienią się teksty).

export type TextGroup = "windows" | "item" | "player" | "announce" | "places" | "admin";

export const TEXT_GROUPS: Array<[TextGroup, string, string]> = [
  ["windows", "Okna i przyciski", "tytuły okien sklepu i napisy na przyciskach"],
  ["item", "Opis przedmiotu i wybór ilości", "linijki pod przedmiotem w sklepie i w oknie „Ile sztuk?”"],
  ["player", "Wiadomości dla gracza", "kupno, sprzedaż, szukanie i błędy na czacie"],
  ["announce", "Ogłoszenia na czacie i HUD", "rotacja, eventy, reset cen - widzą je wszyscy"],
  ["places", "NPC i tabliczki", "napisy na tabliczkach i nazwy NPC sklepu"],
  ["admin", "Komunikaty dla admina", "odpowiedzi na komendy /@shop - widzi je tylko admin"],
];

export type TextField = GenericTextField<TextGroup>;

// Ludzkie nazwy tekstów. Grupa z pierwszej części klucza (patrz groupOf); tekst spoza tej listy
// (np. nowy w pluginie) i tak się pokaże - w grupie admina, z kluczem zamiast nazwy.
const LABELS: Record<string, string> = {
  "menu.main-title": "Tytuł menu głównego",
  "menu.category-title": "Tytuł okna kategorii",
  "menu.picker-title": "Tytuł okna „Ile sztuk?”",
  "menu.search-title": "Tytuł okna wyników wyszukiwania",
  "menu.category-hint": "Podpis pod kategorią w menu",
  "menu.search": "Przycisk Szukaj - nazwa",
  "menu.search-hint-1": "Przycisk Szukaj - opis, linijka 1",
  "menu.search-hint-2": "Przycisk Szukaj - opis, linijka 2",
  "menu.exit-close": "Przycisk Zamknij",
  "menu.exit-menu": "Przycisk powrotu do menu serwera",
  "menu.prev": "Przycisk Poprzednia strona",
  "menu.next": "Przycisk Następna strona",
  "menu.page": "Numer strony (pod strzałkami)",
  "menu.back-categories": "Przycisk powrotu do listy kategorii",
  "menu.back-shop": "Przycisk powrotu z wyników wyszukiwania",
  "menu.back-picker": "Przycisk powrotu z okna „Ile sztuk?”",
  "menu.sort": "Przycisk Sortowanie - nazwa",
  "menu.sort-now-order": "Sortowanie - teraz: Twoja kolejność",
  "menu.sort-now-buy": "Sortowanie - teraz: od najtańszego",
  "menu.sort-now-sell": "Sortowanie - teraz: od najwyższego skupu",
  "menu.sort-lmb": "Sortowanie - opis lewego kliknięcia",
  "menu.sort-rmb": "Sortowanie - opis prawego kliknięcia",
  "menu.sort-again": "Sortowanie - jak wrócić do Twojej kolejności",
  "item.buy": "Cena kupna",
  "item.sell": "Cena skupu",
  "item.buy-discounted": "Cena kupna w promocji (stara przekreślona)",
  "item.sale": "Znaczek: promocja",
  "item.sale-timed": "Znaczek: promocja na czas",
  "item.rank-discount": "Rabat rangi gracza",
  "item.trend-up": "Znaczek: skup rośnie",
  "item.trend-down": "Znaczek: skup spada",
  "item.event": "Znaczek: event",
  "item.event-timed": "Znaczek: event na czas",
  "item.lmb-buy": "Podpowiedź: lewy klik = kupno",
  "item.cannot-buy": "Nie da się kupić",
  "item.rmb-sell": "Podpowiedź: prawy klik = sprzedaż",
  "item.shift-rmb-sell": "Podpowiedź: Shift + prawy klik = sprzedaj wszystko",
  "item.cannot-sell": "Nie da się sprzedać",
  "item.rotating": "Oferta czasowa (przedmiot z rotacji)",
  "item.category": "Kategoria (w wynikach wyszukiwania)",
  "picker.amount-ok": "Ilość - gracza stać",
  "picker.amount-no": "Ilość - gracza nie stać",
  "picker.price": "Cena za tę ilość",
  "picker.per-piece": "Cena za sztukę",
  "picker.click": "Podpowiedź: kliknij, aby kupić",
  "picker.no-money": "Za mało pieniędzy",
  "picker.shift": "Podpowiedź: Shift = kup maksimum",
  "buy.bought": "Kupiono",
  "buy.no-money": "Nie stać Cię",
  "buy.no-space": "Za mało miejsca na tyle sztuk",
  "buy.no-space-any": "Brak miejsca w ekwipunku",
  "buy.cannot-afford-one": "Nie stać na ani jedną sztukę",
  "buy.cannot-buy": "Tego nie da się kupić",
  "buy.unavailable": "Przedmiot chwilowo niedostępny",
  "buy.gone": "Sklep się zmienił w trakcie",
  "sell.empty-hand": "Pusta ręka przy sprzedaży",
  "sell.empty-hand-all": "Pusta ręka przy „sprzedaj wszystko”",
  "sell.cannot-sell": "Tego nie da się sprzedać",
  "sell.nothing": "Nic do sprzedania",
  "sell.not-enough": "Za mało sztuk na jedną paczkę",
  "sell.sold": "Sprzedano",
  "sell.rest": "Dopisek: ile sztuk zostało",
  "search.prompt": "Prośba o wpisanie nazwy",
  "search.cancel-hint": "Jak zrezygnować z szukania",
  "search.cancel-word": "Słowo, które gracz wpisuje, żeby zrezygnować",
  "search.cancelled": "Szukanie anulowane",
  "search.none": "Nic nie znaleziono",
  "search.found": "Znaleziono",
  "search.found-cut": "Znaleziono (za dużo - pokazano część)",
  "price-check.header": "/cena - nagłówek z nazwą przedmiotu",
  "price-check.buy": "/cena - cena kupna",
  "price-check.buy-discounted": "/cena - cena kupna w promocji",
  "price-check.cannot-buy": "/cena - nie da się kupić",
  "price-check.sell": "/cena - skup teraz",
  "price-check.cannot-sell": "/cena - sklep tego nie skupuje",
  "price-check.rank-sell-bonus": "/cena - premia rangi do skupu",
  "price-check.empty-hand": "/cena - pusta ręka",
  "price-check.not-in-shop": "/cena - przedmiotu nie ma w sklepie",
  "command.search-word": "Słowo w komendzie szukania (np. /sklep szukaj)",
  "command.search-usage": "Jak użyć komendy szukania",
  "command.unknown-category": "Nie ma takiej kategorii",
  "places.npc-name-main": "Nazwa NPC, który otwiera menu główne",
  "places.npc-name-category": "Nazwa NPC, który otwiera kategorię",
  "places.sign-main": "Tabliczka menu głównego - napis zamiast nazwy kategorii",
  "places.sign-line-1": "Tabliczka - linijka 1",
  "places.sign-line-2": "Tabliczka - linijka 2",
  "places.sign-line-3": "Tabliczka - linijka 3",
  "places.sign-line-4": "Tabliczka - linijka 4",
  "places.sign-protected": "Gracz próbuje zniszczyć tabliczkę",
  "places.target-main": "Opis celu NPC/tabliczki: menu główne",
  "places.target-category": "Opis celu NPC/tabliczki: kategoria",
  "places.unknown-category": "NPC/tabliczka: nie ma takiej kategorii",
  "places.unknown-player": "Gracz nie jest online",
  "places.npc-created": "NPC postawiony",
  "places.npc-none": "Nie patrzysz na NPC",
  "places.npc-renamed": "NPC - nowa nazwa",
  "places.npc-type-set": "NPC - nowy wygląd",
  "places.npc-bad-type": "NPC - ten mob się nie nadaje",
  "places.npc-bad-profession": "NPC - zły zawód",
  "places.npc-peaceful": "NPC - uwaga o trybie Pokojowym",
  "places.npc-retargeted": "NPC - otwiera coś innego",
  "places.npc-removed": "NPC usunięty",
  "places.sign-none": "Nie patrzysz na tabliczkę",
  "places.sign-set": "Tabliczka ustawiona",
  "places.sign-removed": "Tabliczka wyłączona",
  "places.sign-not-shop": "To nie jest tabliczka sklepu",
  "places.sign-broken": "Tabliczka zniszczona",
  "places.sign-protected-admin": "Admin bez Shiftu próbuje zniszczyć tabliczkę",
  "dynamic.reset-broadcast": "Ceny wróciły do normy",
  "hud.event-info": "HUD: trwają eventy",
  "hud.trend-up": "HUD: przedmiot drożeje",
  "hud.trend-down": "HUD: przedmiot tanieje",
  "event.broadcast-up": "Event: skup drożej (bez końca)",
  "event.broadcast-up-timed": "Event: skup drożej (na czas)",
  "event.broadcast-down": "Event: skup taniej (bez końca)",
  "event.broadcast-down-timed": "Event: skup taniej (na czas)",
  "event.broadcast-off": "Koniec eventu na przedmiot",
  "event.broadcast-all-off": "Koniec wszystkich eventów",
  "sale.target-all": "Promocja - nazwa „cały sklep”",
  "sale.broadcast-start": "Promocja: start (bez końca)",
  "sale.broadcast-start-timed": "Promocja: start (na czas)",
  "sale.broadcast-end": "Koniec promocji",
  "sale.broadcast-all-end": "Koniec wszystkich promocji",
  "rotation.broadcast-header": "Nowa oferta - nagłówek",
  "rotation.broadcast-item": "Nowa oferta - linijka z każdym przedmiotem",
  "rotation.broadcast-footer": "Nowa oferta - stopka",
  "admin.usage": "Pomoc /@shop (lista komend)",
  "admin.players-only": "Tylko gracz może otworzyć sklep",
  "admin.reloaded": "Sklep wczytany od nowa",
  "admin.unknown-item": "Nie ma takiego przedmiotu",
  "admin.not-a-number": "To nie jest liczba",
  "admin.price-positive": "Kwota musi być większa od zera",
  "admin.price-type": "Trzeba wpisać buy albo sell",
  "admin.price-margin": "Odrzucono: skup nie może dawać tyle co kupno",
  "admin.price-set": "Cena zmieniona",
  "admin.price-multiplier-note": "Uwaga: skup jest teraz zmieniony",
  "admin.price-failed": "Nie udało się zapisać ceny",
  "admin.confirm-price-buy": "Potwierdzenie zmiany ceny kupna",
  "admin.confirm-price-sell": "Potwierdzenie zmiany ceny skupu",
  "admin.confirm-reset": "Potwierdzenie resetu skupu przedmiotu",
  "admin.confirm-resetall": "Potwierdzenie resetu wszystkich cen",
  "admin.confirm-nothing": "Nie ma nic do potwierdzenia",
  "admin.confirm-expired": "Potwierdzenie wygasło",
  "admin.cancelled": "Anulowano",
  "admin.reset-done": "Skup przedmiotu wrócił do normy",
  "admin.resetall-done": "Wszystkie ceny skupu wróciły do normy",
  "admin.multiplier-set": "Skup zmieniony ręcznie",
  "admin.percent-range": "Procent poza zakresem",
  "admin.not-a-percent": "To nie jest procent",
  "admin.not-a-duration": "Zły czas trwania",
  "admin.event-set": "Event ustawiony (bez końca)",
  "admin.event-set-timed": "Event ustawiony (na czas)",
  "admin.event-off": "Event zakończony",
  "admin.event-not-locked": "Przedmiot nie ma eventu",
  "admin.event-list-header": "Lista eventów - nagłówek",
  "admin.event-list-line": "Lista eventów - linijka (bez końca)",
  "admin.event-list-line-timed": "Lista eventów - linijka (na czas)",
  "admin.event-list-empty": "Lista eventów - pusta",
  "admin.event-offall": "Zakończono wszystkie eventy",
  "admin.dynamic-off": "Ceny dynamiczne są wyłączone",
  "admin.info": "/@shop info - opis przedmiotu",
  "admin.info-none": "/@shop info - brak ceny",
  "admin.info-reset-off": "/@shop info - reset wyłączony",
  "admin.info-per": "/@shop info - cena za ilość",
  "admin.info-locked": "/@shop info - zablokowany eventem",
  "admin.info-up": "/@shop info - skup podwyższony",
  "admin.info-down": "/@shop info - skup obniżony",
  "admin.info-normal": "/@shop info - skup zwykły",
  "admin.rotation-none": "Rotacja - żadna kategoria jej nie ma",
  "admin.rotation-header": "Rotacja - nagłówek kategorii",
  "admin.rotation-line": "Rotacja - linijka z przedmiotem",
  "admin.rotation-forced": "Rotacja wylosowana od nowa",
  "admin.stats-disabled": "Statystyki są wyłączone",
  "admin.stats-snapshot": "Statystyki zapisane",
  "admin.stats-header": "Statystyki - nagłówek",
  "admin.stats-line": "Statystyki - linijka z przedmiotem",
  "admin.stats-empty": "Statystyki - nic dziś nie sprzedano",
  "admin.stats-total": "Statystyki - suma dnia",
  "admin.sale-set": "Promocja ustawiona (bez końca)",
  "admin.sale-set-timed": "Promocja ustawiona (na czas)",
  "admin.sale-off": "Promocja zakończona",
  "admin.sale-not-active": "Nie ma takiej promocji",
  "admin.sale-bad-percent": "Zła zniżka (musi być 1-90%)",
  "admin.sale-unknown-target": "Nie ma takiego przedmiotu ani kategorii",
  "admin.sale-list-header": "Lista promocji - nagłówek",
  "admin.sale-list-line": "Lista promocji - linijka (bez końca)",
  "admin.sale-list-line-timed": "Lista promocji - linijka (na czas)",
  "admin.sale-list-empty": "Lista promocji - pusta",
  "admin.sale-offall": "Zakończono wszystkie promocje",
  "admin.history-header": "/@shop history - nagłówek",
  "admin.history-line": "/@shop history - linijka z dniem",
  "admin.history-empty": "/@shop history - brak sprzedaży",
  "admin.top-header-today": "/@shop top - nagłówek (dziś)",
  "admin.top-header-week": "/@shop top - nagłówek (7 dni)",
  "admin.top-line": "/@shop top - linijka z graczem",
  "admin.top-empty": "/@shop top - nikt nic nie sprzedał",
};

// NPC/tabliczki: gracz widzi tylko napisy i ochronę tabliczki, reszta to odpowiedzi na komendy admina.
const PLACES_FOR_PLAYERS = /^places\.(npc-name-|sign-main$|sign-line-|sign-protected$)/;

function groupOf(key: string): TextGroup {
  const sec = key.split(".")[0];
  if (sec === "menu") return "windows";
  if (sec === "item" || sec === "picker") return "item";
  if (sec === "buy" || sec === "sell" || sec === "search" || sec === "command" || sec === "price-check") return "player";
  if (sec === "rotation" || sec === "event" || sec === "dynamic" || sec === "hud" || sec === "sale") return "announce";
  if (sec === "places") return PLACES_FOR_PLAYERS.test(key) ? "places" : "admin";
  return "admin";
}

const SHOP_TEXTS = createTextSet<TextGroup>({ pl: plLang, en: enLang }, LABELS, groupOf);

/** Wszystkie teksty w kolejności z pliku pluginu. */
export const TEXT_FIELDS: TextField[] = SHOP_TEXTS.fields;

/** Ogłoszenia na czacie (rotacja, reset, eventy) - też podgląd przy rotacji w kategorii. */
export type AnnounceGroup = "rotation" | "reset" | "event";
export const ANNOUNCE_FIELDS = TEXT_FIELDS.filter((f) => /^(rotation|event)\.|^dynamic\.reset-broadcast$/.test(f.key));

export const PLACEHOLDER_LABELS: Record<string, string> = {
  category: "nazwa kategorii",
  categories: "ile kategorii",
  days: "ile dni",
  item: "nazwa przedmiotu",
  items: "ile przedmiotów",
  price: "cena",
  currency: "znaczek waluty",
  amount: "ilość sztuk",
  percent: "procent",
  time: "czas trwania",
  query: "wpisana nazwa",
  count: "liczba",
  shown: "ile pokazano",
  page: "numer strony",
  pages: "ile stron",
  value: "wpisana wartość",
  have: "ile ma gracz",
  rest: "ile zostało",
  target: "co otwiera",
  player: "nick gracza",
  name: "nowa nazwa",
  type: "kupno albo skup",
  buy: "cena kupna",
  sell: "cena skupu",
  real: "skup teraz",
  old: "stara cena",
  new: "nowa cena",
  "old-each": "stara cena za sztukę",
  "new-each": "nowa cena za sztukę",
  each: "cena za sztukę",
  pieces: "sztuk w paczce",
  seconds: "ile sekund",
  min: "najmniej",
  max: "najwięcej",
  money: "kwota",
  trend: "strzałka trendu",
  state: "stan skupu",
  norm: "zwykła sprzedaż",
  drought: "cykle ciszy",
  pool: "wielkość puli",
  resting: "ile odpoczywa",
  nr: "miejsce na liście",
  date: "dzień",
  error: "opis błędu",
};

/** Co dokładnie wstawi sklep w miejsce najczęstszych ramek - do okienka "?" przy tekstach. */
export const PLACEHOLDER_HELP: Record<string, string> = {
  category: "nazwa kategorii (np. Bloki, Kolekcja)",
  days: "za ile dni coś się zmieni (np. nowa oferta w rotacji)",
  item: "nazwa przedmiotu - gracz widzi ją w języku swojej gry",
  price: "cena w sklepie (sama liczba)",
  currency: "znaczek waluty serwera, np. $ albo zł (ustawiasz go w Ustawieniach serwera)",
  amount: "ile sztuk",
  percent: "o ile procent zmienia się skup (np. w evencie)",
  time: "jak długo coś trwa (np. 2h, 30m, 3d)",
};

/** Przykładowe wartości do podglądu. */
export const SAMPLE_VALUES: Record<string, string> = {
  category: "&e&lKolekcja",
  categories: "10",
  days: "14",
  item: "Płyta: Cat",
  items: "240",
  price: "20000",
  currency: "$",
  amount: "1",
  percent: "50",
  time: "2h",
  query: "diament",
  count: "3",
  shown: "28",
  page: "1",
  pages: "2",
  value: "abc",
  have: "12",
  rest: "5",
  target: "kategorię Bloki",
  player: "Steve",
  name: "&a&lSprzedawca",
  type: "kupno",
  buy: "640",
  sell: "50",
  real: "45",
  old: "640",
  new: "800",
  "old-each": "10",
  "new-each": "12.5",
  each: "10",
  pieces: "64",
  seconds: "30",
  min: "-90",
  max: "500",
  money: "12500",
  trend: " ▲",
  state: "(podwyższony)",
  norm: "120",
  drought: "0",
  pool: "30",
  resting: "5",
  nr: "1",
  date: "25.09",
  error: "brak dostępu",
};

export type AnnounceTexts = GameTexts;

/** Domyślne teksty pluginu w danym języku (nieznany język = angielski). */
export function defaultAnnounceTexts(language: string): AnnounceTexts {
  return SHOP_TEXTS.defaults(language);
}

/** Teksty z pliku lang na serwerze; czego tam brakuje, bierze się z domyślnych (jak w pluginie). */
export function parseAnnounceTexts(text: string | null, language: string): AnnounceTexts {
  return SHOP_TEXTS.parse(text, language);
}

/** Podmienia wstawki {nazwa} na wartości (do podglądu). */
export const fillPlaceholders = fill;

/** Wpisuje teksty do pliku lang, zmieniając TYLKO linijki tych kluczy (patrz langTexts.patchLang). */
export function patchLangFile(text: string, texts: AnnounceTexts): string {
  return SHOP_TEXTS.patch(text, texts);
}

/** Teksty, które różnią się od `base` - tylko one idą do pliku na serwerze. */
export function changedTexts(texts: AnnounceTexts, base: AnnounceTexts): AnnounceTexts {
  return SHOP_TEXTS.changed(texts, base);
}

export function sameTexts(a: AnnounceTexts, b: AnnounceTexts, fields: TextField[] = TEXT_FIELDS): boolean {
  return fields.every((f) => a[f.key] === b[f.key]);
}
