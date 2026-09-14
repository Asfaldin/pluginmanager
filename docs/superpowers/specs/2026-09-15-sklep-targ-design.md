# Sklep i Targ na fundamencie - projekt (2026-09-15)

Ustalone z Karolem 2026-09-15. Repo: Pluginy (`D:\folder z mc`) i aplikacja, gałąź `Karol` w obu.
Zasady ogólne: każdy plugin działa sam z core, wszystko w yml (i aplikacja zachowuje nowe pola),
teksty w `lang/en.yml` + `lang/pl.yml`, kwoty bez `.00` i bez `$`, tylko zwykły myślnik "-".

## Kopie przed zmianami

- Pluginy: gałąź `kopia-sklep-targ` (stan `Karol` przed pracą).
- Aplikacja: gałąź `kopia-kreator-sklepu` (stan `Karol` przed pracą).

## Część 1 - Targ (`mainplugins-market`)

### Pliki (`plugins/MainpluginsMarket/`)

- `market.yml` - ustawienia i wygląd menu (edytowane w aplikacji).
- `listings.yml` - dane: oferty i skrzynki "Do odebrania" (nie do ręcznej edycji).
- `lang/en.yml`, `lang/pl.yml`.
- Stary `rynek.yml` (jeśli jest): przy pierwszym starcie oferty są przenoszone do `listings.yml`
  (data wystawienia = chwila przeniesienia), a plik zmienia nazwę na `rynek.yml.old`.

### `market.yml`

```yaml
limits:
  default: 10            # ile ofert naraz ma gracz
  # więcej daje uprawnienie mainplugins.market.limit.<liczba> (wygrywa najwyższe)
min-price: 1
max-price: 10000000
expire-days: 7           # 0 = oferty nie wygasają
mailbox: true            # przycisk "Do odebrania"
tax-percent: 0           # 0-100; sprzedający dostaje cenę minus podatek
menu:
  title: "..."           # tytuł okna (tekst z lang, jeśli pusty)
  background: GRAY_STAINED_GLASS_PANE
  buttons:               # dla każdego: slot + material
    prev: {slot: 45, material: SPECTRAL_ARROW}
    next: {slot: 53, material: SPECTRAL_ARROW}
    mine: {slot: 47, material: HOPPER}
    search: {slot: 46, material: OAK_SIGN}
    close: {slot: 49, material: BARRIER}
    sort: {slot: 51, material: COMPARATOR}
    mailbox: {slot: 52, material: CHEST}
```

Oferty wypełniają sloty 10-16, 19-25, 28-34 (jak dziś), a przyciski nie mogą na nie wchodzić
(aplikacja pilnuje, plugin przy kolizji pomija przycisk i pisze ostrzeżenie w konsoli).

### Działanie

- `/market` otwiera menu, `/market sell <cena>` wystawia przedmiot z ręki (polskie aliasy
  `/targ`, `/targ wystaw` - przez `commands.yml` w core i aliasy podkomendy).
- Kliknięcie w cudzą ofertę kupuje, dwa kliknięcia we własną wycofują (jak dziś).
- Wygaśnięcie: co minutę plugin sprawdza oferty; oferta starsza niż `expire-days` znika
  z listy i przedmiot trafia do skrzynki sprzedającego. Wycofana oferta wraca do ekwipunku,
  a gdy się nie mieści - do skrzynki.
- Kupiony przedmiot, który nie mieści się w ekwipunku, trafia do skrzynki kupującego (nic nie spada na ziemię).
  Gdy `mailbox: false`, przedmioty, które się nie mieszczą, spadają na ziemię jak dziś,
  a wygasłe oferty są zwracane do ekwipunku przy następnym wejściu gracza.
- Skrzynka "Do odebrania": osobne okno z przedmiotami, klik = do ekwipunku.
- Podatek: sprzedający dostaje `cena * (100 - tax-percent) / 100` (zaokrąglenie do grosza w dół).
- Sprzedający offline: po wejściu dostaje podsumowanie "Sprzedałeś X przedmiotów za Y"
  (kwoty zbierane w `listings.yml`). Online: wiadomość od razu.
- Limit ofert z uprawnień (bez pluginu Rang). Menu rozpoznawane po własnym InventoryHolder,
  klik po id oferty.

### Komendy admina (`mainplugins.market.admin`)

`/@market reload | list <gracz> | remove <gracz>` - `remove` zdejmuje wszystkie oferty gracza
do jego skrzynki (albo do ekwipunku, gdy skrzynka wyłączona i gracz online).

### Core

- Usunięty nieużywany `MarketService` (i `CoreAPI.getMarketService()`).

## Część 2 - Sklep (`mainplugins-shop`)

Plugin zachowuje wszystkie funkcje (ceny dynamiczne, rotacja, statystyki), każda z przełącznikiem.

### Pliki (`plugins/MainpluginsShop/`)

- `shop.yml` - ustawienia + wygląd menu (dawne `sklep-gui.yml`).
- `categories/<id>.yml` - jedna kategoria na plik.
- Dane (nie do edycji): `prices.yml` (stan cen dynamicznych), `rotation.yml` (stan rotacji),
  `stats.yml` + `stats.csv` (statystyki).
- `lang/en.yml`, `lang/pl.yml`.
- Stare pliki (`sklep.yml`, `sklep-gui.yml`, `pula-rotacyjna.yml`, stare kategorie w starym
  formacie) plugin odkłada do folderu `old/` przy pierwszym starcie i wgrywa treść startową.
  Stan cen i statystyki zaczynają się od zera.

### `shop.yml`

```yaml
categories: [blocks, farming, ores, mob-drops, food]   # kolejność w menu głównym
dynamic-prices:
  enabled: true
  cycle-minutes: 60
  min-multiplier: 0.5
  max-multiplier: 1.5
  reset-days: 14
  max-sell-share: 0.9      # skup nigdy nie przekracza 90% ceny kupna
stats:
  enabled: false
menus:                     # to, co dziś w sklep-gui.yml (main-menu, category-page, buy-picker, search-results)
  main-menu: {size: 54, layout: [...]}
  category-page: {...}
  buy-picker: {...}        # AMOUNT_SLOT z polem amount = ile sztuk
  search-results: {...}
  colors: {...}            # kolory tytułów
  buttons: {...}           # materiały przycisków (teksty w lang)
```

Pozostałe parametry cen dynamicznych (tempo spadku i wzrostu itd.) zostają w kodzie.

### Kategoria `categories/<id>.yml`

```yaml
name: "&bOres"
icon: DIAMOND                 # albo custom: <id>
items:                        # lista, kolejność = kolejność w menu
  - item: DIAMOND             # albo  custom: <id>  z katalogu itemów
    buy: 150                  # cena za paczkę "amount" (brak = nie do kupienia)
    sell: 60                  # cena skupu za paczkę "sell-amount" (brak = nie do sprzedania)
    amount: 1                 # opcjonalne, domyślnie 1
    sell-amount: 1            # opcjonalne, domyślnie 1
    name: "..."               # opcjonalne, nadpisuje nazwę
    lore: ["..."]             # opcjonalne
    instrument: ponder_goat_horn   # opcjonalne, tylko rogi kóz
rotation:                     # opcjonalne - kategoria rotująca
  enabled: true
  show: 5
  every-days: 14
  pool:                       # przedmioty w tym samym formacie co items
    - {item: MUSIC_DISC_13, buy: 10000}
```

- Ceny mogą mieć grosze (np. `0.16`).
- Kupno jak dziś: gracz wybiera liczbę sztuk (1/8/16/32/64), cena liczona proporcjonalnie
  z ceny paczki i zaokrąglana w górę do grosza (np. paczka 64 za 10, 1 sztuka = 0.16).
- Sprzedaż tylko pełnymi paczkami (`sell-amount`); reszta zostaje w ekwipunku (jak dziś).
  Znika wyjątek kategorii "mineraly" na sztywno - wystarczy `sell-amount: 1`.
- W kategorii z rotacją menu pokazuje `items` + aktualnie wylosowane z `pool`.
- Przedmiot rozpoznawany przy sprzedaży: `custom:` po znaczniku custom-id, zwykły po materiale
  i braku znacznika (jak dziś).
- `custom:` nieznane katalogowi = pozycja pominięta + ostrzeżenie w konsoli.

### Spawnery, HUD, core

- **Spawnery:** plugin Spawnerów zgłasza swoje spawnery do katalogu itemów (provider), id np.
  `spawner_zombie`. Szablon "Duży" sprzedaje je jako `custom: spawner_<typ>`. Bez pluginu
  Spawnerów pozycje są pomijane.
- **Łowienie:** bez zmian (wstrzymane). Ryby dalej się sprzedają, bo sklep rozpoznaje je po znaczniku.
- **HUD:** Sklep zgłasza własne placeholdery przez `PlaceholderService` w core - `reset_cen_dni`
  i `event_info` (te same nazwy co dziś) oraz tekst "co teraz warto sprzedać" dla wskazówki HUD.
  `CenyService` znika z core, HUD przestaje go używać.

### Komendy

- Gracz (jak dziś, przez `commands.yml`): `/shop`, `/sell`, `/sellall`.
- Admin (`mainplugins.shop.admin`):
  `/@shop reload | info <przedmiot> | price <przedmiot> buy|sell <kwota> | reset <przedmiot> | resetall |
  multiplier <przedmiot> <x> | event <przedmiot> <x>|off|list | rotation [force] | stats`.
  Zastępuje `/@sklep`, `/@reloadsklep`, `/@statsklep`. `price` zapisuje nową cenę w pliku kategorii.

### Treść startowa i szablony

- **"Mały"** (wgrywany przy pierwszym starcie, EN albo PL według `language` w core):
  5 kategorii (Blocks, Farming, Ores, Mob drops, Food), po 8-10 przedmiotów, ceny za sztukę,
  ceny dynamiczne włączone, bez rotacji, statystyki wyłączone.
- **"Duży"** (tylko szablon w aplikacji, na razie po polsku): obecny sklep przepisany
  skryptem na nowy format - 10 kategorii, paczki i ceny bez zmian, "Kolekcja" jako kategoria
  z rotacją (pula z `pula-rotacyjna.yml`), spawnery jako `custom:`.

## Część 3 - Aplikacja

- **Nowa strona Sklepu** (zastępuje "Kreator sklepu" / `ItemBuilderPage`), styl Skrzynek i Questów:
  - lista kategorii | przedmioty kategorii wyglądające jak w grze | edycja w zwiniętych sekcjach;
  - przedmiot: wybór z katalogu (ItemPicker), "Cena kupna za sztukę" i "Cena skupu za sztukę",
    przełącznik "Sprzedawaj w paczkach" (pola `amount`/`sell-amount`), nazwa i opis, instrument
    (tylko dla rogu kozy);
  - kategoria: nazwa, ikonka, rotacja (włącz, ile pokazywać, co ile dni, pula);
  - zakładka "Ustawienia": ceny dynamiczne, statystyki, wygląd menu (SlotGrid z przeciąganiem);
  - zakładka "Statystyki": dane z `stats.yml` (jak na starej stronie);
  - szablony "Mały"/"Duży", "Zapisz" + "Wyślij na serwer" (`@shop reload`), okienko "Komendy".
- **Nowa strona Targu:** limity, ceny min/max, wygasanie, skrzynka, podatek, wygląd menu, "Komendy".
- Zapis zachowuje nieznane pola yml (round-trip).
- Świeże jary Sklepu, Targu, core, HUD i Spawnerów w aplikacji.

## Kolejność i testy

1. Targ: plugin + strona w aplikacji. Test Karola w grze.
2. Sklep: plugin + zmiany w Spawnerach, HUD i core.
3. Sklep: strona w aplikacji i szablony.
4. Test całości na serwerze testowym (gra + aplikacja).

Testy automatyczne: JUnit dla czystej logiki (parser `market.yml`/`listings.yml`, podatek,
wygasanie, przeniesienie `rynek.yml`; parser kategorii i `shop.yml`, ceny paczek, oferta skupu,
rotacja, test domyślnych plików EN/PL), vitest w aplikacji (odczyt i zapis yml bez gubienia pól,
konwersja szablonu "Duży").
