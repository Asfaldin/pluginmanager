# Questy na nowym fundamencie + wydzielenie Generatorów + odblokowania w core - projekt

Data: 2026-09-14 · Status: zatwierdzony w rozmowie (Karol)

Drugi plugin przerabiany na fundament (`2026-09-11-fundament-design.md`), tym samym sposobem co Skrzynki (`2026-09-13-skrzynki-pilot-design.md`).

## 1. Decyzje (Karol, 2026-09-14)

1. **Plugin do sprzedaży ma być prosty w zrozumieniu** (nie okrojony na siłę). Wypadają rzeczy, które zależą od innych pluginów albo mylą: liczniki zakupów/sprzedaży w Sklepie, oferty na Targu, poziom ewoluujących narzędzi jako wymóg, osobna nagroda "ewoluujące narzędzie".
2. **Żaden plugin nie blokuje innego.** Każdy działa sam z core. Blokowanie postępu jest możliwe, ale przez wspólne **odblokowania w core** (rozdz. 4), a nie przez zaglądanie jednego pluginu do drugiego.
3. **Pełna wersja questów zostaje dla naszego serwera** - PIERWSZY krok prac: obecny plugin nietknięty na gałęzi `kopia-questy-pelne` w repo Pluginy.
4. **Treść startowa - dwie wersje (EN i PL)**, plugin wgrywa tę, która pasuje do języka serwera w core. Mała: Główna Ścieżka (10 zadań) + Górnictwo, Hodowla, Łowca, Rybak, Drwal (po 5).
5. **Duża treść** (obecne 17 kategorii, ok. 80 zadań) zostaje jako **szablon w aplikacji** ("Wczytaj szablon"), nie jako domyślna.
6. **Nowe typy zadań (zabij moby, wykop bloki...) - nie teraz.** Osobna runda później.
7. **Generatory wydzielone do osobnego pluginu**, przeniesione 1:1 bez przeróbki; **na razie bez licencji** (decyzja ze Stasikiem). Do sprawdzenia i przerobienia później.
8. **Strona Questów w aplikacji - pełna przeróbka w stylu Skrzynek.**

## 2. Plugin Questów - pliki

Folder `plugins/MainpluginsQuests/`:

- `quests.yml` - treść: ustawienia wyglądu, menu główne, tytuły na czacie, kategorie z zadaniami. Tworzony przy pierwszym starcie z `defaults/quests-en.yml` albo `defaults/quests-pl.yml` (według `language:` w core; inny język → `en`). Potem nigdy nie nadpisywany automatycznie.
- `progress.yml` - postęp graczy (per gracz: per kategoria lista ukończonych id + zdobyte tytuły). Stary `quests.yml` z postępem i `quests-content.yml` nie są czytane (brak klientów, bez zgodności wstecz).
- `lang/en.yml` + `lang/pl.yml` - wszystkie teksty menu i wiadomości (`LangService.registerDefaults`).

### Format `quests.yml`

```yaml
settings:
  join-reminder: true                 # pasek po wejściu, gdy w Głównej Ścieżce jest zadanie do zrobienia
  welcome-sound: "mainplugins:quest_welcome"   # po pierwszym zadaniu Głównej Ścieżki (pusty = bez dźwięku)
  filler: { item: BLACK_STAINED_GLASS_PANE }
  icons:
    available: { item: RED_DYE }
    completed: { item: LIME_DYE }
    locked: { item: GRAY_DYE }
    category-locked: { item: GRAY_DYE }
    category-empty: { item: BARRIER }
  buttons:
    back: { item: DARK_OAK_DOOR }
    prev: { item: ARROW }
    next: { item: ARROW }

main-menu:
  layout:                             # sloty 0-53; role: CATEGORY_SLOT | FILLER (+ opcjonalnie item)
    - { slot: 22, role: CATEGORY_SLOT }

category-order: [main_path, mining, farming, hunting, fishing, woodcutting]

titles:
  beginner: "&7&l[Beginner] "

categories:
  main_path:
    name: "Main Path"
    icon: { item: KNOWLEDGE_BOOK }
    description: "Start here - quests in order!"
    main-path: true                   # dokładnie jedna kategoria: powitanie, przypomnienie, blask ikony
    sequential: true                  # zadanie N+1 czeka na N
    after: null                       # albo { category: main_path, quest: 5 } - odblokowanie zadaniem z innej kategorii
    requires-unlock: null             # albo nazwa odblokowania z core (rozdz. 4)
    page-layout:                      # role: QUEST_SLOT | NAV_PREV | NAV_BACK | NAV_NEXT | FILLER
      - { slot: 0, role: QUEST_SLOT }
    quests:
      - id: 1                         # stałe w obrębie kategorii (na nim trzyma się postęp)
        title: "Welcome"
        description: ["Your adventure starts now."]
        requirement: { type: free }
        rewards:                      # wspólny format nagród (RewardService)
          - item: WOODEN_PICKAXE
        reward-label: null            # opcjonalnie; puste = etykieta składana z nie-cichych nagród
```

**Wymogi (`requirement.type`) - 4 typy:**

| typ | pola | działanie |
|---|---|---|
| `free` | - | kliknięcie od razu zdaje zadanie |
| `items` | `items: [{item: X, amount: N} \| {custom: ID, amount: N}]` | trzeba mieć wszystkie; zabierane po zdaniu |
| `money` | `amount` | płaci się z portfela |
| `have-item` | `item: {item: X} \| {custom: ID}`, `amount` (domyślnie 1) | trzeba mieć; zostaje u gracza |

Custom itemy rozpoznawane po tagu katalogu (`CustomItemService.idOf`), zwykłe po materiale.

**Nagrody:** wspólna lista `rewards:` - `money`, `item`, `custom`, `command`, `crate`, `key` (od Skrzynek, z `fallback` gdy ich brak), `unlock` (core, rozdz. 4) i **`title`** (rejestruje go Questy: dopisuje id z sekcji `titles` do tytułów gracza). `silent` i `fallback` jak w fundamencie.

**Nazwy przedmiotów** w opisach wymogów i etykietach nagród: nazwy z Minecrafta (`Component.translatable`, gracz widzi je w języku swojej gry); custom item - nazwa z katalogu. Znika polska lista nazw w kodzie. Kwoty bez `.00` (`MoneyFormat`).

**Błędy w pliku** - nigdy wyjątek: złe zadanie/wymóg/kategoria → pominięte z ostrzeżeniem (plik + ścieżka). Brak kategorii `main-path` → działa, tylko bez powitania i przypomnienia. Duplikat id zadania w kategorii → drugie pominięte.

## 3. Plugin Questów - działanie, komendy, powiązania

- Działanie w grze jak dziś: menu kategorii → strona kategorii → klik zadania = sprawdzenie wymogu, zabranie kosztu, nagrody, zapis postępu. Stany: dostępne / ukończone / zablokowane (kategorie `sequential`). Kategoria zablokowana przez `after` albo `requires-unlock` → ikona `category-locked` + opis, czego brakuje (z pliku językowego).
- Menu rozpoznawane po własnym `InventoryHolder`, nie po tytule okna (tytuły są w pliku językowym).
- **Komendy:** gracz `/quests` (alias `/zadania`, przez `commands.yml` w core); admin (`mainplugins.quests.admin`, podpowiedzi Tab): `/@quests reload`, `/@quests reset <gracz> [kategoria]`, `/@quests complete <gracz> <kategoria> <nr>` (zalicza bez wymogu, daje nagrody), `/@quests list`. Stare `@reloadquesty`, `@addkruchy`, `@dajbrukgen`, `@dajgenerator`, `@reloadgeneratory` znikają z Questów (generatorowe przechodzą do Generatorów, rozdz. 5).
- **Odcięcie od innych pluginów:** `QuestService` znika z core (i `CoreAPI.getQuestService`); Sklep i Targ przestają zgłaszać zakupy/oferty; Spawn przestaje sprawdzać zadanie nr 16 (zamiast tego `requires-unlock`, rozdz. 4). `TytulService` zostaje - Questy dają tytuł, Rangi go pokazują, jeśli są zainstalowane.
- Licencja bez zmian: Questy dalej sprawdzają licencję jak dziś.

## 4. Odblokowania w core (nowe)

Wspólne "klucze do drzwi" - pluginy nic o sobie nie wiedzą, rozmawiają tylko z core.

- `UnlockService` w core (`CoreAPI.getUnlockService()`): `has(uuid, name)`, `give(uuid, name)`, `take(uuid, name)`, `list(uuid)`. Zapis w `plugins/MainpluginsCore/unlocks.yml`. Nazwy małymi literami.
- Nagroda **`unlock: <nazwa>`** wbudowana w `RewardService` (jak `money`).
- Komenda admina `/@unlock give|take|list <gracz> [nazwa]` (`mainplugins.core.unlock`), teksty w plikach językowych core.
- Pierwsze użycia: Questy - nagroda `unlock` i pole `requires-unlock` przy kategorii; Spawn - pole `requires-unlock` przy warpie w `warps.yml` (zachowywane przy zapisie) + `/@warplock <warp> [nazwa]` (bez nazwy = zdjęcie blokady). Zaszyty na sztywno kowal/zadanie 16 znika. Inne pluginy dostaną `requires-unlock` przy swoich przeróbkach.
- W domyślnej treści Questów żadne zadanie nie daje odblokowania (klient sam decyduje).

## 5. Plugin Generatory (wydzielenie)

- Nowy moduł `mainplugins-generators` (`MainpluginsGenerators`, pakiet `elo.mainplugins.generators`, `depend: [MainpluginsCore]`). Przeniesione 1:1: `GeneratorBrukuManager`, `GeneratorKruchychManager`, pakiet `generator/`, `generatory.yml`, receptura generatora kruchych, komendy `@addkruchy`, `@dajbrukgen`, `@dajgenerator`, `@reloadgeneratory` z uprawnieniami.
- Bez zmian w działaniu i tekstach. **Bez sprawdzania licencji** (na razie).
- Aplikacja: strona Generatory zapisuje do `MainpluginsGenerators/generatory.yml`; nowy plugin na liście pluginów i jako wbudowany jar.
- Znane skutki: generatory postawione na serwerze testowym mogą przestać działać (zmiana właściciela kluczy/receptury) - wydaje się nowe.

## 6. Aplikacja - strona Questów (pełna przeróbka w stylu Skrzynek)

- **Z lewej** lista kategorii: dodaj, usuń (kosz z potwierdzeniem), kolejność (= `category-order`). Nazwa z odstępami → id (`idFromName`).
- **Po wybraniu kategorii - zwijane sekcje:** *Nazwa i wygląd* (nazwa, ikonka, opis, Główna Ścieżka); *Zasady* (po kolei, `after`, `requires-unlock`); *Zadania* (lista z kolejnością i koszem; edycja: tytuł, opis, wymóg - 4 typy z `ItemRefPicker`, nagrody - wspólny `RewardEditor` z typami `title` i `unlock`, etykieta nagrody); *Wygląd strony* (klikalna siatka 54 slotów).
- **Sekcje ogólne:** *Menu główne* (siatka), *Tytuły na czacie* (id + tekst), *Wygląd* (`settings`: ikonki, przyciski, wypełniacz, przypomnienie, dźwięk).
- **"Zapisz"** (w aplikacji) → **"Wyślij na serwer"** (zapis `quests.yml` + `/@quests reload` przez RCON). Bez pliku na serwerze → wgranie domyślnego (według języka).
- **"Przydatne komendy"** z kopiowaniem (`/@quests complete ...`, `reset`, `reload`, `/@unlock ...`).
- **"Wczytaj szablon":** Mały EN, Mały PL, Duży PL. Duży = obecna treść przepisana na nowy format; zadania z usuniętymi typami (sklep, Targ, poziom narzędzia, nagroda narzędzie) zamienione na `items`/zwykłe nagrody.
- Walidacja przed wysłaniem: kategoria bez zadań, zadanie bez nagród, `after` wskazujące na nieistniejące zadanie, brak Głównej Ścieżki → ostrzeżenie.
- Plik zachowuje nieznane pola przy zapisie (round-trip).

## 7. Testy

- **Java (JUnit):** parser `quests.yml` (poprawne + błędne wpisy, 4 wymogi, `after`/`requires-unlock`), stany zadań (sequential), wybór pliku domyślnego wg języka; core: `UnlockService` (zapis/odczyt), nagroda `unlock`.
- **Aplikacja (vitest):** parse/serialize `quests.yml` w obie strony bez utraty danych (też nieznane pola), szablony parsują się bez błędów.
- **Ręcznie na serwerze testowym:** pierwszy start PL i EN, każdy wymóg, każda nagroda (w tym `crate`, `title` widoczny z Rangami, `unlock`), kategoria z `after` i z `requires-unlock`, `/@quests` komendy, `/@unlock`, warp z `requires-unlock`, Generatory po przeniesieniu (sprawdzenie podstawowe), edycja w aplikacji → wysłanie → reload.
- Po zmianach: podmiana jarów wbudowanych w aplikację.

## 8. Poza zakresem

- Przeróbka Generatorów na fundament, ich licencja.
- Nowe typy zadań (zabij, wykop, złów, wytwórz).
- `requires-unlock` w innych pluginach niż Questy i Spawn.
- Ewoluujące narzędzia jako nagroda (wrócą przez katalog itemów przy przeróbce Narzędzi).
- Pełna przeróbka Spawna (teksty, angielskie komendy) - tylko `requires-unlock`.
