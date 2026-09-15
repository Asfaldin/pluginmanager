# Podsumowanie 15.09 - Osiągnięcia usunięte, Sklep i Targ na fundamencie (dla Stasika)

Gałąź `Karol` w obu repo. Projekt: `docs/superpowers/specs/2026-09-15-sklep-targ-design.md`, plan: `docs/superpowers/plans/2026-09-15-sklep-targ.md`.
**Jeszcze nieprzetestowane w grze** - Karol testuje 16.09.

## Osiągnięcia usunięte

Nasza wspólna decyzja: Questy wystarczą. Usunięty moduł `mainplugins-advancements` (też datapack), komenda w `commands.yml`,
zdarzenie "achievement" w Announcerze, wpis w katalogu serwera licencji i w pakiecie Pro, jar w aplikacji.
Kopia kodu: gałąź **`kopia-osiagniecia`** w Pluginach.

## Kopie przed Sklepem i Targiem

- Pluginy: **`kopia-sklep-targ`** (stary Sklep i Targ).
- Aplikacja: **`kopia-kreator-sklepu`** (stara strona "Kreator sklepu").

## Targ (`mainplugins-market`)

- Pliki: `market.yml` (ustawienia i wygląd), `listings.yml` (oferty, skrzynki, zarobki), `lang/en.yml` + `lang/pl.yml`.
  Stary `rynek.yml` przenosi się sam przy starcie (zostaje jako `rynek.yml.old`).
- Nowe: **wygasanie ofert** (`expire-days`, 0 = nigdy), **skrzynka "Do odebrania"** (wygasłe oferty i kupione przedmioty,
  które się nie mieszczą), **podatek** (`tax-percent`), podsumowanie sprzedaży dla gracza, który był offline.
- Limit ofert z uprawnienia `mainplugins.market.limit.<liczba>` (już nie z pluginu Rang).
- Komendy: `/market`, `/market sell <cena>` (`/targ wystaw`), admin `/@market reload | list <gracz> | remove <gracz>`.
- Core: usunięty nieużywany `MarketService`.

## Sklep (`mainplugins-shop`)

- Pliki: `shop.yml` (ustawienia + wygląd menu, dawne `sklep-gui.yml`), `categories/<id>.yml` (lista pozycji:
  `item`/`custom`, `buy`, `sell`, opcjonalnie `amount`/`sell-amount` = paczka, `name`, `lore`, `instrument`), dane w
  `prices.yml`, `rotation.yml`, `stats.yml` + `stats.csv`, teksty w `lang/`.
- Wszystkie funkcje zostały, każda z przełącznikiem: **ceny dynamiczne** (ustawienia w `shop.yml`, algorytm bez zmian),
  **rotacja** (teraz ustawienie dowolnej kategorii: `rotation: {show, every-days, pool}`), **statystyki**.
- **`price-rounding: whole | cents`** - pełne złotówki (jak dawniej) albo grosze. Liczenie cen 1:1 jak dawniej (testy na naszych cenach).
- Własna nazwa/opis tylko na ikonce - kupiony przedmiot jest zwykły (łączy się w stos).
- Pierwszy start nowej wersji: stare pliki idą do `plugins/MainpluginsShop/old/`, wgrywa się sklep **"Mały"** (5 kategorii, EN albo PL wg języka serwera).
- Komendy admina: **`/@shop`** `reload | info | price | reset | resetall | confirm | multiplier | event | rotation | stats`
  (zastępuje `/@sklep`, `/@reloadsklep`, `/@statsklep`).
- HUD: `reset_cen_dni`, `event_info` i wskazówkę "co drożeje" daje teraz Sklep przez placeholdery (core `PlaceholderService.resolve`); `CenyService` usunięty z core.

## Spawnery i Generatory

Zgłaszają swoje przedmioty do katalogu itemów core: `custom: spawner_zombie`, `custom: GENERATOR_BRUK_T1` itd.
Działa to w Sklepie i w nagrodach. Stare przedmioty graczy działają dalej.

## Aplikacja

- Nowa strona **Sklep** (zamiast "Kreatora sklepu"): kategorie | pozycje | edycja (przedmiot z katalogu, ceny za sztukę
  albo w paczkach, rotacja), zakładki Ustawienia (zaokrąglanie, ceny dynamiczne, statystyki, układ 4 okien) i Statystyki.
  Szablony: **"Mały"** (EN/PL) i **"Duży"** (nasz sklep, po polsku - `scripts/convert-big-shop.mjs` ze `scripts/old-shop/`).
- Nowa strona **Targ graczy**: limity, ceny, wygasanie, skrzynka, podatek, układ przycisków.
- Świeże jary (core, HUD, Targ, Sklep, Spawnery, Generatory). Testy: 57 vitest, 9 Rust; w Pluginach Targ 16, Sklep 22 JUnit.

## Do zrobienia

- **Test w grze i w aplikacji** (Karol, 16.09) - potem poprawki.
- Na naszym serwerze po starcie wczytać w aplikacji szablon "Duży" i wysłać.
- Łowienie i Lochy - wstrzymane (decyzja Karola).
