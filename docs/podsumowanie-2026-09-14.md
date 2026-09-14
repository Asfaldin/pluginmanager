# Podsumowanie 14.09 - Questy, Generatory, odblokowania (dla Stasika)

Gałąź `Karol` w obu repo. Projekt i plan: `docs/superpowers/specs/2026-09-14-questy-design.md`, `docs/superpowers/plans/2026-09-14-questy.md` (część rzeczy z projektu potem uprościliśmy - opis niżej jest aktualny).

## Najważniejsza zasada (Karol)

**Każdy plugin musi działać sam, tylko z core.** Żaden plugin nie blokuje innego ani nie zagląda do innego. Jeśli coś ma łączyć pluginy, to tylko przez core (np. nagrody z nagrodą zastępczą albo odblokowania niżej). Plugin do sprzedaży ma być prosty w zrozumieniu dla klienta.

## Kopia pełnych questów

Stary, rozbudowany plugin Questów (liczniki sklepu i Targu, poziomy narzędzi, 17 kategorii) jest nietknięty na gałęzi **`kopia-questy-pelne`** w repo Pluginy - na nasz serwer.

## Plugin Questów (`mainplugins-quests`) - przepisany od zera na fundament

**Pliki:** `quests.yml` (treść i wygląd), `progress.yml` (postęp graczy), `lang/en.yml` + `lang/pl.yml`. Przy pierwszym starcie plugin wgrywa questy po angielsku albo po polsku - według `language` w core.

**Treść startowa:** 6 kategorii - Main Path (10 zadań po kolei) oraz Mining, Farming, Hunting, Fishing, Woodcutting (po 5).

**Zadania - 4 proste typy wymogów:** `free` (kliknij), `items` (przynieś - zabiera), `money` (zapłać), `have-item` (miej przy sobie - zostaje). Nagrody we wspólnym formacie `rewards:` (money, item, custom, command, crate, key, title, unlock). Skrzynka w domyślnych questach zawsze ma nagrodę zastępczą (działa bez pluginu Skrzynek).

**Kategorie:** odblokowanie po zadaniu z innej kategorii (`after`), zadania po kolei (`sequential`), blask na ikonce do wyboru (`glow`), **własny wygląd każdej kategorii** (`look`: ikonki zadań, ikonki w menu, przyciski, tło strony). Kategoria bez `look` bierze wygląd domyślny z `settings`.

**W grze:** nazwy przedmiotów w opisach są w języku gry gracza (Minecraft tłumaczy sam). Kwoty bez `.00`. Pełny ekwipunek blokuje tylko zadania, które dają przedmiot. Menu rozpoznawane po własnym InventoryHolder, klik po id zadania (dobrze działa też po `/@quests reload`). Stary pusty `quests.yml` (z poprzedniego pluginu) plugin sam odkłada na bok.

**Usunięte (decyzje Karola):** liczniki zakupów w Sklepie i ofert na Targu, poziom narzędzi jako wymóg, nagroda "narzędzie", duże powitanie po pierwszym zadaniu, pasek z przypomnieniem po wejściu, dźwięk powitania, dopisek "New quest available!", specjalna "Główna Ścieżka" (zostało tylko `glow`).

**Komendy:** gracz `/quests` (aliasy `/zadania`, `/quest` przez `commands.yml` w core). Admin (`mainplugins.quests.admin`): `/@quests reload | list | reset <gracz> [kategoria] | complete <gracz> <kategoria> <nr> | undo <gracz> <kategoria> <nr>` (`undo` cofa jedno zadanie, nagrody zostają).

**Jak:** czysta logika z testami JUnit (`QuestConfigParser`, `QuestRules`, `ProgressStore`, test domyślnych plików EN/PL), część z Bukkitem w `QuestManager`, `QuestItems`, `QuestGuiHolder`, `QuestCommand`. Tytuły na czacie: `TytulService` dalej z Questów, pokazuje je plugin Rang (bezpiecznie z wątku czatu).

## Core - odblokowania (klucze)

`UnlockService` (`CoreAPI.getUnlockService()`, plik `plugins/MainpluginsCore/unlocks.yml`): niewidzialne "klucze" graczy. Daje je nagroda `unlock: nazwa` (w każdym pluginie) albo admin `/@unlock give|take|list <gracz> [nazwa]`. `QuestService` usunięty z core.

## Odcięcie od Questów

- **Spawn:** warp nie sprawdza już zadania nr 16. Zamiast tego `requires-unlock` przy warpie w `warps.yml`, ustawiane `/@warplock <warp> [klucz]` (bez nazwy = otwarty). Nowe `lang/en.yml` + `lang/pl.yml` w Spawnie (na razie tylko teksty blokady).
- **Sklep i Targ:** nie zgłaszają już zakupów, sprzedaży ani ofert do Questów.

## Generatory - osobny plugin (`mainplugins-generators`)

Przeniesione 1:1 z Questów (bruk, piasek/żwir, tiery, receptura, `generatory.yml`), bez zmian w działaniu i **na razie bez licencji**. Folder na serwerze: `plugins/MainpluginsGenerators/`. Uprawnienia `mainplugins.generators.*`.

## Aplikacja

- **Nowa strona Questów** w stylu Skrzynek: kategorie | lista zadań (wygląda jak w grze, z numerami, zwijana) | edycja w zwiniętych sekcjach (Nazwa i wygląd, Zasady, Ikonki przyciski i tło, Wygląd strony w grze). Zadanie: tytuł, opis, wymóg (4 typy, itemy z katalogu), nagrody (wspólny `RewardEditor`). "Zapisz" + "Wyślij na serwer" (`@quests reload`), okienko "Komendy".
- **Menu główne:** siatka 54 pól, "Zmień układ" z przeciąganiem myszką (`SlotGrid` ma teraz przeciąganie, tryb bez pasków `plain`, podpis pustych pól), "Tło menu".
- **Szablony:** "Mały" (język według serwera) i "Duży" (17 kategorii, na razie po polsku - `scripts/convert-big-quests.mjs`). Bez `quests.yml` na serwerze aplikacja pokazuje domyślne questy do wysłania.
- **Wspólne kawałki** przeniesione do `components/EditorBits.tsx` (`Fold`, `CopyRow`, `CommandTip`, `LoreEditor`), a `ItemRef` do `lib/itemRef.ts`.
- **Generatory:** strona zapisuje do `MainpluginsGenerators/generatory.yml`, nowy plugin na listach i wbudowany (21 jarów), w `freePlugins.ts` tymczasowo jako darmowy.
- Szybki w ikonkach pokazane jako całe szkło (wcześniej była widoczna sama krawędź).

## Do zrobienia później

- **Licencja Generatorów** (płatny czy darmowy, pakiety) - do ustalenia z Tobą.
- **Generatory:** generator bruku nie daje bruku - sprawdzić przy przeróbce Generatorów na fundament.
- **Tytuły na czacie → plugin Rang** (lista tytułów, tytuły graczy, nagroda `title`) - przy przeróbce Rang. W aplikacji przycisk jest na razie zablokowany.
- **Plugin "Obszary":** spawn i warpy przenieść do niego.
- **Języki:** przetłumaczyć duży szablon questów na angielski.
- Następny plugin na fundament: **Osiągnięcia**.
