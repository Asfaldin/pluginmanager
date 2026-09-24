# Podsumowanie dla Stasika - 23/24.09.2026

Krótko: dwa dni przeróbek **strony Sklepu w aplikacji** (wygląd, obsługa, teksty) plus mała zmiana w
pluginie Sklepu. Nic z tego nie było jeszcze testowane w grze - testy jutro. Twoich nowych zmian nie
było (Twoja gałąź, `dev` i `main` były już w `Karol`), więc wszystko poszło jako przesunięcie do przodu:
w obu repo **`Karol` = `dev` = `Stasik` = `main`** (aplikacja `996bc1c`, Pluginy `9fbcf78`).
Testy: 115 vitest (aplikacja) i 31 JUnit (Sklep), `tsc` czysty, `vite build` przechodzi.

Strona Sklepu jest od teraz **wzorem** dla pozostałych edytorów pluginów - poniżej opisuję nie tylko
co, ale też jak, żebyś mógł użyć tych samych kawałków.

---

## 1. Plugin mainplugins-shop

1. **`dynamic-prices.reset-days: 0` = automatyczny reset wyłączony.** Parser przyjmuje `>= 0` (ujemne:
   ostrzeżenie + domyślne). `DynamicPriceManager.resetWlaczony()`; w cyklu reset liczony tylko gdy
   włączony; `dniDoResetu()` zwraca -1. `/@shop info` pokazuje „reset wyłączony” (nowy klucz
   `admin.info-reset-off` w pl/en), placeholder `reset_cen_dni` daje `-`.
   Wyłączenie wzrostu skupu nie wymagało zmian - wystarczy `max-multiplier: 1`.
2. **Kolejność na stronie kategorii.** Dotąd gra ZAWSZE sortowała przedmioty po cenie (lejek tylko
   przełączał kupno/skup). Nowe ustawienia w `shop.yml`:
   - `category-page-sort: order | buy | sell` (domyślnie `order` = kolejność z pliku),
   - `center-small-categories: true | false` (domyślnie `false`; stare wyśrodkowanie małych kategorii
     w środkowym rzędzie psuło ręczny układ pól).
   `ShopSettings` ma dwa nowe pola + enum `CategorySort`; zostawiony stary 6-argumentowy konstruktor
   (ORDER, false), żeby nic innego się nie posypało. Lejek: `sortChoice` per gracz; LPM = BUY, PPM =
   SELL, drugie kliknięcie tego samego wraca do ORDER. Nowe teksty `menu.sort-now-order`,
   `menu.sort-again`.
3. Testy: `ShopConfigParserTest` - reset 0 / wzrost 1 / złe wartości, sort + wyśrodkowanie + zła wartość.
4. Jary Sklepu i Core podmienione w `desktop-app/src-tauri/plugin-jars` (były z 19.09, bez zmian z 21-22.09).

---

## 2. Aplikacja - wspólne kawałki (do użycia w innych edytorach)

- **`MinecraftTextInput` = pole „jak w Wordzie”** (`components/MinecraftTextInput.tsx` + model
  `lib/mcRichText.ts`). Widać kolory zamiast `&`-kodów; `contenteditable`, ale WSZYSTKIE zmiany idą
  przez model (`beforeinput` → jednostki `{ch|token, style}` → `serializeUnits`), więc DOM nigdy się
  nie rozjeżdża. Kolor/styl na zaznaczenie, bez zaznaczenia „styl na później”, Ctrl+B/I/U, własna
  historia (Cofnij/Ponów + `MinecraftTextHandle` przez `ref`), kopiuj/wklej z kodami, przycisk `&`
  pokazuje surowe kody. Wstawki (`inserts`, np. `{category}`) są klockami; po wstawce styl emitowany
  od nowa, bo nazwa kategorii niesie własne kolory. Tekst nieedytowany zapisuje się bajt w bajt.
  Przetestowane skryptem CDP w prawdziwym Chrome (27 scenariuszy) + vitest.
- **`HelpButton`** (`EditorBits.tsx`): `kind="help"` (?) / `"info"` (!) / `label` (duży przewodnik z
  książką). Nieotwarty świeci (żółty / czerwony / fioletowy) - „widziane” w localStorage po `id`
  (osobno dla każdego `id`, także gdy ten sam przycisk zmienia `id`).
- **`ConfirmButton`** - „Przywróć domyślne” działa po drugim kliknięciu (czerwone, 4 s).
- **`SamplePreview`** - podgląd tekstu z wstawkami podmienionymi na przykłady (kropkowane
  podkreślenie + dymek); podmiana PRZED kolorami, tak jak w pluginie.
- **`lib/plText.ts`** - polska odmiana i „co 14 dni / raz na godzinę” do opisów pod polami.
- **Style (App.css)**: `ci-warning` (żółta ramka), `ci-error` / `ci-error-big` (czerwona),
  `ci-note` (fioletowa), `ci-field-title`, `ci-field-row` (wiersz: nazwa | okienko + jednostka | opis),
  `ci-unit-input`, `ci-disabled` (rozmyte + `inert`), `ci-settings-layout`, `ci-changes`,
  `ci-toolbar` / `ci-page-intro` (góra strony), nowe paski przewijania, większe nagłówki paneli.
- **Wszystkie strony**: usunięte nazwy plików z komunikatów i opisów (`xxx.yml nie istniało` →
  „Na serwerze nie było jeszcze ustawień…”). Pola ścieżek w „Więcej” zostały - do przeróbki razem
  z danym pluginem.

Zasady, które z tego wynikają (kolory ramek, opis albo na stronie albo w „?”, jednostki obok pól,
opis pod polem liczony z wpisanej wartości, sekcje zwinięte, żadnych nazw plików itd.) mam spisane
i stosuję je przy następnych pluginach.

---

## 3. Aplikacja - strona Sklepu (co i jak)

**Góra strony:** nazwa, opis + „Wczytaj szablon”, jeden pasek: serwer, Komendy, zakładki, przewodnik,
…, **Cofnij / Ponów** (historia całego `file`: efekt na `file`, szybkie zmiany <700 ms łączone,
reset przy wczytaniu; Ctrl+Z/Y poza polami tekstowymi), **Wczytaj z serwera** (naprawdę czyta serwer;
przy niewysłanych zmianach modal z czerwonym przyciskiem, a wyrzucone zmiany odkładane w `discarded`
z paskiem „Przywróć moje zmiany”), Wyślij na serwer.

**Kategorie / przedmioty:**
- Ceny: kupno zawsze za sztukę (usunięte mylące pole „porcja w cenniku”), skup: „Gracz sprzedaje po
  [64] szt. naraz” + „Cena skupu za 64 szt.”. Odznaczenie/zaznaczenie kupna, skupu i „po kilka sztuk”
  pamięta poprzednie ceny (`priceMemoryRef`, `switchLot` w `shopYaml.ts` - przeliczenie wprost
  `cena*nowa/stara`, bez zaokrąglonej ceny za sztukę po drodze; wcześniej 50→49,92).
- Rotacja: przełącznik Przedmioty | Pula (zwijany, zapamiętany), przy wyłączonej rotacji zakładka ma
  przycisk „Włącz rotację”, który otwiera sekcję w prawym panelu; „Do puli rotacji” w nagłówku
  przedmiotu i ikonka 🔀 na liście; powrót z puli na dawne miejsce (`moveBackFromPool(c, idx, order)`
  wg kolejności z serwera).
- Spawnery i custom itemy: ikonka (materiał z katalogu, `spawner_*` → SPAWNER), nazwa („Spawner:
  Krowa” z `spawnery-typy.yml`), wykrywanie braku pluginu (jar `mainplugins-spawners*.jar` w folderze
  pluginów) albo itemu w katalogu → czerwona ramka „Ten przedmiot nie działa” + link, rozmyte
  ustawienia, plakietki na liście i przy kategorii. Gdy nie da się sprawdzić - brak ostrzeżeń.
- Opisy pod polami liczone na żywo; „!” z opisem przy Kolekcji; nagłówki większe.

**Ustawienia** (menu z lewej, jedna sekcja, max ~820 px) + prawa kolumna **„Zmiany do wysłania”**
(różnice ustawień względem serwera, było → jest, cofnięcie pojedynczej zmiany, klik = skok do sekcji):
- Ceny dynamiczne: procenty zamiast mnożników, jednostki, ostrzeżenie, wyłączniki „Skup może rosnąć
  ponad zwykłą cenę” (`max-multiplier` 1) i „Automatyczny reset cen” (`reset-days` 0), strojenie
  pokazane w %, „Przywróć domyślne” (sekcja i strojenie).
- **Teksty ogłoszeń na czacie** (`lib/shopAnnounce.ts`): 10 kluczy z `lang/<język>.yml` pluginu
  (rotacja, reset, eventy). Edycja w „okienku czatu”, klik w linijkę. Przy wysyłce czytamy plik
  świeżo z serwera i **podmieniamy tylko linijki tych kluczy** (`patchLangFile`, reszta pliku
  nietknięta), potem `/@reloadlang`.

**Statystyki** - osobna zakładka z włącznikiem, „?” i „Pobierz raport do Excela” (`stats.csv` przez
`sftpDownloadFile` do folderu z `open({directory})` - na Windows dialog „zapisz jako” bywa kapryśny).

**Wygląd menu:**
- Klik w KAŻDE pole siatki → „Co ma być w tym polu?”: kategorie (menu główne), przedmioty podglądanej
  kategorii (strona kategorii), przyciski danego ekranu, „Wyczyść pole”. Przeciąganie zostało.
- **Kategorie bez przeskakiwania.** Plugin łączy `categories` z polami `CATEGORY_SLOT` po kolei
  (wg kolejności wpisów w `layout`). Stare stawianie przesuwało kolejność → wszystkie kategorie
  przeskakiwały. Teraz czyste funkcje w `shopYaml.ts`: `placeCategoryAt` (dokładnie w kliknięte
  pole, zamiana z kategorią w tym polu, przycisk/tło ustępuje), `hideCategoryFromMenu`,
  `removeMenuSlot`, `pruneBlankCategorySlots` (przy wczytaniu: tyle pól, ile kategorii - koniec
  pustych „miejsc na kategorie”), `ensureCategorySlots` (nowa kategoria dostaje wolne pole), `setCats`
  przy usuwaniu kategorii też zabiera jej pole.
- **Podgląd = gra:** `displayOrder` (ORDER/BUY/SELL jak `sorted` w pluginie), `pageSlots` (port
  1:1), `previewSlotItems`, ikonki przycisków z `menus.buttons` (`roleMaterial`: powrót w wyborze
  ilości = `picker-back`, gdzie indziej `back`), przełącznik „Tło” (szare szkło w wolnych polach,
  jak `fillBackground`). `placeItemAt` - przedmiot trafia w kliknięte pole (pola na przedmioty
  sortowane po numerze, przedmiot przesunięty w liście) - działa przy „Twojej kolejności”.
- Z lewej małe karty: „Kolejność przedmiotów” (strona kategorii), „Przyciski ilości” (liczby 1-64,
  czerwona informacja przy >64, dodaj/usuń), opis na „Wyniki wyszukiwania” (bez listy kategorii),
  „Rozmiar okna”; „?” opisujący każdy ekran obok „Tło”.
- × na przedmiocie w podglądzie usuwa przedmiot (Cofnij go przywraca).

**Dane na serwerze testowym:** 3 krzywe ceny z starego sklepu podniesione do pełnych złotówek
(770→832 za 64 = 13 $/szt., 1500→1536 = 24 $/szt.) - też w szablonie `big-pl.json`; przywrócony
`COBBLED_DEEPSLATE` w Blokach.

---

## 4. Czego nie zrobiliśmy / na co uważać

- Podgląd strony kategorii nie pokazuje przedmiotów aktualnie w rotacji (w grze stoją za stałymi).
- „Zmiany do wysłania” obejmują tylko zakładkę Ustawienia.
- `ShopEditorPage.tsx` ma ~3400 linijek - warto podzielić (Ustawienia, Wygląd menu, Statystyki,
  modale pomocy).
- Szablony sklepu (Duży PL, Mały PL, Mały EN) do przejrzenia przed sprzedażą.
- Inne strony (Targ, Questy, Skrzynki…) jeszcze w starym stylu; tam „Cofnij do stanu z serwera”
  działa jak kiedyś w Sklepie (przywraca kopię z pamięci, nie czyta serwera).
- Na serwerze testowym `/sell`, `/pay`, `/balance` zajmuje Essentials (bez zmian).

Pełna analiza dla Karola (mocne/słabe strony, propozycje edycji i komend) leży u niego na pulpicie
(`Sklep-analiza-2026-09-24.md`) - jak chcesz, prześle Ci.
