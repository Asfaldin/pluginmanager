# Notatki projektu – co zrobione, co do zrobienia

Plik prowadzony na bieżąco (także przez Claude). Najnowsze wpisy na górze sekcji.

## Stan na 2026-09-10 – pierwsza analiza kodu

**Co to jest:** aplikacja na komputer (Windows/Mac/Linux) zbudowana w Tauri
(„silnik” w języku Rust + wygląd w React/TypeScript). Klient loguje się kontem ze sklepu,
edytuje wizualnie configi naszych 20 pluginów (Mainplugins) i wysyła je razem z pluginami
na swój serwer Minecraft (SFTP), a potem przeładowuje przez RCON.

- Ok. 22 tys. linii kodu, ~27 edytorów (sklep, skrzynki, questy, wyspy, rangi, HUD, resource pack itd.).
- Kod pluginów (Java) i serwer licencji **nie są w tym repo** – są w osobnym projekcie `Mainplugins`.
  Tutaj leżą tylko gotowe pliki `.jar`, wbudowywane w aplikację.
- Część wizualna kompiluje się bez błędów (`tsc` OK, `npm audit` – 0 podatności).
  Części w Rust nie dało się sprawdzić na tym komputerze (brak zainstalowanego Rusta).

## Do zrobienia

### Krytyczne – bez tego nie da się sprzedawać
- [ ] **Adres serwera licencji to `http://localhost:3000`** (`src-tauri/src/shop.rs`).
      Celowo – na razie wszystko testujemy lokalnie, docelowo serwer licencji będzie na VPS.
      Do zrobienia przed premierą: postawić go na VPS z **https** (szyfrowane połączenie,
      inaczej hasła klientów lecą otwartym tekstem) i ustawić adres tak, żeby wersja testowa
      sama używała localhost, a wersja dla klientów – adresu VPS (bez ręcznej podmiany).
- [ ] **Gdy serwer licencji leży, cała aplikacja jest zablokowana** (logowanie przy starcie).
      Rozważyć tryb offline (np. ostatnie udane logowanie ważne X dni).
- [ ] **Ścieżka `C:\Users\stasi\Desktop` zaszyta w kodzie** (`LocalExportButton.tsx`) –
      u klienta ten folder nie istnieje. Zamienić na Pulpit bieżącego użytkownika.

### Ważne
- [ ] **Ochrona płatnych pluginów:** wszystkie 20 jarów (też płatne) jest w aplikacji i każde
      darmowe konto może je wysłać na serwer. Jedyną blokadą jest sprawdzanie licencji
      wewnątrz samych pluginów (core/LicenseManager). Sprawdzić, jak mocne jest to sprawdzanie
      (kod w Mainplugins) i czy pluginy są zaciemnione (obfuskacja).
- [ ] **Licencja na każdym pluginie (decyzja z 2026-09-10):** docelowo każdy plugin ma
      sprawdzać licencję. Dziś 8 pluginów tego nie robi (core, announcer, farming, menu,
      teleport, chatfilter, hud, ranks) – trzeba to dodać w Mainplugins i uaktualnić aplikację.
- [ ] **Niespójna lista darmowych pluginów:** `freePlugins.ts` mówi, że darmowy jest tylko
      Announcer, a `DeployPage.tsx` i `PluginGraph.tsx` – że 8 (core, announcer, farming, menu,
      teleport, chatfilter, hud, ranks). Ustalić biznesowo i trzymać listę w jednym miejscu.
- [ ] **Narzędzia deweloperskie widoczne dla klienta** (budowanie z Mavena w zakładce Wdrożenie) –
      klient nie ma kodu źródłowego, to mu tylko namiesza. Ukryć w wersji dla klientów.
- [ ] **Brak weryfikacji klucza serwera SSH** (`sftp.rs`) – aplikacja ufa każdemu serwerowi,
      co w teorii pozwala podszyć się pod serwer klienta i przechwycić hasło.
- [ ] Nazwa produktu: okno nazywa się „RSMC Manager”, a ekran logowania i menu „PluginManager”.
      Wybrać jedną markę.

### Porządki (mniej pilne)
- [ ] README nieaktualne (opisuje zakładkę „Workspace”, której już nie ma).
- [ ] Metadane: `Cargo.toml` ma `authors = ["you"]`, opis „A Tauri App”; wersja 0.1.0,
      pluginy w wersji `1.0-SNAPSHOT`.
- [ ] Brak testów automatycznych (poza 2 małymi w Rust) i brak automatycznego sprawdzania na GitHubie.
- [ ] Włączyć zabezpieczenie CSP w `tauri.conf.json` (obecnie wyłączone).

## Zrobione
- 2026-09-10 – utworzona gałąź `dev` do bieżącej pracy; dodany ten plik z notatkami.
