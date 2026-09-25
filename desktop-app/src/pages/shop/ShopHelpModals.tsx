import type { ReactNode } from "react";
import { Fold } from "../../components/EditorBits";
import { PLACEHOLDER_HELP, PLACEHOLDER_LABELS } from "../../lib/shopAnnounce";
import type { CategoryDraft } from "../../lib/shopYaml";

/** Okienka pomocy strony Sklepu ("?" i przewodnik "Jak działa sklep") - sama treść, bez stanu strony. */

export function ShopGuideModal({ openDynamic, openTexts, onClose }: { openDynamic: boolean; openTexts: boolean; onClose: () => void }) {
  const close = onClose;
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Jak działa sklep</h2>
          <button type="button" onClick={close}>
            Zamknij
          </button>
        </div>
        <p className="muted small">
          Gracz wpisuje /shop i dostaje menu z kategoriami. Wchodzi w kategorię, klika przedmiot, wybiera ilość i kupuje. Sprzedaje
          przedmiotem trzymanym w ręce.
        </p>
        <p>
          <b>Kategorie i przedmioty.</b> Każda kategoria ma własną listę przedmiotów. Gdzie stoi która kategoria i który przedmiot, ustawiasz w
          zakładce <b>Wygląd menu</b> - klikasz pole i wybierasz, co ma w nim być.
        </p>
        <p>
          <b>Ceny.</b> Kupno zawsze idzie po sztuce, skup możesz ustawić hurtem (całymi porcjami). W Ustawieniach wybierasz, czy sklep
          liczy w pełnych złotówkach, czy z groszami.
        </p>
        <Fold title="Ceny - szczegóły">
          <p className="small">
            Cenę kupna wpisujesz za jedną sztukę, a sklep przelicza ją na tyle sztuk, ile gracz wybierze. Gdy wychodzi niepełna kwota,
            zaokrągla w górę - nigdy na swoją niekorzyść.
          </p>
          <p className="small">
            „Pełne złotówki” znaczy, że najniższa możliwa cena to 1 zł, więc tanie rzeczy lepiej sprzedawać większymi porcjami. Przy
            „groszach” minimum to 0,01.
          </p>
          <p className="small">
            Skup ma jeszcze jeden bezpiecznik: w <b>Ustawieniach</b> jest sufit „skup najwyżej taka część ceny kupna” (domyślnie 90%). Nawet
            gdy ceny dynamiczne podbiją skup, nigdy nie przebije 90% ceny kupna - inaczej gracze zarabialiby, kupując i od razu
            sprzedając.
          </p>
        </Fold>
        <p>
          <b>Ceny dynamiczne.</b> Sklep sam obniża skup tego, co gracze masowo sprzedają, i podnosi go z powrotem, gdy przestaną.
          Granice (o ile może spaść i urosnąć) ustawiasz w <b>Ustawieniach</b>, tam też włączasz ogłoszenia na czacie.
        </p>
        <Fold title="Ceny dynamiczne - szczegóły" open={openDynamic}>
          <p className="small">
            Każdy przedmiot ma własną cenę skupu i własną historię - to, co dzieje się z diamentem, nie rusza ceny bruku, nawet jeśli
            leżą w tej samej kategorii. Cena chodzi w widełkach z Ustawień, domyślnie od połowy do półtora raza zwykłej ceny.
            Uwaga: rusza się wyłącznie <b>skup</b>, czyli ile sklep płaci graczowi. To, ile gracz płaci przy kupowaniu, nie zmienia się
            samo nigdy - stoi tak, jak wpisałeś w cenniku.
          </p>
          <p className="small">
            Sklep sam liczy, ile danej rzeczy schodzi <b>normalnie w ciągu godziny</b> - to jest „norma”. Co godzinę porównuje z nią
            to, co gracze naprawdę sprzedali, i na tej podstawie rusza ceną. Poniżej wszystko na przykładzie diamentu, którego zwykła
            cena skupu to 100 $, przy domyślnych ustawieniach.
          </p>

          <div className="ci-section-title">Gracze sprzedają dużo</div>
          <p className="small">
            Cena spada najwyżej o 5% na godzinę, czyli ze 100 $ na 95 $, potem 90 $ i tak dalej. Spadek jest tym mocniejszy, im wyżej
            cena stoi: na samej górze (150 $) schodzi około czterech razy szybciej, więc <b>powrót ze szczytu do zwykłej ceny zajmuje
            jakieś trzy godziny</b> ciągłego sprzedawania. Na dole zatrzymuje się na 50 $ i niżej nie zejdzie.
          </p>
          <p className="small">
            Ile spadnie, zależy od tego, jak bardzo sprzedaż przebiła normę - ale nie wprost. Dwa razy większa sprzedaż nie znaczy dwa
            razy większego spadku, bo inaczej jeden gracz z wielkim zapasem ustalałby cenę dla całego serwera. Sama transakcja nie ma
            żadnego limitu: nawet 3000 sztuk naraz idzie w całości po cenie z tej godziny.
          </p>

          <div className="ci-section-title">Nikt nie sprzedaje</div>
          <p className="small">
            „Cisza” to godzina, w której zeszło mniej niż 10% normy. Wtedy:
          </p>
          <ul className="small">
            <li>
              <b>Jeśli cena była zbita</b> (np. 60 $), w godzinę odrabia 80% drogi do zwykłej - czyli wraca do jakichś 92 $, a po
              drugiej godzinie jest praktycznie równo. Powrót jest szybki celowo, bo w realnej grze zawsze ktoś coś sprzedaje i
              inaczej cena nigdy by nie wstała.
            </li>
            <li>
              <b>Jeśli cena stoi na zwykłej</b>, przez pierwsze dwie godziny ciszy nic się nie dzieje. Dopiero potem zaczyna rosnąć,
              po 12,5% na godzinę: 112 $, 125 $, 137 $, 150 $ - czyli <b>cztery godziny od zwykłej ceny na szczyt</b>. To zachęta dla
              graczy: nikt tego nie przynosi, więc opłaca się przynieść.
            </li>
            <li>
              <b>Po zejściu ze szczytu</b> cena zatrzymuje się na zwykłej na dwie godziny, zanim zwykły ruch zepchnie ją niżej - żeby
              nie skakała w górę i w dół co chwilę.
            </li>
          </ul>

          <div className="ci-section-title">Zabezpieczenia - czego sklep nie przekroczy</div>
          <p className="small">
            Cena skupu nigdy nie ucieka w kosmos ani nie spada do zera. Pilnują tego trzy rzeczy:
          </p>
          <ul className="small">
            <li>
              <b>Widełki</b> - cena chodzi tylko między dolną a górną granicą z <b>Ustawień</b> (domyślnie od połowy do półtora raza
              zwykłej ceny). Przy diamencie za 100 $ znaczy to, że skup nie zejdzie poniżej 50 $ i nie przebije 150 $, choćby gracze
              sprzedawali go bez przerwy albo nie sprzedawali wcale. Obie granice ustawiasz sam.
            </li>
            <li>
              <b>Sufit skupu</b> - skup nigdy nie da więcej niż ustalona część ceny kupna (domyślnie 90%). To blokada na „kup w sklepie
              taniej, sprzedaj do sklepu drożej”: bez niej wystarczyłoby kupować i od razu sprzedawać, żeby robić pieniądze z niczego.
              Ten sufit działa <b>nawet wtedy, gdy ceny dynamiczne albo event podbiją skup</b> - wtedy cena po prostu zatrzyma się na
              90% kupna.
            </li>
            <li>
              <b>Cena stała</b> - przełącznik przy przedmiocie, który całkiem wyłącza wahania. Dla rzeczy farmowalnych, które i tak
              osiadłyby na dnie.
            </li>
          </ul>
          <p className="small">
            Do tego aplikacja i plugin pilnują Cię przy samym ustawianiu cen: gdy wpiszesz skup równy albo wyższy od kupna, aplikacja
            zapali czerwone ostrzeżenie przy przedmiocie i wypisze problem na dole listy, a komenda <code>/@shop price</code> taką
            zmianę wprost odrzuci.
          </p>

          <div className="ci-section-title">Drobiazgi, które pilnują uczciwości</div>
          <p className="small">
            Próg ciszy jest zapamiętywany w chwili, gdy cisza się zaczyna. Bez tego kurczyłby się razem z normą (a norma przy braku
            sprzedaży maleje) i cisza nigdy by się nie kończyła. Jedna przypadkowa transakcja pod koniec ciszy tylko cofa licznik o
            godzinę, zamiast kasować cały postęp. Nowy przedmiot przy pierwszej sprzedaży jeszcze nie rusza ceny - ta sprzedaż ustawia
            mu normę, bo nie ma jeszcze z czym porównywać.
          </p>

          <div className="ci-section-title">Reset co 14 dni</div>
          <p className="small">
            Wszystkie ceny wracają do zwykłych naraz, z ogłoszeniem na czacie (do wyłączenia w <b>Ustawieniach</b>). Normy zostają - sklep nie
            zapomina, ile czego zwykle schodzi. Przedmioty z trwającym eventem reset pomija.
          </p>
          <p className="small">
            14 dni to tylko wartość domyślna - w <b>Ustawieniach</b>, przy „co ile dni wszystkie ceny wracają do normy”, wpisujesz co chcesz:
            częściej, żeby rynek często startował od zera, albo rzadziej, żeby ceny dłużej pamiętały, co się działo. Możesz też całkiem
            wyłączyć „Automatyczny reset cen” - wtedy ceny wracają tylko po komendzie <code>/@shop resetall</code>.
          </p>

          <div className="ci-section-title">Tempo da się zmienić</div>
          <p className="small">
            Te wszystkie liczby - godzinny cykl, 5% spadku, 12,5% wzrostu, dwie godziny ciszy - to gotowy zestaw ustawiony pod
            <b> dość szybką grę</b>, gdzie ceny zauważalnie ruszają się w ciągu jednego wieczoru. Jeśli wolisz, żeby rynek zmieniał się
            wolniej i spokojniej, zmienisz to sam w <b>Ustawieniach</b>: „co ile minut przeliczać” wydłuż np. do 180, a w sekcji
            <b> Strojenie (zaawansowane)</b> zmniejsz spadek i wzrost na cykl. W drugą stronę też działa - da się ustawić rynek, który
            szaleje z godziny na godzinę.
          </p>

          <div className="ci-section-title">Czego ten system nie zrobi</div>
          <p className="small">
            Rzeczy, które da się farmić bez końca (bruk, drewno, dropy ze spawnerów), i tak osiądą na dole - farma sprzedaje niezależnie
            od ceny, bo nic jej nie kosztuje. Dla nich lepiej zaznaczyć przy przedmiocie „cena stała”. Da się też grać pod system:
            wstrzymać sprzedaż, doczekać szczytu i wysypać zapas, albo poczekać na reset. To świadoma zgoda, nie błąd.
          </p>
        </Fold>
        <p>
          <b>Eventy.</b> Komendą <code>/@shop event</code> podbijasz skup wybranego przedmiotu na jakiś czas - przydaje się na akcje
          typu „weekend z diamentami”.
        </p>
        <Fold title="Eventy - szczegóły">
          <p className="small">
            Event ustawia cenę skupu ręcznie i <b>blokuje ją</b> - dopóki trwa, ceny dynamiczne tego przedmiotu nie ruszają, choćby
            gracze znieśli pół świata. Podajesz procent (np. +50) i opcjonalnie czas; bez czasu trwa, aż go wyłączysz.
          </p>
          <p className="small">
            <code>/@shop event list</code> pokazuje trwające eventy, <code>/@shop reset</code> zdejmuje event z jednego przedmiotu, a
            <code>/@shop resetall</code> przywraca wszystkie ceny do normy. Ogłoszenie na czacie przy starcie i końcu eventu włączasz w
            <b>Ustawieniach</b>.
          </p>
          <p className="small">
            Wyłączenie eventu przywraca zwykłą cenę <b>od razu</b>, a nie stopniowo - inaczej podbite ceny ciągnęłyby się jeszcze
            godzinami po ogłoszeniu końca akcji. Globalny reset cen pomija przedmioty zablokowane eventem, więc trwająca akcja nie
            zostanie skasowana w połowie.
          </p>
          <p className="small">
            Resety (<code>/@shop reset</code>, <code>/@shop resetall</code>) proszą o potwierdzenie komendą <code>/@shop confirm</code>,
            bo kasują historię rynkową przedmiotu.
          </p>
        </Fold>
        <p>
          <b>Rotacja.</b> Kategoria może mieć drugą listę - pulę. Sklep co kilka dni losuje z niej kilka przedmiotów, więc oferta się
          zmienia i nie wszystko jest dostępne od ręki.
        </p>
        <Fold title="Rotacja - szczegóły">
          <p className="small">
            Ustawiasz dwie rzeczy: ile przedmiotów ma być w ofercie naraz i co ile dni losowanie. Przedmiot, który był w ofercie, przez
            5 kolejnych losowań nie może wrócić - dzięki temu to samo nie kręci się w kółko. Gdy pula jest za mała, sklep dobiera te,
            którym zostało najmniej przerwy, więc oferta nigdy nie będzie pusta.
          </p>
          <p className="small">
            Czas liczy się kalendarzowo, nie od obecności graczy: data następnego losowania jest zapisana na serwerze i jest sprawdzana
            co kilka minut oraz po restarcie. Zmiana puli z aplikacji powoduje losowanie od razu.
          </p>
        </Fold>
        <p>
          <b>Wygląd menu.</b> W osobnej zakładce ustawiasz rozmiar okien i to, co w którym kwadracie stoi: kategorie, przedmioty,
          przyciski, tło. Widzisz dokładnie to, co zobaczy gracz.
        </p>
        <Fold title="Wygląd menu - szczegóły">
          <p className="small">
            Są cztery okna: menu główne (kategorie), strona kategorii (przedmioty), wybór ilości i wyniki szukania. W każdym ustawiasz
            wielkość (od 1 do 6 rzędów) i rozkładasz pola.
          </p>
          <p className="small">
            <b>Klik w pole</b> otwiera okienko, w którym wybierasz, co ma tam stać: kategorię (menu główne), przedmiot (strona kategorii),
            przycisk albo tło. Rzeczy możesz też przeciągać myszką. Przedmioty stoją w kolejności z ustawienia „Kolejność przedmiotów”
            (Twoja albo po cenie). Strzałki stron gracz widzi tylko wtedy, gdy jest dokąd iść.
          </p>
          <p className="small">
            Ikonki przycisków (szukanie, zamknij, sortowanie) wybierasz w sekcji „Przyciski” pod siatką. Napisy na przyciskach są na razie
            stałe - takie same w każdym sklepie.
          </p>
        </Fold>
        <p>
          <b>Statystyki.</b> Po włączeniu sklep zapisuje, co i za ile gracze sprzedają. Wszystko jest w zakładce Statystyki, razem z
          raportem do pobrania.
        </p>
        <Fold title="Statystyki - szczegóły">
          <p className="small">
            Zbierane jest: ile sztuk łącznie i dzisiaj, ile pieniędzy wypłacono, ile było transakcji i jaki jest teraz mnożnik skupu.
            Widać dzięki temu, co naprawdę napędza gospodarkę i które ceny są za wysokie.
          </p>
          <p className="small">
            Sklep liczy też, ile cykli przedmiot przesiedział na dole, ile na górze, a ile pośrodku. To najprostsza podpowiedź, czy
            cena bazowa w cenniku jest trafiona: coś, co stale leży na dnie, jest wycenione za wysoko, a coś, co ciągle stoi na
            szczycie - za nisko.
          </p>
          <p className="small">
            Przyciskiem „Pobierz raport do Excela” w zakładce Statystyki zapiszesz raport na swoim komputerze - z kolumną sugestii
            („obniż cenę bazową”, „podnieś”, „ok”). Sklep liczy też wyniki dzień po dniu. Statystyki przeżywają globalny reset cen - to osobna, długa historia. Zbieranie
            można wyłączyć: stare dane zostają, nowe nie dochodzą.
          </p>
        </Fold>
        <p>
          <b>Teksty ogłoszeń.</b> To, co sklep sam pisze na czacie (nowa oferta, reset cen, eventy), zmieniasz w Ustawieniach → Teksty
          ogłoszeń.
        </p>
        <Fold title="Teksty ogłoszeń - szczegóły" open={openTexts}>
          <div className="ci-section-title">Co jest prawdziwe, a co przykładem</div>
          <p className="small">
            Tekst w czarnym okienku jest prawdziwy - dokładnie tak, tymi kolorami, pojawi się na czacie. Przykładem są tylko rzeczy{" "}
            <span className="ci-sample">podkreślone kropkami</span> (Kolekcja, Płyta: Cat, 20000, 14 dni, 50%, 2h). Najedź na nie myszką -
            dymek powie, co wstawi się tam w grze.
          </p>
          <div className="ci-section-title">Edycja</div>
          <p className="small">
            Klik w linijkę otwiera pole pod okienkiem, zmiany widać od razu. Enter albo „Gotowe” zamyka pole, „Cofnij” i „Ponów” (też
            Ctrl+Z / Ctrl+Y) cofają krok po kroku, „Przywróć domyślny” wraca do tekstu z pluginu - też da się to cofnąć. Kolor: zaznacz
            kawałek tekstu i kliknij kolorowy kwadracik; bez zaznaczenia kolor działa na to, co zaraz napiszesz. Ctrl+B pogrubia.
            Przycisk „&” z prawej pokazuje surowe kody kolorów - tylko dla zaawansowanych.
          </p>
          <div className="ci-section-title">Ramki „+ nazwa kategorii”, „+ cena” itd.</div>
          <p className="small">
            Ramka to miejsce, w które sklep w chwili ogłoszenia sam wpisze właściwą rzecz. Tekst jest jeden dla wszystkich kategorii,
            więc nie wpisuj nazwy na sztywno - „NOWA OFERTA: Kolekcja” pokazałoby się też w Blokach. Ramka pojawia się tam, gdzie stoi
            kursor; Backspace usuwa ją w całości. Przydaje się, gdy skasujesz ramkę przez przypadek, chcesz ją przestawić („Kolekcja ma
            nową ofertę!”) albo dodać gdzie indziej, np. w stopce.
          </p>
          <ul className="small">
            {Object.entries(PLACEHOLDER_LABELS).map(([k, v]) => (
              <li key={k}>
                <b>{v}</b> - {PLACEHOLDER_HELP[k]}
              </li>
            ))}
          </ul>
          <div className="ci-section-title">Kolory nazw</div>
          <p className="small">
            Nazwa kategorii i przedmiotu wchodzi w swoim własnym kolorze - takim, jaki ma w sklepie. Kolekcja ma żółtą nazwę, więc w
            ogłoszeniu też będzie żółta. Tekst za ramką aplikacja koloruje od nowa, więc kolor nazwy nie „rozlewa się” dalej.
          </p>
          <div className="ci-section-title">Włączanie i wyłączanie</div>
          <p className="small">
            Ogłoszenie nowej oferty włączasz przy rotacji w każdej kategorii osobno, a ogłoszenia eventów i resetu cen - w Ustawieniach →
            Ceny dynamiczne. „Przywróć domyślne” obok „?” wraca do wszystkich tekstów z pluginu naraz (po drugim kliknięciu).
          </p>
        </Fold>
        <p className="muted small">
          Zmiany w aplikacji trafiają na serwer dopiero po „Zapisz” i „Wyślij na serwer”. Listę komend znajdziesz pod przyciskiem
          „Komendy”.
        </p>
      </div>
    </div>
  );
}

export function FixedPriceHelpModal({ onClose, onMore }: { onClose: () => void; onMore: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Cena stała</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p>
          Zwykle sklep sam rusza ceną skupu: spada, gdy gracze masowo coś sprzedają, i wraca, gdy przestaną. Ten przełącznik to
          wyłącza - przedmiot zawsze skupuje się po cenie z cennika.
        </p>
        <p>
          <b>Kiedy się przydaje:</b> rzeczy, które da się farmić bez końca (bruk, drewno, dropy ze spawnerów). Farma sprzedaje
          niezależnie od ceny, bo nic nie kosztuje, więc ich skup i tak osiadłby na dnie i nigdy nie wrócił. Lepiej z góry ustawić im
          cenę, na której Ci zależy.
        </p>
        <p className="muted small">
          Cena kupna nie zmienia się nigdy, niezależnie od tego ustawienia - ceny dynamiczne dotyczą tylko skupu.
        </p>
        <div className="row">
          <button
            type="button"
            onClick={onMore}
          >
            Dowiedz się więcej
          </button>
        </div>
      </div>
    </div>
  );
}

export function PriceHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Kupno i skup</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p>
          <b>Kupno zawsze idzie po sztuce.</b> Cenę podajesz za jedną sztukę, a sklep przelicza ją na tyle sztuk, ile gracz wybierze.
        </p>
        <p>
          W grze gracz nie wpisuje liczby - klika jeden z gotowych przycisków, domyślnie <b>1, 8, 16, 32 i 64</b>. Te liczby możesz
          zmienić na dowolne (np. 2, 10, 20), dodać kolejne albo usunąć: zakładka <b>Wygląd menu</b>, ekran <b>Wybór ilości</b>, ramka
          <b>Przyciski ilości</b> po lewej. Najwyżej 64, bo tyle mieści się w jednym miejscu
          w ekwipunku.
        </p>
        <p>
          <b>Skup może iść hurtem.</b> Po włączeniu tej opcji sklep odkupuje od gracza tylko całe porcje - ustawiasz, ile sztuk to
          jedna porcja i ile za nią płacisz. Reszta, która nie wypełni porcji, zostaje graczowi w ekwipunku.
        </p>
        <p>
          <b>Po co?</b> Żeby nie skupować pojedynczych sztuk za grosze i żeby ceny skupu były okrągłe. Przykład: sklep płaci 50 $ za 64
          sztuki bruku zamiast 0,78 $ za każdą.
        </p>
      </div>
    </div>
  );
}

/** Jak ogłoszenie nowej oferty wygląda na czacie dla tej kategorii - jej nazwa i przedmioty z puli. */

export function StatsHelpModal({ onClose }: { onClose: () => void }) {
  const close = onClose;
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Statystyki sprzedaży</h2>
          <button type="button" onClick={close}>
            Zamknij
          </button>
        </div>
        <p>
          Sklep zapisuje, <b>co gracze sprzedają</b>: ile sztuk, ile pieniędzy wypłacił i jak zmieniały się ceny skupu. Wszystko widać w
          tabeli poniżej.
        </p>
        <p>
          <b>Raport do Excela</b> to ta sama wiedza w tabeli, którą możesz posortować. Ostatnia kolumna, „SUGESTIA”, podpowiada, którym
          przedmiotom warto zmienić cenę - np. gdy skup czegoś prawie cały czas leży na dnie, bo gracze znoszą tego za dużo.
        </p>
        <p className="muted small">Przycisk „Pobierz raport do Excela” zapisuje go na Twoim komputerze - nie musisz niczego szukać na serwerze.</p>
      </div>
    </div>
  );
}

export function DynamicHelpModal({ onClose, onMore }: { onClose: () => void; onMore: () => void }) {
  const close = onClose;
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Ceny dynamiczne skupu</h2>
          <button type="button" onClick={close}>
            Zamknij
          </button>
        </div>
        <p>
          Sklep sam zmienia, <b>ile płaci graczom</b> za sprzedawane przedmioty. Ceny kupna się nie zmieniają - tylko skup.
        </p>
        <p>
          Gdy gracze sprzedają czegoś dużo, sklep płaci za to coraz mniej. Gdy nikt tego nie sprzedaje, cena powoli wraca w górę. Dzięki
          temu nie da się zbić fortuny, farmiąc bez końca jedną rzecz.
        </p>
        <p>
          <b>Przykład:</b> wszyscy sprzedają bruk po 50 $. Po kilku godzinach sklep płaci już 40 $, potem 30 $. Kiedy gracze przestaną,
          cena wraca do 50 $.
        </p>
        <p className="muted small">
          Poniżej ustawiasz, jak często ceny się przeliczają, o ile najwyżej mogą spaść i wzrosnąć i co ile dni wszystko wraca do normy.
        </p>
        <div className="row">
          <button
            type="button"
            onClick={onMore}
          >
            Dowiedz się więcej
          </button>
        </div>
      </div>
    </div>
  );
}

export function TextsHelpModal({ onClose, onMore }: { onClose: () => void; onMore: () => void }) {
  const close = onClose;
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Teksty w grze</h2>
          <button type="button" onClick={close}>
            Zamknij
          </button>
        </div>
        <p>
          Wszystko, co sklep pisze graczom: tytuły okien i napisy na przyciskach, opis pod przedmiotem, wiadomości po kupnie i sprzedaży,
          ogłoszenia na czacie, napisy na tabliczkach i nazwy NPC. Na samym dole, zwinięte - odpowiedzi na komendy admina.
        </p>

        <h3>Jak zmienić tekst</h3>
        <p>
          Otwórz grupę, kliknij tekst w czarnym okienku i pisz w polu pod spodem. Kolor: zaznacz tekst myszką i kliknij kolorowy kwadracik
          przed polem. Nie wiesz, gdzie jest tekst? Wpisz kawałek w wyszukiwarkę, np. „nie stać”.
        </p>

        <h3>Przyciski „+ nazwa przedmiotu”, „+ cena” itd.</h3>
        <p>
          Wstawiają ramkę <span className="mc-chip">nazwa przedmiotu</span>. W jej miejsce sklep sam wpisze właściwą rzecz - np. w
          „Kupiono” nazwę tego, co gracz właśnie kupił. Każdy tekst ma tylko te ramki, które pasują do niego.
        </p>

        <h3>Plakietka „zmieniony”</h3>
        <p>Pokazuje teksty inne niż w pluginie. „Przywróć domyślny” przy tekście wraca do oryginału.</p>

        <p className="muted small">
          <span className="ci-sample">Podkreślone kropkami</span> w okienku to tylko przykład. Zmiany działają w grze po „Wyślij na
          serwer”.
        </p>
        <div className="row">
          <button
            type="button"
            onClick={onMore}
          >
            Dowiedz się więcej
          </button>
        </div>
      </div>
    </div>
  );
}

export function CollectionInfoModal({ r, onClose }: { r: CategoryDraft["rotation"] | undefined; onClose: () => void }) {
    const close = onClose;
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Kolekcja - przedmioty kolekcjonerskie</h2>
          <button type="button" onClick={close}>
            Zamknij
          </button>
        </div>
        <p>
          To specjalna kategoria na rzeczy, które gracze chcą <b>mieć i zbierać</b>, a nie tylko zużyć: płyty muzyczne, głowy, rzadkie
          dekoracje. Normalnie trudno je zdobyć, a tutaj można je kupić - ale nie zawsze.
        </p>
        <p>
          Kolekcja nie ma stałych przedmiotów - wszystko siedzi w <b>puli rotacji</b>.
          {r
            ? ` Sklep co ${r.everyDays} dni losuje z niej ${r.show} przedmiotów, a reszta czeka na swoją kolej.`
            : " Sklep co kilka dni losuje z niej kilka przedmiotów, a reszta czeka na swoją kolej."}
        </p>
        <p>
          Dzięki temu każdy przedmiot staje się <b>rzadki</b>. Kto przegapi swoją płytę, może czekać tygodnie, aż wróci. Gracze zaglądają
          do sklepu, żeby sprawdzić nową ofertę, a rzeczy z Kolekcji nabierają wartości - można się nimi chwalić albo odsprzedać drożej
          na Targu komuś, kto nie zdążył.
        </p>
        <p>
          <b>Wysokie ceny są celowe.</b> To cel dla najbogatszych graczy i sposób na wyciąganie nadmiaru pieniędzy z serwera, żeby waluta
          nie traciła wartości.
        </p>
        <p className="muted small">
          Wskazówka: zostaw włączone „Ogłoś na czacie, gdy oferta się zmieni” - wtedy wszyscy wiedzą, że właśnie pojawiło się coś nowego.
        </p>
      </div>
    </div>
  );
}

export function RotationHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Po co jest rotacja</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p>
          Rotacja wymienia przedmioty wewnątrz kategorii - co kilka dni jedne znikają, a na ich miejsce wchodzą inne. Dzięki temu nie
          wszystko jest dostępne od ręki i gracze mają po co zaglądać do sklepu.
        </p>
        <p>
          Przedmioty w kategorii dzielą się na dwie listy: <b>stałe</b> (zawsze w sklepie) i <b>pulę</b> (zapas, z którego sklep losuje te
          zmieniające się). Stałe zostają na miejscu, rotują się tylko te z puli.
        </p>
        <p>
          Wybrane przedmioty przenoszą się ze stałych do puli - przestają być dostępne zawsze. Przedmioty z puli zobaczysz i zmienisz po
          kliknięciu „Pula rotacji” nad listą w środku. Cofniesz przeniesienie przyciskiem „Wróć do stałych” przy przedmiocie z puli.
        </p>
        <p>
          <b>Przykład:</b> pula 30 rzeczy, 5 przedmiotów naraz, nowa oferta co 14 dni. Gracz wchodzi i widzi 5 przedmiotów, za dwa tygodnie 5
          innych. To samo wraca najwcześniej po 5 losowaniach, żeby nie kręciło się w kółko.
        </p>
        <p>
          <b>Gdzie stoją w oknie:</b> w „Wygląd menu” → „Strona kategorii” przeciągasz przedmioty z rotacji tak jak inne. Ustawiasz w ten
          sposób tylko <b>miejsca</b> - jakie przedmioty w nich staną, zdecyduje losowanie. Dlatego po przesunięciu przedmioty i tak układają
          się po kolei (od lewej, od góry). Co może się wylosować i jak często, ustawiasz w zakładce Kategorie → „Pula rotacji”.
        </p>
      </div>
    </div>
  );
}

/** Co to za okno w grze i po co się je ustawia - okienko "?" przy zakładkach ekranów w "Wygląd menu". */
export const SCREEN_HELP: Record<string, ReactNode> = {
  "main-menu": (
    <p>
      Pierwsze okno po wpisaniu <b>/sklep</b>. Stoją w nim <b>kategorie</b> (klik otwiera kategorię) i przyciski: „Szukaj” (gracz wpisuje
      nazwę przedmiotu na czacie) oraz „Zamknij”. Tu decydujesz, gdzie która kategoria stoi.
    </p>
  ),
  "category-page": (
    <p>
      Okno po kliknięciu kategorii - lista jej <b>przedmiotów</b> do kupienia i sprzedania. Ustawiasz, w których polach stoją przedmioty,
      w jakiej kolejności, oraz przyciski: strony (gdy przedmiotów jest dużo), sortowanie (lejek), powrót do menu i zamknięcie. Z lewej
      wybierz kategorię, żeby zobaczyć jej prawdziwe przedmioty.
      <br />
      <br />
      <b>Każda kategoria ma swój układ.</b> Wybierz kategorię po lewej - zmiany w siatce dotyczą tylko jej. Nowa kategoria zaczyna od
      zwykłego układu. Chcesz jeden układ dla wszystkich? Włącz suwak „Wspólny układ dla wszystkich kategorii” nad siatką - wtedy zmiana
      zmienia wszystkie kategorie naraz.
      <br />
      <br />
      <b>Przedmioty z rotacji</b> (np. w Kolekcji) mogą mieć swoje miejsca: kliknij pole i wybierz „Przedmiot z rotacji”. Wylosowane
      przedmioty stają w tych polach po kolei (od lewej, od góry), na każdej stronie. Gdy wylosuje się mniej, reszta pól zostaje pusta.
    </p>
  ),
  "buy-picker": (
    <p>
      Małe okno po kliknięciu przedmiotu do kupienia: gracz wybiera, <b>ile sztuk</b> kupuje (np. 1, 8, 16, 32, 64). Liczby na przyciskach
      zmieniasz z lewej, w „Przyciski ilości”. Jest tu też powrót do kategorii.
    </p>
  ),
  "search-results": (
    <p>
      Okno, które widzi gracz po użyciu <b>„Szukaj”</b> w menu głównym: wpisuje nazwę (np. „bruk”) na czacie, a sklep pokazuje wszystkie
      pasujące przedmioty <b>ze wszystkich kategorii</b>. Tu ustawiasz, w których polach pojawiają się wyniki, i gdzie stoi przycisk powrotu
      do sklepu (kompas).
    </p>
  ),
};
