# Podsumowanie 13.09 - Skrzynki (dla Stasika)

Gałąź `Karol` w obu repo. Twoja praca z `dev` (konto, Dashboard, Texturepack Creator, schematy, okno-prompt) jest już połączona z naszą.

## Plugin Skrzynek (`mainplugins-crates`) - przepisany na nowy fundament

**Co:**
- Dowolna liczba skrzynek i kluczy w jednym pliku `plugins/MainpluginsCrates/crates.yml` (stare `crate-rewards*.yml` nie są już czytane).
- Każda skrzynka ma swój klucz, ale jeden klucz może otwierać kilka skrzynek (domyślnie `universal_key` otwiera wszystkie 3).
- Wygrana = ikona + nazwa + szansa + lista nagród we wspólnym formacie `rewards:` (money / item / custom / command / crate / key), więc jedna wygrana może dać kilka rzeczy.
- Lewy klik skrzynką = podgląd nagród z szansami. Prawy klik z kluczem = ruletka jak wcześniej.
- **Skrzynki postawione w świecie:** `/@crate place <skrzynka>` (patrzysz na blok) i `/@crate remove`. Zapis w `placed.yml`, blok chroniony (niszczenie, wybuchy, tłoki), napis nad blokiem (TextDisplay, włączany i edytowany per skrzynka), blok sam przyjmuje wygląd przedmiotu skrzynki.
- Gracz, który wyjdzie albo wyleci w trakcie ruletki (albo serwer się wyłączy), dostaje wylosowaną nagrodę od razu - bez przepadania i bez losowania od nowa.
- Komendy: `/@crate give|key|place|remove|list|reload` (stare `@dajklucz`, `@dajskrzynie1-3`, `@reloadcrates` usunięte). Teksty w `lang/en.yml` + `lang/pl.yml`.

**Jak:** czysta logika osobno i z testami JUnit (`CrateConfigParser`, `CrateOdds`, `PlacedCrateStore`), a część z Bukkitem w `CrateManager`, `CrateItems`, `PlacedCrates`, `CrateCommand`. W core `CrateService` ma nowe metody `createCrate(id, ile)`, `createKey(id, ile)`, `crateIds()`, `keyIds()`. Stare `stworzSkrzynke(tier)` i `stworzKlucz()` dalej działają, więc questy, łowienie, lochy i osiągnięcia nic nie musiały zmieniać. Nowe typy nagród `crate:` i `key:` działają w nagrodach każdego pluginu.

## Aplikacja

- **Nowa strona Skrzynki:** lista skrzynek (kosz z potwierdzeniem) | wygrane z % | edycja w zwijanych sekcjach. Szansa wpisywana w %, a reszta dopasowuje się sama do 100%. Przycisk „Zapisz” zapisuje w aplikacji, „Wyślij na serwer” wysyła i robi `@crate reload`. Nazwy ze spacjami (ID do komend robi się samo). Okienko „Komendy” z przyciskami „Kopiuj”.
- **Wspólne komponenty** do użycia w innych edytorach: `components/RewardEditor.tsx` (lista nagród), `components/ItemRefPicker.tsx` (zwykły item albo custom item).
- **Pełna lista 1536 przedmiotów** (`lib/minecraftItems.ts`, wygenerowana z Paper API) we wszystkich edytorach zamiast listy z nazw tekstur (brakowało np. `ENDER_CHEST`).
- **Ikonki skrzyń i głów** składane z tekstur modeli (`MaterialIcon`).
- W nowym kodzie Skrzynek użyłem Twojego `showPrompt`.

## Porządki

- Długi myślnik „—” i krótki „–” zamienione na zwykły „-” w całym kodzie, tekstach i dokumentach obu repo (Karol tak chce - pisz proszę też tylko „-”).
- Zasada Karola: każde ustawienie i tekst pluginu musi być w yml, nic na sztywno w kodzie, żeby aplikacja mogła to edytować.

## Do zrobienia później

- Questy, łowienie, lochy i osiągnięcia dają skrzynki „po numerze” (stare API) - przepiąć na ID przy przerabianiu tych pluginów.
- Pozostałe pluginy po kolei na nowy fundament (wspólny `RewardEditor` gotowy).
