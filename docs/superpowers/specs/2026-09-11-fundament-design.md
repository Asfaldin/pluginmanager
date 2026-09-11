# Fundament: ustawialne i zgodne pluginy — projekt

Data: 2026-09-11 · Status: zatwierdzony

## 1. Cel

Klient kupujący nasze pluginy ma móc:
- **ustawić wszystko w aplikacji** – napisy, ceny, itemy, menu, nagrody. Nic nie jest wpisane na sztywno w kodzie Javy;
- **zacząć od pustego** i zbudować własną zawartość;
- **kupić dowolny zestaw pluginów** – każdy działa sam, mając tylko core;
- **łączyć je z popularnymi pluginami** (Vault, PlaceholderAPI, LuckPerms, EssentialsX);
- **grać po angielsku albo po polsku** (angielski jest główny).

Poza zakresem: tworzenie w aplikacji zupełnie nowych pluginów od zera.

## 2. Kolejność prac

1. **Fundament w core** – ten dokument, części A–E.
2. **Jeden plugin próbny, przerobiony od początku do końca**: Java, configi, edytor w aplikacji. Proponowany: Skrzynki (Crates). Ostateczny wybór zapada przy planie.
3. **Reszta pluginów po kolei**, jeden na raz. Przy każdym robimy naraz: katalog itemów, wspólne nagrody, pliki językowe i komendy.

Kod Javy powstaje w repo Pluginy (`D:\folder z mc`), na gałęzi `Karol`. Kod aplikacji powstaje w repo pluginmanager, na gałęzi `dev`.

Stare formaty configów **nie są wspierane**, bo nie ma jeszcze klientów. Domyślne configi przepisujemy na nowy format.

---

## Część A – Wspólne nagrody

**Po ludzku:** jeden sposób zapisu nagród we wszystkich pluginach. Dziś są trzy różne.

**Dziś:** advancements (`model/Reward.java`), questy (`model/RewardEntry.java`) i skrzynki (`Nagroda.java`, tylko zwykłe itemy) mają każdy swój model nagrody.

**Format (wspólny wszędzie):**

```yaml
rewards:
  - money: 500
  - item: DIAMOND
    amount: 3
  - custom: magic_sword
  - key: legendary
  - title: hero
  - command: "give {player} cake"
    silent: true
  - key: epic
    fallback:
      - money: 1000
```

| Typ | Co robi | Czego potrzebuje |
|---|---|---|
| `money` | dodaje pieniądze | ekonomia (core albo Vault, część C) |
| `item` + `amount` | zwykły item Minecrafta | nic |
| `custom` + `amount` | item z katalogu (część B) | core |
| `key` | klucz do skrzynki | plugin Skrzynki |
| `title` | odblokowuje tytuł | plugin z tytułami |
| `command` | komenda z konsoli, `{player}` = nick | nic |

Wspólne pola:
- `silent: true` – bez wiadomości na czacie;
- `fallback:` – lista nagród zastępczych, gdy brakuje wymaganego pluginu.

**Zasady:**
- Brakuje pluginu i jest `fallback` → gracz dostaje nagrodę zastępczą. Brakuje pluginu i nie ma `fallback` → nagroda jest pomijana, a w logu pojawia się ostrzeżenie. Serwer nigdy nie pada.
- Pełny ekwipunek → item wypada graczowi pod nogi (tak jak dziś).
- Szansa i waga losowania **nie są częścią nagrody**. Należą do tego, kto losuje, czyli skrzynki albo łowienia. Ich pozycja = waga + lista `rewards`.
- Komunikaty („Otrzymałeś 500$”) pochodzą z plików językowych (część E), a nie z nagrody.

**Technicznie (core):**
- `RewardService` w `CoreAPI` (zawsze obecny, tak jak `CustomItemService`):
  - `List<Reward> parse(ConfigurationSection/List, String source)` – czyta i sprawdza config, a błędy loguje razem ze źródłem (plik + ścieżka);
  - `void give(Player, List<Reward>)`.
- `Reward` = zamknięty zestaw typów (sealed interface) odpowiadający tabeli wyżej.
- Obecne trzy modele usuwamy przy przerabianiu danego pluginu.

**Aplikacja:** jeden komponent „Edytor nagród”, używany wszędzie tam, gdzie config ma `rewards:`.

---

## Część B – Wspólne itemy

**Po ludzku:** jeden katalog itemów dla wszystkich pluginów. Każdy item ma ukryte „imię” i po nim pluginy go rozpoznają.

**Dziś:** core ma już katalog `custom-items.yml` (około 50 itemów) i `CustomItemService` (create/exists/ids/reload). Każdy item dostaje w sobie ukryty znacznik `custom-id`. Mimo to około 30 plików w pluginach tworzy itemy ręcznie, a część mechanik rozpoznaje item po materiale. Przykład: generator rozpoznaje „każdy MOSSY_COBBLESTONE”.

**Zmiany:**
- **Katalog staje się folderem** `items/*.yml`, np. `items/fishing.yml` i `items/my-items.yml`. Wszystkie pliki są wczytywane razem. Id muszą być unikalne w całym folderze. Duplikat → ostrzeżenie i wygrywa pierwszy.
- **Nowe pola itemu:** `enchants` (mapa enchant → poziom) i `unbreakable`. Nic więcej na razie.
- **Wszędzie ten sam zapis itemu:** `item: MATERIAL` albo `custom: id` (tak samo jak w nagrodach). Dotyczy to sklepu, skrzynek, questów, rynku i ikon menu.
- **Rozpoznawanie po imieniu:** `CustomItemService` dostaje `String idOf(ItemStack)` (null, gdy to nie nasz item). Mechaniki sprawdzają id, a nie materiał.
- **Wygląd należy do katalogu, działanie do pluginu.** Plugin, który potrzebuje itemu (np. generator), przy starcie dopisuje **domyślny wpis** do swojego pliku w `items/`, jeśli wpisu brakuje. Dzięki temu „pusty start” nic nie psuje.
- **Itemy ze stanem** (ewoluujące narzędzia, Kilof Niflheim) – plugin rejestruje w core swojego „dostawcę” dla swoich id. `create(id, amount, player)` najpierw pyta katalog, potem dostawców. Dzięki temu `custom: KILOF_ODKRYWCY` działa tak samo jak każdy inny item. To uogólnia dzisiejszy wyjątek w questach (`ToolsService.stworzEwoluujaceNarzedzie`). **Uwaga:** plugin narzędzi jest wciąż mocno zmieniany, więc w fundamencie powstaje tylko mechanizm dostawców w core. Podpięcie narzędzi robimy później, gdy ich projekt się ustabilizuje.
- **Brak itemu o danym id:** pozycja jest pomijana, a w logu jest ostrzeżenie. Aplikacja sprawdza to przed wysłaniem configu na serwer.

**Aplikacja:** „Edytor itemów” (katalog z podglądem) oraz jeden komponent „Wybierak itemu” (zwykły / z katalogu) używany w każdym edytorze.

**W fundamencie** robimy tylko core i aplikację. Przepinanie około 30 miejsc w pluginach dzieje się przy przerabianiu każdego z nich (punkt 2.3).

---

## Część C – Współpraca z popularnymi pluginami

**Po ludzku:** nasze pluginy dogadują się z tymi, które klient już ma. Żaden z tych pluginów nie jest wymagany.

- **Vault (pieniądze):**
  - nasza ekonomia rejestruje się w Vault jako dostawca, więc inne pluginy (aukcje, prace) widzą nasze pieniądze;
  - ustawienie `economy: own | vault` w core. `vault` = nasze pluginy używają cudzej ekonomii, np. z EssentialsX. Nasze `EconomyService` zostaje, a w trybie `vault` tylko przekazuje wywołania dalej.
- **PlaceholderAPI:** core wystawia napisy typu `%mainplugins_money%`, a pluginy dopisują swoje (ranga, poziom wyspy, tytuł…). Nasze napisy przyjmują też placeholdery z innych pluginów, gdy PAPI jest na serwerze. Dziś korzysta z tego tylko HUD.
- **LuckPerms:** każda nasza komenda ma swoje uprawnienie (np. `mainplugins.shop.use`), więc LuckPerms nimi steruje.
- **EssentialsX / kolizje komend:** każdą naszą komendę można w configu **wyłączyć albo przemianować** i dodać jej aliasy. Dziś `/spawn` i `/warp` gryzą się z EssentialsX.
- Wszystkie te pluginy są w `softdepend` (opcjonalne). Bez nich nasze działają normalnie.

---

## Część D – Dowolny zestaw pluginów

**Po ludzku:** klient może kupić tylko jeden plugin i ten działa sam.

- Na papierze już tak jest: każdy `plugin.yml` wymaga tylko core, reszta jest w `softdepend`. **Nie jest to jednak sprawdzone w praktyce.**
- Funkcje wymagające brakującego pluginu **znikają**, zamiast psuć działanie. Przykłady: quest „poziom wyspy” bez Skyblocka się nie pokazuje, przycisk „Wyspa” w menu jest ukryty, a nagroda `key` korzysta z `fallback`.
- Każde użycie opcjonalnego serwisu z `CoreAPI` (który może zwrócić null) musi obsłużyć jego brak.
- **Aplikacja** wie, które pluginy są na serwerze. Nie podsuwa opcji z brakujących i ostrzega („ten quest potrzebuje Skyblocka”).

---

## Część E – Języki (angielski i polski)

**Po ludzku:** klient wybiera język serwera, a każdy napis może zmienić po swojemu.

- **Pliki językowe:** każdy plugin ma `lang/en.yml` i `lang/pl.yml`, gdzie trzyma wszystkie napisy dla graczy: czat, tytuły menu, opisy przycisków. Dziś te napisy są wpisane w kodzie Javy, tylko po polsku.
- **Jeden język na serwer:** ustawienie `language: en` w core. Język osobny dla każdego gracza nie wchodzi teraz w zakres.
- Brak napisu w wybranym języku → bierzemy angielski. Brak napisu także po angielsku → pokazujemy klucz i logujemy ostrzeżenie.
- **Klucze w configach po angielsku** (`rewards`, `money`, `amount`…).
- **Komendy domyślnie po angielsku** (np. `/pay`, `/balance`), a polskie nazwy działają jako aliasy. Mechanizm z części C pozwala je zmieniać.
- **Technicznie:** `LangService` w core. `msg(plugin, key, placeholders…)` zwraca gotowy tekst z kolorami i placeholderami (w tym PAPI z części C).
- **Aplikacja:** przełącznik języka interfejsu PL/EN oraz edytor napisów dla każdego pluginu.
- W fundamencie powstaje sam mechanizm. Wyciąganie napisów z kodu dzieje się przy przerabianiu każdego pluginu.

---

## 3. Testowanie

- **Lokalny serwer testowy Paper** (Java 25), stawiany osobno, za zgodą.
- Dla fundamentu:
  - testy jednostkowe czytania configów (nagrody, itemy, języki), w tym błędnych wpisów, które mają dać ostrzeżenie zamiast awarii;
  - test ręczny na serwerze: wydanie każdego typu nagrody, rozpoznanie itemu z katalogu, przełączenie języka, praca z Vault i bez niego.
- Dla każdego przerobionego pluginu: start **tylko z core** + start z kompletem, a potem przejście jego głównych funkcji.

## 4. Czego świadomie nie robimy teraz

- języka osobnego dla każdego gracza;
- dodatkowych pól itemów poza `enchants` i `unbreakable` (atrybuty, flagi itp.);
- zgodności wstecz ze starymi formatami configów;
- tworzenia nowych pluginów w aplikacji.

## 5. Do ustalenia przy planie

- Który plugin będzie próbny (propozycja: Skrzynki).
- Kiedy stawiamy lokalny serwer testowy.
