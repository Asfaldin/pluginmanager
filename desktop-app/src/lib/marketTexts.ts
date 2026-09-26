import { createTextSet } from "./langTexts";
import enLang from "./marketLang/en.yml?raw";
import plLang from "./marketLang/pl.yml?raw";

// Wszystkie teksty Targu w grze (okno, opis oferty, czat, komendy admina) - kopia lang/ pluginu Targu
// w src/lib/marketLang (podmieniać razem z jarem, gdy w pluginie zmienią się teksty).

export type MarketTextGroup = "windows" | "offer" | "player" | "admin";

export const MARKET_TEXT_GROUPS: Array<[MarketTextGroup, string, string]> = [
  ["windows", "Okno i przyciski", "tytuły okien Targu i napisy na przyciskach"],
  ["offer", "Opis oferty", "linijki pod przedmiotem wystawionym na Targu"],
  ["player", "Wiadomości dla gracza", "wystawianie, kupno, wycofanie, wygasanie, „Do odebrania”, szukanie"],
  ["admin", "Komunikaty dla admina", "odpowiedzi na komendy /@market - widzi je tylko admin"],
];

const LABELS: Record<string, string> = {
  "menu.title": "Tytuł okna Targu",
  "menu.title-mine": "Tytuł okna „Twoje oferty”",
  "menu.search-title": "Tytuł okna wyników wyszukiwania",
  "menu.mailbox-title": "Tytuł okna „Do odebrania”",
  "menu.prev": "Przycisk Poprzednia strona",
  "menu.next": "Przycisk Następna strona",
  "menu.close": "Przycisk Zamknij",
  "menu.back-to-menu": "Przycisk powrotu do menu serwera",
  "menu.back": "Przycisk powrotu na Targ",
  "menu.mine-off": "Przycisk „Moje oferty” - wyłączony",
  "menu.mine-on": "Przycisk „Moje oferty” - włączony",
  "menu.mine-on-hint": "Przycisk „Moje oferty” - podpowiedź",
  "menu.search": "Przycisk Szukaj - nazwa",
  "menu.search-hint": "Przycisk Szukaj - opis",
  "menu.sort-asc": "Sortowanie - od najtańszych",
  "menu.sort-desc": "Sortowanie - od najdroższych",
  "menu.sort-hint": "Sortowanie - podpowiedź",
  "menu.mailbox": "Przycisk „Do odebrania” - nazwa",
  "menu.mailbox-count": "Przycisk „Do odebrania” - ile czeka",
  "menu.mailbox-item-hint": "„Do odebrania” - podpowiedź pod przedmiotem",
  "offer.price": "Cena oferty",
  "offer.seller": "Sprzedawca",
  "offer.expires": "Ile zostało do wygaśnięcia",
  "offer.buy": "Podpowiedź: kliknij, aby kupić",
  "offer.yours": "Twoja oferta - jak wycofać",
  "offer.confirm-retract": "Potwierdzenie wycofania",
  "sell.usage": "Jak użyć wystawiania",
  "sell.bad-price": "Zła cena",
  "sell.empty-hand": "Pusta ręka przy wystawianiu",
  "sell.limit": "Za dużo ofert naraz",
  "sell.listed": "Wystawiono na Targ",
  "buy.gone": "Oferta już sprzedana albo wycofana",
  "buy.no-money": "Za mało pieniędzy",
  "buy.bought": "Kupiono",
  "buy.sold": "Ktoś kupił Twoją ofertę",
  "buy.to-mailbox": "Pełny ekwipunek - przedmiot w „Do odebrania”",
  "buy.dropped": "Pełny ekwipunek - przedmiot wypadł",
  "retract.done": "Oferta wycofana",
  "expire.to-mailbox": "Oferta wygasła - przedmiot w „Do odebrania”",
  "expire.returned": "Oferta wygasła - przedmiot wrócił",
  "mailbox.empty": "„Do odebrania” - pusto",
  "mailbox.full": "„Do odebrania” - pełny ekwipunek",
  "mailbox.waiting": "„Do odebrania” - przypomnienie",
  "join.earnings": "Zarobki pod nieobecność",
  "join.returned": "Wygasłe oferty wróciły przy wejściu",
  "search.prompt": "Prośba o wpisanie nazwy",
  "search.cancel-hint": "Jak zrezygnować z szukania",
  "search.cancel-word": "Słowo, które gracz wpisuje, żeby zrezygnować",
  "search.cancelled": "Szukanie anulowane",
  "search.none": "Nic nie znaleziono",
  "search.found": "Znaleziono",
  "search.found-cut": "Znaleziono (za dużo - pokazano część)",
  "admin.usage": "Pomoc /@market",
  "admin.players-only": "Tylko gracz może otworzyć Targ",
  "admin.reloaded": "Ustawienia wczytane od nowa",
  "admin.player-not-found": "Nie ma takiego gracza",
  "admin.list-header": "Lista ofert gracza - nagłówek",
  "admin.list-line": "Lista ofert gracza - linijka",
  "admin.list-empty": "Gracz nie ma ofert",
  "admin.removed": "Zdjęto oferty gracza",
  "admin.offer-removed": "Zdjęto jedną ofertę",
  "admin.offer-not-found": "Nie ma takiej oferty",
};

function groupOf(key: string): MarketTextGroup {
  const sec = key.split(".")[0];
  if (sec === "menu") return "windows";
  if (sec === "offer") return "offer";
  if (sec === "admin") return "admin";
  return "player";
}

export const MARKET_TEXTS = createTextSet<MarketTextGroup>({ pl: plLang, en: enLang }, LABELS, groupOf);

export const MARKET_PLACEHOLDER_LABELS: Record<string, string> = {
  page: "numer strony",
  query: "wpisana nazwa",
  price: "cena",
  currency: "znaczek waluty",
  seller: "nick sprzedawcy",
  days: "dni",
  hours: "godziny",
  min: "najniższa cena",
  max: "najwyższa cena",
  limit: "limit ofert",
  payout: "ile dostaje sprzedawca",
  count: "liczba",
  amount: "kwota",
  item: "nazwa przedmiotu",
  player: "nick gracza",
  id: "numer oferty",
  offers: "ile ofert",
  shown: "ile pokazano",
};

export const MARKET_SAMPLE_VALUES: Record<string, string> = {
  page: "1",
  query: "diament",
  price: "1500",
  currency: "$",
  seller: "Steve",
  days: "6",
  hours: "23",
  min: "1",
  max: "10000000",
  limit: "10",
  payout: "1425",
  count: "3",
  amount: "4500",
  item: "Diamentowy miecz",
  player: "Steve",
  id: "3f2a9c",
  offers: "42",
  shown: "21",
};
