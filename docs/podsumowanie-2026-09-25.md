# Podsumowanie dla Stasika - 24.09 (wieczór) i 25.09.2026

Krótko: **Sklep jest skończony** - została tylko duża runda testów w grze (lista w notatkach Karola).
Doszły: własny układ strony dla każdej kategorii, pola na przedmioty z rotacji, wszystkie teksty pluginu
do edycji w aplikacji, promocje na kupno, bonusy rang, `/cena`, historia i ranking sprzedaży, zakładka
Eventy, nowe szablony. Do tego jedno okienko pytań w stylu aplikacji zamiast systemowych i podział
wielkiego pliku strony Sklepu.

Twoje zmiany z 24.09 (Wsparcie, pasek tytułu, sidebar, i18n, deinstalator, 1.0.0) są scalone z `Karol`.
W obu repo **`Karol` = `dev` = `Stasik` = `main`** (aplikacja `fbccbe4`, Pluginy `aaa2269`).
Testy: 131 vitest, 9 `cargo test`, 39 JUnit (Sklep); `tsc` czysty, `vite build` przechodzi.

---

## 0. Twoje zmiany - co przejrzałem i poprawiłem przy scalaniu

- Jeden konflikt: importy w `SettingsPage.tsx` (Ty usunąłeś rzeczy przeniesione do `quitApp`, ja
  podmieniłem `ask`). Zostały Twoje zmiany + nasze okienko pytań.
- **`lib/quitApp.ts` używał `ask` z `@tauri-apps/plugin-dialog`** - zamienione na nasze `ask` z
  `components/AskModal.tsx` (patrz punkt 1). `PromptHost` i `AskHost` przeniesione z `Gate` do `App`,
  ponad `TitleBar` - inaczej pytanie przy zamykaniu z paska tytułu nie miałoby gdzie się pokazać
  (np. w trakcie wczytywania, gdy `Gate` pokazuje „Ładowanie...”).
- **Wsparcie: endpointów `/api/tickets` i `/api/tickets/meta` nie ma w `license-server` w żadnej
  gałęzi** - strona będzie zwracać błąd, dopóki nie wypchniesz części serwera. Wiem, że i tak czeka
  na VPS i bazę danych - piszę, żeby nie zginęło.
- Reszta bez uwag: `uninstall.rs` (rejestr, `UninstallString`, zamknięcie appki po starcie deinstalatora)
  i `TitleBar` wyglądają dobrze; `cargo test` przechodzi razem z `winreg`.

---

## 1. Aplikacja - wspólne rzeczy (dotyczą też Twoich stron)

1. **Nigdy więcej systemowych okienek Windows.** Nowy `components/AskModal.tsx`: `ask(message, options)`
   - to samo API co `ask` z `plugin-dialog` (zwraca `Promise<boolean>`), ale okienko w stylu appki.
   Opcje: `title`, `kind`, `okLabel`, `cancelLabel`, `danger` (czerwony przycisk; domyślnie sam się włącza,
   gdy w treści jest „usuń”). Enter = Tak, Esc / klik obok = Anuluj. Podmienione we WSZYSTKICH plikach
   (13 plików, ok. 20 pytań). **Importuj `ask` z `components/AskModal`, nie z `plugin-dialog`.**
2. **Zasada Karola: ważne przyciski zawsze pytają „na pewno?”** („Wyślij na serwer”, „Wczytaj z serwera”
   i podobne) - krótko, bez technicznych id. W Sklepie już tak jest; pozostałe strony dostaną to przy
   przeróbce.
3. **Zasada Karola: w tekstach dla klienta nie wymieniamy cudzych pluginów** (LuckPerms, Citizens,
   EssentialsX, PlaceholderAPI, TAB...) - tylko nasze albo neutralnie. Do poprawy przy przeróbce zostały:
   Ustawienia serwera (Vault/EssentialsX), HUD (PlaceholderAPI/TAB), Ogłoszenia (PlaceholderAPI).
4. **Na razie wszystko po polsku** (decyzja Karola) - angielskie treści przyjdą razem z tłumaczeniem
   całej aplikacji. Twoje i18n to dobry fundament pod to.

---

## 2. Plugin mainplugins-shop

1. **Własny układ strony każdej kategorii.** `categories/<id>.yml` może mieć `layout:` (`size` + `layout`
   jak `menus.category-page`); brak = wspólny układ. `Category` ma nowe pole `layout` (null = wspólny).
2. **Nowa rola pola `ROTATION_SLOT`.** Wylosowane przedmioty rotacji stają na tych polach po kolei
   (od lewej, od góry), na każdej stronie; mniej wylosowanych = reszta pól pusta. Bez takich pól - jak
   dawniej, rotacja za stałymi przedmiotami. Lejek sortuje wtedy tylko stałe przedmioty.
3. **`/cena` (alias `/price`)** - ceny przedmiotu w ręce dla tego gracza: kupno za szt. (z promocją
   i rabatem rangi), skup teraz, event. W core `commands.yml`: `cena -> price`.
4. **Promocje na kupno: `/@shop sale <przedmiot|kategoria|all> -20 [2h]`**, `off`, `list`, `offall`.
   Węższa wygrywa (przedmiot > kategoria > cały sklep). Zapis w `sales.yml` (przeżywa restart), wygasanie
   w tym samym timerze co eventy. W opisie przedmiotu stara cena przekreślona + „PROMOCJA -20%”.
   Ogłoszenia: `shop.yml sales.announce`.
5. **Bonusy rang** (prosty fundament - pełna wersja przy przeróbce Rang): `shop.yml rank-bonuses:
   {vip: {buy-discount: 2, sell-bonus: 1}}`. Ranga = uprawnienie `mainplugins.shop.rank.<nazwa>` nadane
   **wprost** (`isPermissionSet && hasPermission` - sam op nie dostaje wszystkich bonusów). Kilka rang =
   największy bonus. Promocja i rabat rangi się **sumują** (-20% i -10% = 72%). Premia do skupu nie
   przebija `max-sell-share`.
6. **Jedno miejsce liczenia ceny gracza**: `ShopDeals` (promocje + rangi) i `ShopRules.buyPrice(item,
   pieces, rounding, factor)` / `maxBuyPieces(..., factor)`. Mnożnik przycinany do 6 miejsc - bez tego
   `0.8 * 0.9 = 0.7200000000000001` podbijało cenę o grosz.
7. **Historia i ranking: `/@shop history <przedmiot>`, `/@shop top [dzis|tydzien]`.** `ShopHistory` ->
   `history.yml` (dzień -> przedmioty / gracze: sztuki i pieniądze). Zbiera się **razem ze statystykami**
   (`stats.enabled`), ile dni - `stats.history-days` (domyślnie 30).
8. **Zawartość startowa po polsku = Duży szablon z aplikacji** (10 kategorii). Lista kategorii startowych
   nie jest już wpisana w kod - `prepareFiles()` czyta `categories` z dołączonego `shop.yml`. Angielska
   zostaje stara (5 kategorii).
9. Nowe teksty w `lang/pl.yml` i `en.yml` (te same klucze - pilnuje test): `price-check.*`, `sale.*`,
   `item.buy-discounted`, `item.sale*`, `item.rank-discount`, `admin.sale-*`, `admin.history-*`, `admin.top-*`.
10. Testy: nowy `ShopDealsRulesTest` (promocje, rangi, sufit skupu, historia), `ShopConfigParserTest`
    (układ kategorii, `ROTATION_SLOT`, rangi/promocje/historia), przepisany `DefaultContentTest`
    (każda kategoria startowa ma plik, czyta się bez ostrzeżeń, nic nie skupuje drożej, niż sprzedaje).

---

## 3. Aplikacja - strona Sklepu

1. **Podział `ShopEditorPage.tsx`** (było 3700 linijek): `pages/shop/ShopHelpModals.tsx` (wszystkie „?”
   i przewodnik), `ShopCommandsModal.tsx`, `shopPageShared.tsx` (typy, stałe, `plain`, `refLabel`,
   `money`...), `ShopTextsSection.tsx`, `ShopDealsSection.tsx`, `ShopEventsTab.tsx`, `ShopTemplateMenu.tsx`.
2. **Wygląd menu → Strona kategorii:** każda kategoria ma **własny układ**; suwak „Wspólny układ dla
   wszystkich kategorii” (`shop.yml category-page-shared`, czyta tylko aplikacja). Pole „Przedmiot
   z rotacji”, przedmioty z rotacji z fioletowym znaczkiem i legendą, przeciąganie jak innych.
   Na start od razu wybrana pierwsza kategoria.
3. **Ustawienia → Teksty w grze**: wszystkie ok. 190 tekstów pluginu w 6 grupach, wyszukiwarka, podgląd
   z przykładami, listy wielolinijkowe. Domyślne teksty = kopia `lang/` pluginu w
   `src/lib/shopLang/` - **podmieniać razem z jarem, gdy w pluginie zmienią się teksty** (test wyłapie
   tekst bez ludzkiej nazwy). Na serwer idą tylko zmienione linijki (`changedTexts` + `patchLangFile`,
   też listy).
4. **Ustawienia → Promocje** i **Bonusy dla rang**; długość historii w zakładce **Statystyki**.
5. **Zakładka Eventy**: czyta trwające eventy (`prices.yml`, `locked`) i promocje (`sales.yml`), start
   i koniec przez RCON; bez RCON pokazuje komendę do wklejenia w konsoli (`lib/shopLive.ts`).
6. **Przycisk „Zapisz” u góry** (+ Ctrl+S), „Wyślij na serwer” zawsze pyta, „Wczytaj z serwera” zawsze
   pyta. Stary błąd naprawiony: przełącznik „ogłaszaj rotację” przy kategorii w ogóle się nie zapisywał.
7. **Szablony** (menu zamiast listy rozwijanej): Duży (polecany, kopia sklepu z serwera testowego),
   nowy Mały (4 kategorie po 8 przedmiotów), Pusty, **„Twoje szablony”** (zapis/wgranie, `localStorage`,
   plik `.txt` na Pulpicie), ptaszek przy wczytanym. Generatory: `desktop-app/scripts/make-big-template.ts`
   i `make-templates.ts` (`npx vite-node ...`).
8. Przewodnik „Jak działa sklep” zaktualizowany; „Dowiedz się więcej” przewija do właściwej części.

---

## 4. Co dalej

- Duży test Sklepu w grze (Karol).
- Potem ten sam styl co w Sklepie: Targ, Skrzynki, Questy.
- Na później: Duży szablon po angielsku, wzmianki o cudzych pluginach na starszych stronach,
  Wsparcie po postawieniu VPS i bazy danych.
