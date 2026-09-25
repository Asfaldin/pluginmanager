# Wzór wyglądu stron pluginów w aplikacji (na podstawie Sklepu, 25.09.2026)

Strona **Sklepu** jest wzorem dla wszystkich pozostałych edytorów pluginów (Targ, Skrzynki, Questy
i kolejne). Ten plik opisuje, jak wygląda i jak działa - kolory, układ, gotowe kawałki kodu, pomoc,
teksty. Kod: `desktop-app/src/pages/ShopEditorPage.tsx` + `desktop-app/src/pages/shop/*`,
wspólne kawałki w `desktop-app/src/components/`.

Najważniejsza myśl: **klient nie jest programistą.** Nie widzi plików, kodów kolorów ani żargonu.
Widzi procenty, dni, złotówki, podgląd jak w grze i krótką pomoc przy każdej rzeczy.

---

## 1. Kolory

### Paleta aplikacji (`App.css`, `:root`)

| Token | Ciemny | Do czego |
|---|---|---|
| `--bg` | `#0d0b12` | tło strony |
| `--surface` | `#17141f` | karty, panele, menu |
| `--surface-hover` | `#211c2e` | najechanie, wybrana pozycja |
| `--border` / `--border-strong` | `#2c2638` / `#3e3550` | ramki |
| `--text` / `--text-muted` | `#f0eaff` / `#a89ec2` | tekst / szary opis |
| `--accent` / `--accent-strong` | `#a855f7` / `#c084fc` | fiolet - JEDYNY kolor akcentu |
| `--danger` | `#f85149` | błąd |
| `--success` | `#3fb950` | sukces |
| żółty ostrzeżeń | `#facc15` | ostrzeżenie, nieotwarte „?” |

Jasny motyw zmienia tylko tła, ramki i tekst - fiolet zostaje. **Nie wpisuj kolorów na sztywno**, używaj
tokenów (`var(--accent)`, `color-mix(in srgb, var(--accent) 12%, transparent)` na delikatne tła).
Wyjątek: podglądy Minecrafta (siatka okna, czat) mają własne, „growe” kolory.

### Co znaczy kolor (zasada Karola)

| Kolor | Znaczy | Klasa | Przykład |
|---|---|---|---|
| **Fioletowy** | zwykła informacja | `ci-note` | „Razem ze statystykami sklep zapisuje historię...” |
| **Żółty** | ważne, uważaj | `ci-warning` | „Rotacja pokazuje 5, a pól rotacji jest 3” |
| **Czerwony** | coś NIE DZIAŁA / niebezpieczne | `ci-error`, `ci-badge warn`, `ci-danger` | brak pluginu, „Uwaga” w Strojeniu, przycisk usuwania |
| **Zielony / czerwony tekst** | w górę / w dół | `ci-live-up` / `ci-live-down` | „skup +50%”, „kupno -20%” |

Nigdy żółty dla błędu, nigdy czerwony dla zwykłej informacji.

---

## 2. Układ strony

```
← Twoje pluginy
SKLEP
Jedno zdanie, co tu się ustawia.                 [📋 Szablon: Duży - nasz polecany ▾]
[Serwer ▾] [Komendy] [Zakładka1] [Zakładka2] ... [📖 Jak działa sklep]   [Cofnij] [Ponów] [Wczytaj z serwera] [Zapisz] [Wyślij na serwer]
```

- **Nagłówek** (`ci-page-intro`): opis w jednym zdaniu, obok menu szablonów.
- **Jeden pasek** (`ci-toolbar`, bez zawijania, zwykła wielkość przycisków): serwer, Komendy, zakładki
  (aktywna fioletowa - `ci-publish`), duży przycisk przewodnika. Z prawej zawsze w tej kolejności:
  **Cofnij, Ponów, Wczytaj z serwera, Zapisz, Wyślij na serwer** (ostatni, fioletowy).
  Obok: szary napis „masz niezapisane zmiany” / „zapisane, jeszcze niewysłane”.
- **Zakładka z listą rzeczy** (np. Kategorie): 3 kolumny - lista z lewej (z liczbą i koszem),
  lista w środku (z sortowaniem i filtrem), edycja wybranej rzeczy z prawej w zwiniętych sekcjach.
- **Ustawienia**: menu sekcji z lewej (każda z krótkim stanem pod nazwą, np. „włączone”), JEDNA sekcja
  z prawej, kolumna „Zmiany do wysłania” (co się różni od serwera, z cofaniem pojedynczo).
- **Wygląd okien w grze**: przełącznik okien u góry, z lewej lista i małe karty ustawień, siatka jak w grze.

---

## 3. Gotowe kawałki (użyj zamiast pisać od nowa)

| Kawałek | Plik | Do czego |
|---|---|---|
| `HelpButton` | `components/EditorBits.tsx` | „?” (jak działa), „!” (`kind="info"`, co to jest), z `label` = duży przewodnik z książką |
| `Fold` | `EditorBits` | zwijana sekcja (tytuł wielkimi literami) |
| `ConfirmButton` | `EditorBits` | działa po 2. kliknięciu („Przywróć domyślne”) |
| `CopyRow`, `CommandTip` | `EditorBits` | komenda z przyciskiem „Kopiuj”, ramka „Przydatne komendy” |
| `ListToggle`, `StatusBar` | `EditorBits` | zwijana lista, pasek komunikatu z krzyżykiem |
| `ask` | `components/AskModal.tsx` | pytanie Tak/Anuluj w stylu appki (NIGDY `plugin-dialog`) |
| `showPrompt` | `components/PromptModal.tsx` | wpisanie tekstu (np. nazwa szablonu) |
| `MinecraftTextInput` | `components/MinecraftTextInput.tsx` | pole z kolorami „jak w Wordzie”, klocki wstawek |
| `MinecraftTextPreview`, `SamplePreview` | `components/` | kolorowy tekst; podgląd z przykładami (przerywana linia) |
| `SlotGrid` | `components/SlotGrid.tsx` | siatka okna jak w grze (przeciąganie, `rotating`, `dim`, `blank`) |
| `ItemRefPicker`, `MaterialIcon` | `components/` | wybór przedmiotu z ikonką |
| `pm-switch` (CSS) | `App.css` | mały suwak włącz/wyłącz |
| `lib/plText.ts` | | `plural`, `everyDays`, `everyMinutes`, `num` - polska odmiana |

Wzory do skopiowania ze Sklepu: menu szablonów (`ShopTemplateMenu`), „Teksty w grze”
(`ShopTextsSection` + `lib/shopAnnounce.ts`), zakładka na żywo (`ShopEventsTab` + `lib/shopLive.ts`),
Cofnij/Ponów dla całej strony (`historyRef` w `ShopEditorPage`).

---

## 4. Pola i formularze

- **Liczba**: pogrubiona nazwa (`ci-field-title`), obok okienko z **jednostką** (min, %, dni, szt.,
  razy - `ci-unit-input` + `ci-unit`), pod spodem szara linijka, która **opisuje wpisaną wartość na żywo**
  („coś za 100 zł gracz kupi za 98 zł”) - nie stały przykład. Bez „(%)” w nazwie, gdy jest jednostka.
- **Ułamki** z pliku (0.05, 0.9) pokazuj jako procenty (5 %, 90 %), zapisuj tak, jak czyta plugin.
- **Dni** zawsze „co 14 dni” - bez przeliczania na tygodnie.
- **Wiersz ustawienia** (`fieldRow`): nazwa z lewej, pole z prawej, podpowiedź pod spodem, cienka linia.
- **Checkbox**: krótki napis + „?” obok. Bez długiego szarego zdania pod spodem.
- **Wyłączenie czegoś nigdy nie gubi wartości** - po ponownym włączeniu wraca to, co było.
- **Przyciski przy tekście** stoją zaraz za nim, z lewej, a nie wypchnięte na prawy brzeg.

---

## 5. Pomoc - pytajniki i przewodnik

- Przy każdej opcji, której ktoś może nie zrozumieć: **„?”** (jak to działa) albo **„!”** (co to jest).
  Nieotwarte **świecą**: „?” na żółto, „!” na czerwono; po otwarciu gasną (pamiętane na komputerze).
- Okienko „?” = **krótko** + przykład. Jeśli trzeba więcej - przycisk **„Dowiedz się więcej”**, który
  otwiera duży przewodnik **od razu przewinięty do tej części**, z rozwiniętymi szczegółami.
- **Duży przewodnik** („Jak działa sklep”) na pasku: fioletowy przycisk z książką. Części: pogrubione
  zdanie-streszczenie + zwinięte „... - szczegóły”.
- **Jedno wyjaśnienie w jednym miejscu**: albo na stronie, albo w „?” - nigdy w obu.
- Nowa rzecz na stronie = od razu jej „?” i część w przewodniku.

---

## 6. Ramki, plakietki, stany

- `ci-note` / `ci-warning` / `ci-error`: pasek z lewej (3 px) + delikatne tło w tym kolorze.
  Czerwona ramka z wykrzyknikiem (ikona `CircleAlert`) dla rzeczy naprawdę niebezpiecznych.
- **Rzecz, która w ogóle nie działa** (np. spawner bez pluginu Spawnery): DUŻA czerwona ramka na górze
  (`ci-error ci-error-big`: „Ten przedmiot nie działa” + powód + co zrobić), a ustawienia pod nią
  rozmyte i wyłączone (`ci-disabled`). Pokazuj problem **tylko, gdy naprawdę jest** (sprawdzone na serwerze).
- **Plakietki** (`ci-badge`): „zmieniony”, „poza menu”, liczby; czerwona (`warn`) = problem.
- **Fioletowy znaczek + ramka przerywana** = coś „żywego”/zmiennego (przedmioty z rotacji), z legendą obok.

---

## 7. Okienka i potwierdzenia

- **Tylko nasze okienka** (`ask` z `AskModal`) - żadnych systemowych z Windowsa.
- **Ważne przyciski zawsze pytają** („Wyślij na serwer”, „Wczytaj z serwera”, usuwanie, start eventu).
  Treść krótka i ogólna, bez technicznych nazw („Na pewno chcesz wysłać wszystkie zmiany? Zmiany będą
  od razu widoczne na serwerze.”). Czerwony przycisk tylko, gdy coś zniknie na dobre.
- „Przywróć domyślne” całej sekcji = `ConfirmButton` (drugie kliknięcie), szary, gdy nic nie zmieniono.
- **Cofnij/Ponów** (Ctrl+Z / Ctrl+Y) dla całej strony; **Zapisz** (Ctrl+S) zapisuje wszystko naraz.

---

## 8. Podgląd jak w grze

- **Okna**: `SlotGrid` z prawdziwymi ikonkami, tą samą kolejnością i stronami co w grze, przełącznik
  „Tło” (szare szkło). Klik w pole = okienko „Co ma być w tym polu?”, przeciąganie = przestawianie.
  Postawienie czegoś **nie przesuwa** innych rzeczy.
- **Czat i opisy**: czarne okienko (`mc-preview`), klik w linijkę = edycja pod spodem. Przykładowe
  wartości **podkreślone przerywaną linią** (dymek mówi, co wstawi się w grze). Wstawki jako klocki
  („+ nazwa przedmiotu”), w tekście jako ramki.
- **Każdy układ osobno, gdzie ma to sens** (np. każda kategoria) + suwak „wspólny dla wszystkich”.

---

## 9. Teksty i język

- **Po polsku, prosto.** „Przedmiot”, nie „pozycja”. Liczby z jednostką i odmianą (`plural`).
- **Nigdy nazw plików** (`shop.yml`, `stats.csv`) - jeśli plik jest przydatny, daj przycisk
  („Pobierz raport do Excela”, „Zapisz obecny sklep jako szablon”).
- **Nigdy cudzych pluginów** (LuckPerms, Citizens, EssentialsX, PlaceholderAPI, TAB...) - tylko nasze
  albo neutralnie („nadaj je graczom z tą rangą”).
- **Bez długiego myślnika** (tej dłuższej kreski) - zawsze zwykły „-”.
- **Wszystkie teksty pluginu do edycji w aplikacji** (wzór: „Teksty w grze”), na serwer idą tylko zmienione.
- Na razie tylko po polsku - angielski przyjdzie z tłumaczeniem całej aplikacji.

---

## 10. Lista kontrolna dla nowej strony pluginu

- [ ] Nagłówek + menu szablonów (Duży polecany / Mały / Pusty / Twoje szablony / plik).
- [ ] Pasek: serwer, Komendy, zakładki, przewodnik; z prawej Cofnij, Ponów, Wczytaj z serwera, Zapisz, Wyślij.
- [ ] Wyślij i Wczytaj pytają (nasze okienko).
- [ ] Każda opcja: nazwa, jednostka, podpowiedź na żywo albo „?”. Duży przewodnik z częściami i „Dowiedz się więcej”.
- [ ] Kolory: fiolet = info, żółty = uwaga, czerwony = nie działa.
- [ ] Sekcje zwinięte na start (otwarta tylko ta, do której przyszedłeś).
- [ ] Podgląd okien i tekstów jak w grze; wszystkie teksty pluginu w „Teksty w grze”.
- [ ] Ustawienia: menu z lewej, jedna sekcja, „Zmiany do wysłania”.
- [ ] Żadnych nazw plików, cudzych pluginów, żargonu; wszystko w yml, nic na sztywno w kodzie pluginu.
- [ ] Problemy pokazywane tylko, gdy naprawdę są; rzecz, która nie działa = duża czerwona ramka.
