# Podsumowanie pracy — 11.09.2026 (Karol + Claude)

Co zrobiliśmy i co planujemy dalej, żebyśmy nie dublowali roboty.

## Gdzie co jest

- **Pluginy (repo Pluginy):** gałąź **`Karol`**. Poprawka Spawna z `main` (usunięty import `ObszarService`) jest już wmergowana.
- **Aplikacja (repo pluginmanager):** gałąź **`Karol`** (bieżąca praca) i **`dev`** (wspólna — trafia tam tylko to, co razem zatwierdzimy).
- **Projekt i plany:** `docs/superpowers/specs/2026-09-11-fundament-design.md` oraz `docs/superpowers/plans/2026-09-11-fundament-plan-1-core.md` i `...-plan-2-compat.md` (repo pluginmanager).
- Każda zmiana to osobny commit z opisem — wszystko da się cofać pojedynczo.

## Cel („fundament”)

Pluginy w pełni ustawialne z aplikacji (nic na sztywno w Javie), klient może zacząć od pustego, każdy plugin działa sam z samym core, zgodność z Vault / PlaceholderAPI / LuckPerms / EssentialsX, dwa języki (EN główny + PL). Kolejność: najpierw fundament w core → jeden plugin pilotażowy od A do Z → reszta po kolei.

## Zrobione w pluginach (Karol) — przetestowane na serwerze testowym

### Core — etap 1

- **`LangService`** — pliki `lang/en.yml` + `lang/pl.yml` w każdym pluginie, język serwera w `config.yml` core (`language: en/pl`), fallback do angielskiego, `/@reloadlang`.
- **Katalog itemów** — zamiast `custom-items.yml` folder `items/*.yml` (Twoje 47 itemów rozdzielone na `examples` / `quests` / `fishing`, nic nie zginęło). Doszły:
  - enchanty i `unbreakable`,
  - `idOf(ItemStack)` — rozpoznawanie po tagu custom-id zamiast po Materialu,
  - `CustomItemProvider` dla itemów ze stanem (pod ewoluujące narzędzia — jeszcze niepodpięte, bo narzędzia się zmieniają),
  - `registerDefaults` — plugin dopisuje do katalogu swoje domyślne itemy.
- **Wspólne nagrody** — `RewardService`, jeden format `rewards:`:
  - typy `money` / `item` / `custom` / `command` (+ `amount`, `silent`, `fallback`),
  - typy spoza core (`key`, `title`…) pluginy rejestrują przez `registerType`,
  - brak pluginu → fallback albo pominięcie z ostrzeżeniem; pełny ekwipunek → item pod nogi,
  - komenda testowa `/@rewardtest`.
- `/money` bez `.00` (`MoneyFormat.pelna`), trofea jako prawdziwe głowy (smok, zombie, szkielet).

### Core — etap 2

- **PlaceholderAPI** — `PlaceholderService`, jedna ekspansja `mainplugins` w core. HUD rejestruje swoje placeholdery przez core (stare nazwy `kasa`, `top_gracz_linia_N`… działają). Nowe: `money`, `money_short`. Placeholdery działają też w tekstach z plików językowych.
- **Vault w obie strony** — `economy: own` (domyślnie: nasza kasa widoczna dla innych pluginów, priorytet High) albo `economy: vault` (nasze pluginy na kasie np. EssentialsX; wtedy bez rankingu najbogatszych).
- **Komendy** — `commands.yml` w core:
  - komendy graczy domyślnie po angielsku (`/pay`, `/balance`, `/shop`, `/sell`, `/quests`, `/tpa`…), polskie jako aliasy,
  - wyłączanie i zmiana nazw komend,
  - domyślne uprawnienie dla każdej komendy (pod LuckPerms),
  - przy kolizji z innym pluginem wygrywa tamten, nasza zostaje pod `/plugin:nazwa`.

### Inne pluginy

- **Teleport** — alias `/tp` → `/tpa` (zabierał vanilla `/tp`).
- **Skyblock** — bez WorldEdita. Wyspa startowa to wbudowana struktura Minecrafta (`islands/default.nbt` w jarze, zbudowana przez Karola); admin zapisuje własną przez `/@islandtemplate pos1 / pos2 / save`.
- Testy JUnit w core i Skyblocku (core ~50 testów).

## Zrobione w aplikacji

- **Serwer „na tym komputerze”** — profil serwera może być folderem lokalnym zamiast SFTP (`local_fs.rs`, zapis tylko wewnątrz folderu serwera, testy w Rust). Stare profile działają bez zmian.
- **Nowa zakładka Custom itemy** — folder `items/`:
  - z lewej kategorie i wyszukiwarka,
  - w środku lista z ikonami i kolorowymi nazwami,
  - z prawej edycja z podglądem dymka jak w grze,
  - enchanty, niezniszczalny, wykrywanie duplikatów ID.
  - Kopia starego wyglądu: gałąź `kopia-custom-itemy-stary-wyglad`.
- **Questy** — lista custom itemów czyta nowy folder.
- **W trakcie testu:** strona „Ustawienia serwera” (język, pieniądze, edytor `commands.yml`).
- Dodany `vitest` (testy logiki aplikacji).

## Znane sprawy / uwaga

- **Aplikacja ma w środku stare jary pluginów** (`src-tauri/plugin-jars`) — sprzed tych zmian. Trzeba je podmienić przed jakimkolwiek realnym użyciem „Wdrożenia”.
- Zapis przez aplikację nadpisuje pliki `items/*.yml` i `commands.yml` → komentarze w nich giną.
- Na serwerze testowym jest lokalny serwer licencji i jeden klucz testowy „na wszystko”.

## Plany dalej

1. **Dokończyć aplikację** — ustawienia serwera (w teście), podmiana wbudowanych jarów na nowe.
2. **Pilot: Skrzynki (Crates) od A do Z** — nagrody na nowy format `rewards:` (+ typ `key`), itemy z katalogu, teksty w plikach językowych, a w aplikacji **wspólny edytor nagród**, który potem wejdzie do wszystkich edytorów.
3. **Reszta pluginów po kolei na nowe core** — każdy dostaje:
   - pliki językowe,
   - itemy z katalogu (koniec `new ItemStack` na sztywno — ~30 miejsc),
   - wspólne nagrody (koniec trzech osobnych modeli: advancements / quests / crates),
   - kwoty bez `.00`,
   - angielskie nazwy komend adminów (`@…`).
4. **„Każdy plugin sam z core”** — test każdego pluginu osobno, ukrywanie funkcji, gdy brakuje innego pluginu.
5. **Ewoluujące narzędzia** — podpięcie do katalogu itemów, jak ich projekt się ustabilizuje.
6. **Później** — tłumaczenie całej aplikacji na angielski, licencje na każdym pluginie, serwer licencji na VPS z https.

**Jeśli ruszasz któryś z tych pluginów albo core — daj znać, żebyśmy nie pracowali na tym samym naraz.**
