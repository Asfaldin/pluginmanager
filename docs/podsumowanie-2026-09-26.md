# Podsumowanie dla Stasika - 26.09.2026

Krótko: **duży test Sklepu w grze przeszedł**, a **Targ jest przerobiony na wzór Sklepu** (plugin i strona w
aplikacji). Do tego wspólne okno szablonów dla Sklepu i Targu oraz pytanie „na pewno wyjść?” przy
niewysłanych zmianach na każdej stronie.

Gałęzie: Pluginy - wszystkie 4 gałęzie na `edec95c`. Aplikacja - dzisiejsze zmiany tylko na `origin/Karol`
(dev/main/Stasik jeszcze nie). Testy: 147 vitest, `tsc` czysty, JUnit Targu przechodzi.

---

## 1. Sklep - poprawki z testu w grze

- NPC da się wskazać, nawet gdy gracz stoi w środku niego (własny promień zamiast zwykłego „na co patrzę”).
- Skup nie przebije kupna także przy promocji i bonusie rangi (sufit = udział skupu x najniższy mnożnik kupna).
- Pierwsze pole rotacji w kategorii nie zjada przedmiotów z rotacji; pytanie przy włączaniu wspólnego układu;
  zwarta lewa kolumna w „Wygląd menu”; własny czas eventów i promocji.

## 2. Targ - plugin (`mainplugins-market`)

- `menu.size` (9-54) i `menu.offer-slots` w `market.yml` - rozmiar okna i pola ofert do ustawienia.
- `limits.ranks` - więcej ofert dla rang, uprawnienie `mainplugins.market.rank.<nazwa>` (wygrywa najwyższy limit).
- `/@market remove-offer <id>` - zdjęcie jednej oferty (przedmiot wraca do sprzedającego).
- `listings.yml` zapisuje przy ofercie `type`, `amount`, `name` (czytelne dla aplikacji); stare oferty
  uzupełniają się same przy starcie.
- Komenda gracza to `/targ` (stara strona w aplikacji podawała błędnie `/market`).

## 3. Targ - aplikacja (`pages/MarketPage.tsx` + `pages/market/*`)

- Wygląd i zasady jak w Sklepie: pasek (Cofnij, Ponów, Wczytaj z serwera, Zapisz, Wyślij - z pytaniami),
  „Jak działa targ”, „?” przy opcjach.
- **Ustawienia**: Oferty i limity (z limitami rang), Podatek, Skrzynka „Do odebrania”, Teksty w grze;
  „Zmiany do wysłania” z prawej.
- **Wygląd okna**: siatka jak w grze, klik w pole = wybór (oferta / przycisk / tło), przeciąganie zamienia
  pola, zmiana rozmiaru zostawia przyciski na dole (`lib/marketLayout.ts`).
- **Oferty na żywo**: lista ofert z serwera, zdejmowanie jednej albo wszystkich ofert gracza przez RCON
  (bez RCON pokazuje komendę do wklejenia) - `lib/marketLive.ts`.

## 4. Wspólne rzeczy (dotyczą też Twoich stron)

1. **Teksty w grze dla każdego pluginu**: `lib/langTexts.ts` (`createTextSet`) + `components/GameTextsSection.tsx`.
   Sklep i Targ używają tego samego; kopia plików językowych pluginu leży w `lib/<plugin>Lang/`.
2. **Szablony**: `components/TemplateMenu.tsx` - przycisk „Szablon: ...” otwiera okno z kartami (Gotowe /
   Twoje: Wczytaj, Pobierz, Zmień nazwę, Usuń). Zapis szablonu nie tworzy już pliku sam - plik powstaje
   dopiero przez „Pobierz”. Obok menu mały przycisk szybkiego zapisu i pomarańczowa informacja, gdy są
   niewysłane zmiany. Lista „Twoje szablony” - `lib/userTemplates.ts`. Nazwy bez „polecany”:
   Sklep = Gotowy / Do edycji / Pusty, Targ = Gotowy / Pusty.
3. **`components/NavGuard.tsx`**: gdy strona ma niezapisane albo niewysłane zmiany (`useDirtyTracking`),
   kliknięcie linku do innej strony pyta „na pewno wyjść?”. Działa dla wszystkich stron, które zgłaszają
   zmiany przez `useDirtyTracking`.
