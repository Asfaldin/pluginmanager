# Pilot: Skrzynki na nowym fundamencie - projekt

Data: 2026-09-13 · Status: zatwierdzony w rozmowie (Karol)

Pierwszy plugin przerobiony od A do Z na fundament z `2026-09-11-fundament-design.md`: wspólne nagrody, katalog itemów, pliki językowe, angielskie komendy. Równolegle w aplikacji powstaje **wspólny edytor nagród**, który potem trafi do wszystkich edytorów.

## 1. Decyzje (Karol, 2026-09-13)

1. **Dowolna liczba skrzynek** - ustawiane w aplikacji. Obecne 3 (Tajemnicza / Otchłanna / DARKSTAR) zostają jako domyślny przykład.
2. **Klucze (opcja C)** - domyślnie każda skrzynka ma własny klucz, ale właściciel może ustawić, że jeden klucz otwiera kilka skrzynek (przy każdej skrzynce: lista kluczy, które ją otwierają).
3. **Otwieranie** - tylko skrzynka jako przedmiot (jak dziś: PPM skrzynką w ręce + klucz w ekwipunku → animacja). **Skrzynki postawione na spawnie (blok) - do zrobienia zaraz po pilocie, na koniec prac nad Skrzynkami.**
4. **Podgląd nagród** - LPM skrzynką w ręce otwiera okno z możliwymi wygranymi i szansą na każdą.
5. Animacja „ruletki” jak w CS **zostaje bez zmian**.

## 2. Model danych - `plugins/MainpluginsCrates/crates.yml`

```yaml
keys:
  basic_key:
    name: "&e&lMystery Crate Key"
    item: { item: TRIPWIRE_HOOK }        # albo { custom: ID } z katalogu itemów
    lore: ["&7Opens the Mystery Crate."]
  universal_key:
    name: "&6&lUniversal Key"
    item: { item: TRIPWIRE_HOOK }
    lore: ["&7Opens every crate."]

crates:
  basic:
    name: "&6&lMystery Crate"
    item: { item: ENDER_CHEST }
    lore: ["&7Right-click with a key to open.", "&7Left-click to see the rewards."]
    keys: [basic_key, universal_key]     # które klucze ją otwierają (min. 1)
    prizes:
      - name: "&bDiamond Reward"
        icon: { item: DIAMOND, amount: 4 }
        weight: 20                        # szansa = waga / suma wag
        announce: false                   # true = ogłoszenie na czacie
        rewards:                          # wspólny format nagród (RewardService)
          - item: DIAMOND
            amount: 4
      - name: "&6&l★ LEGENDARY ★"
        icon: { item: NETHER_STAR }
        weight: 1
        announce: true
        rewards:
          - item: NETHER_STAR
          - money: 5000
          - key: basic_key
```

- **Odwołanie do przedmiotu** (`item`, `icon`) - mapa `{ item: MATERIAL, amount? }` albo `{ custom: ID, amount? }` (katalog itemów core). Dla skrzynki i klucza `name`/`lore` z pliku nakładają się na przedmiot bazowy.
- **Jedna wygrana = dowolnie wiele nagród** (`rewards:`), w tym kasa, itemy, custom itemy, komendy, skrzynki (`crate: id`) i klucze (`key: id`), z `fallback`/`silent` jak w fundamencie.
- Kolejność skrzynek w pliku ma znaczenie tylko dla zgodności wstecz (niżej).
- Domyślny `crates.yml` (tworzony przy pierwszym starcie): 3 obecne skrzynki (`basic`, `abyss`, `darkstar`) z obecnymi pulami przepisanymi na `rewards:`, klucze `basic_key`, `abyss_key`, `darkstar_key` + `universal_key` (otwiera wszystkie 3). Teksty domyślne po angielsku.
- Stare pliki `crate-rewards*.yml` nie są już czytane (ostrzeżenie w logu, jeśli istnieją). Bez zgodności wstecz formatu (brak klientów).

**Błędy w pliku** - nigdy wyjątek: zła skrzynka/wygrana/klucz → pominięta z ostrzeżeniem (plik + ścieżka). Skrzynka bez żadnej poprawnej wygranej albo bez żadnego istniejącego klucza → pominięta. Waga < 1 → wygrana pominięta.

## 3. Działanie w grze

- **PPM** skrzynką w ręce: jeśli w ekwipunku jest dowolny klucz z listy `keys` tej skrzynki → zużywa skrzynkę i jeden taki klucz, animacja, na końcu `RewardService.give(gracz, wygrana.rewards)`. Brak klucza → komunikat, który klucz jest potrzebny.
- **LPM** skrzynką w ręce: okno podglądu (do 54 pozycji) - ikona każdej wygranej + w opisie „Szansa: X%” (1 miejsce po przecinku). Kliknięcia w oknie zablokowane.
- **Ogłoszenie** (`announce: true`): `ServerAnnounceEvent("crate-legendary", gracz, {reward, crate})` dla Announcera; bez Announcera - wbudowany broadcast z pliku językowego.
- Przedmioty rozpoznawane po tagach PDC: `crate-id` (tekst) na skrzynce, `key-id` (tekst) na kluczu.
- **Stare przedmioty** w ekwipunkach (tag tieru 1-3 / stary tag klucza) → traktowane jak `basic`/`abyss`/`darkstar` / `universal_key` (jeśli istnieją).

## 4. Zgodność z innymi pluginami

- `CrateService` zostaje; stare metody działają dalej:
  - `stworzSkrzynke(int tier)` → skrzynka nr `tier` w kolejności z `crates.yml` (poza zakresem → pierwsza),
  - `stworzKlucz()` → `universal_key` (brak → klucz pierwszej skrzynki).
- Nowe metody: `createCrate(String id, int amount)`, `createKey(String id, int amount)`, `crateIds()`, `keyIds()`.
- Crates rejestruje w `RewardService` typy **`crate`** i **`key`** (wartość = id, `amount`). Nieznane id albo brak pluginu → `fallback` nagrody. Wiadomość „Otrzymujesz…” z pliku językowego (chyba że `silent`).
- Questy/Łowienie/Lochy/Narzędzia/Osiągnięcia zostają na starych metodach do czasu ich przerabiania.

## 5. Komendy i teksty

- `/@crate give <gracz> <skrzynka> [ile]`, `/@crate key <gracz> <klucz> [ile]`, `/@crate list`, `/@crate reload` (uprawnienie `mainplugins.crates.admin`, podpowiedzi Tab). Stare `@dajklucz`, `@dajskrzynia`, `@dajskrzynie1-3`, `@reloadcrates` usunięte.
- Wszystkie teksty dla graczy/adminów w `lang/en.yml` + `lang/pl.yml` pluginu (`LangService.registerDefaults`).

## 6. Aplikacja - edytor Skrzynek + wspólne komponenty

- **`RewardEditor`** (wspólny) - lista nagród: typ (kasa / item / custom item / komenda / skrzynka / klucz / tytuł), pola zależne od typu, ilość, „bez wiadomości”, nagroda zastępcza (lista nagród, jeden poziom).
- **`ItemRefPicker`** (wspólny) - zwykły item (lista materiałów) albo custom item (lista z katalogu `items/`), + ilość opcjonalnie.
- **Edytor Skrzynek** (nowy `CrateEditorPage`, styl jak Custom itemy): z lewej lista skrzynek + zakładka Klucze; w środku wygrane wybranej skrzynki (ikona, nazwa, szansa %); z prawej edycja wygranej (nazwa, ikona, waga, ogłoszenie, `RewardEditor`) albo ustawienia skrzynki (nazwa, wygląd, opis, klucze - wybór wielu). Nowa skrzynka dostaje automatycznie własny klucz. Zapis do `MainpluginsCrates/crates.yml`, jak inne zakładki („Zapisz” lokalnie → „Wyślij na serwer”).
- Walidacja przed wysłaniem: skrzynka bez wygranych / bez klucza / wygrana bez nagród → ostrzeżenie.

## 7. Testy

- **Java (JUnit, moduł crates):** parser `crates.yml` (poprawne + błędne wpisy), obliczanie szans, losowanie ważone (z podanym generatorem losowym), mapowanie starych tierów/klucza.
- **Aplikacja (vitest):** parse/serialize `crates.yml`, parse/serialize listy nagród (w tym fallback i typy pluginów) - w obie strony bez utraty danych.
- **Ręcznie na serwerze testowym:** skrzynka z własnym kluczem i z uniwersalnym, podgląd LPM, każda z typów nagród w wygranej, ogłoszenie, `/@crate` komendy, stara skrzynka z ekwipunku, nagroda questu dająca skrzynkę (stara metoda), edycja w aplikacji → wysłanie → `/@crate reload`.
- Po zmianach: podmiana jarów wbudowanych w aplikację.

## 8. Poza zakresem pilotu

- Skrzynki postawione na spawnie (blok) - **następny krok po pilocie**.
- Przerabianie innych pluginów na typy `crate`/`key`.
- Stronicowanie podglądu powyżej 54 wygranych.
