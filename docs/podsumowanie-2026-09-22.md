# Podsumowanie dla Stasika - 21/22.09.2026

Krótko: cały czas siedzieliśmy na **Sklepie** (plugin + strona w aplikacji). Twoje zmiany z `dev`
są już wciągnięte do `Karol` w obu repo i scaliły się bez konfliktów - `tsc` czysty, wszystkie
testy przechodzą.

## Plugin (mainplugins-shop)

1. **Cena stała dla przedmiotu** - nowe pole `dynamic: false` we wpisie pozycji. Taki przedmiot
   cykl cen dynamicznych całkowicie pomija, skup zawsze idzie po cenie z cennika. Powód: rzeczy,
   które da się farmić bez końca (bruk, drewno, dropy ze spawnerów), i tak osiadały na dnie, bo
   farma sprzedaje niezależnie od ceny. Brak wpisu = zachowanie jak dotąd.
2. **`announce-reset`** w `dynamic-prices` - ogłoszenie globalnego resetu cen na czacie da się
   wyłączyć (dotąd leciało zawsze).
3. **`dynamic-prices.tuning`** - osiem liczb, które dotąd siedziały na sztywno w kodzie, wyszło do
   `shop.yml`: maksymalny spadek na cykl, siła spadku na szczycie, tempo powrotu i wzrostu, próg
   ciszy, cykle do wzrostu i zamrożenia, tempo uczenia normy. Domyślne wartości = dokładnie te, na
   których system był zaprojektowany, więc nic się nie zmienia, dopóki ktoś świadomie nie ruszy.
   Złe wartości: ostrzeżenie w logu i wartość domyślna, jak wszędzie w tym parserze.
4. **Dokumentacja**: `docs/sklep-ceny-dynamiczne.md` - pełny opis mechaniki cen dynamicznych
   (gałęzie cyklu, progi, zabezpieczenia, świadome ograniczenia). Dotąd ta wiedza była tylko
   w kodzie i w głowie Karola.
5. Testy: 3 nowe w `ShopConfigParserTest` (cena stała, strojenie, złe wartości).

## Aplikacja - strona Sklepu

- **Ceny za sztukę** zamiast za porcję; rozmiar porcji to osobne pole obok. Poprawione dwa błędy,
  przez które checkboxy „Da się kupić” i „Da się sprzedać” wpisywały cenę za całą porcję (przy
  porcji 64 wychodziło 0,02 $ za sztukę). Nowy przedmiot startuje z 20 $/szt., a skup z połowy
  ceny kupna, więc od razu nie zapala ostrzeżenia „skup ≥ kupno”.
- **Zakładka „Wygląd menu”** przerobiona: kategorie i przyciski stawia się klikając listę i pole
  w siatce, krzyżyk na polu chowa kategorię z menu (zostaje w sklepie - plugin to obsługuje),
  a na ekranie strony kategorii widać **prawdziwe przedmioty** z przełączaniem stron i można je
  przeciągać, co zmienia ich kolejność w grze.
- **Naprawiony stary błąd** z 15.09: w podglądzie menu stawała tylko pierwsza kategoria (licznik
  siedział w warunku wyszukiwania). W grze było dobrze, mylił tylko podgląd.
- **Rotacja**: przenoszenie przedmiotów do puli i z powrotem (pojedynczo, hurtem, losowo),
  przełączanie widoku Przedmioty ↔ Pula zamiast przewijania przez 55 pozycji.
- **Wytłumaczenia**: pytajniki z krótkim opisem przy nieoczywistych opcjach plus duże okienko
  „Jak działa sklep” z rozwijanymi szczegółami każdego systemu (ceny, dynamiczne, eventy, rotacja,
  menu, statystyki). Karol chce, żeby takie pytajniki były standardem w całej aplikacji.
- **Szybkość**: ikonki przedmiotów są zapamiętywane (i czyszczone po zmianie tekstury), a lista
  podpowiedzi przedmiotów jest jedna na stronę zamiast osobnej przy każdym polu - to usunęło
  zacinanie się przy przełączaniu widoków.
- Drobne: komunikaty („Wysłano na serwer”) mają krzyżyk do schowania - wspólny komponent na
  wszystkich 24 stronach; listy w edytorach zwijane jak w Questach; kwoty ze znaczkiem waluty.

## Stan repo

- **Pluginy**: `Karol` = merge Twojego `dev` + nasze zmiany sklepu. `dev` zaktualizowany.
- **Aplikacja**: to samo - `Karol` ma Twoje 5 commitów i nasze, `dev` zaktualizowany.
- Jary sklepu i core są wgrane na serwer testowy, ale **nowe rzeczy nie były jeszcze sprawdzone
  w grze** - to pierwsze zadanie na następny raz.

## Do przegadania

1. **Licencje** - dalej otwarte: Ty je wyłączyłeś w 11 płatnych pluginach, my przywróciliśmy do
   testów. Trzeba ustalić wersję docelową. Dochodzi plugin Generatory (wydzielony z Questów) -
   płatny czy darmowy?
2. **Polskie nazwy przedmiotów** pochodzą z plików tłumaczeń Mojanga. Na nasz serwer testowy OK,
   przy sprzedaży klientom to cudza własność - trzeba zdecydować, co z tym.
3. **Reset hasła przez kod z maila** (Twoje) - działa dobrze, ale brakuje limitu prób na
   `/api/auth/forgot-password`, więc da się kogoś zasypać mailami. Warto dorzucić prosty limit
   (np. 3 próby na adres na 15 minut) i unieważniać istniejące sesje po zmianie hasła.
