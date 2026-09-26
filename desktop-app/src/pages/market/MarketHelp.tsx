import { useEffect, useRef, type ReactNode } from "react";
import { CopyRow, Fold } from "../../components/EditorBits";
import type { MarketConfig } from "../../lib/marketYaml";

/** Okienka pomocy strony Targu („?”, przewodnik „Jak działa targ”, komendy) - sama treść, bez stanu strony. */

/** Która część przewodnika ma być od razu rozwinięta. */
export type MarketGuidePart = "limits" | "tax" | "mailbox" | "window" | "live" | "texts" | null;

export function MarketGuideModal({ open, onClose }: { open: MarketGuidePart; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Otwarte z "?" przy konkretnej rzeczy: przewijamy do niej (opis nad rozwiniętymi szczegółami).
  useEffect(() => {
    if (!open) return;
    const details = boxRef.current?.querySelector("details[open]");
    const target = details?.previousElementSibling ?? details;
    target?.scrollIntoView({ block: "start" });
  }, [open]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={boxRef} className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Jak działa targ</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p className="muted small">
          Targ to sklep między graczami. Gracz bierze przedmiot do ręki i wpisuje /targ wystaw 500 - przedmiot trafia na Targ za 500. Inni
          wpisują /targ, przeglądają oferty i kupują jednym kliknięciem. Pieniądze idą prosto do sprzedającego, także gdy nie ma go w grze.
        </p>

        <p>
          <b>Szablony.</b> Menu „Szablon” obok opisu strony: Gotowy (ustawienia jak po instalacji), Pusty (okno bez pól ofert), Twoje zapisane
          szablony i wgranie z pliku. Twój szablon pobierzesz jako plik strzałką przy nim. Szablon ustawia liczby i wygląd okna - teksty zostają. Tak wrócisz do początku albo przeniesiesz Targ na inny
          serwer.
        </p>
        <p>
          <b>Oferty i limity.</b> Ustawiasz, ile ofert naraz może mieć gracz, najniższą i najwyższą cenę oraz po ilu dniach niesprzedana
          oferta znika z Targu. Rangi mogą mieć więcej ofert.
        </p>
        <Fold title="Oferty i limity - szczegóły" open={open === "limits"}>
          <p className="small">
            Limit liczy oferty, które gracz ma teraz na Targu. Gdy go osiągnie, musi coś sprzedać albo wycofać, zanim wystawi kolejną
            rzecz. Wycofuje się, klikając własną ofertę w oknie Targu (albo w „Moje oferty”).
          </p>
          <p className="small">
            <b>Więcej ofert dla rang:</b> wpisujesz nazwę rangi i liczbę ofert, a graczom z tą rangą nadajesz uprawnienie podane pod
            nazwą. Gracz z kilkoma rangami dostaje najwyższy limit. Gdy ranga ma mniej niż zwykły limit, gracz i tak dostaje zwykły.
          </p>
          <p className="small">
            <b>Wygasanie:</b> niesprzedana oferta po wybranej liczbie dni schodzi z Targu, a przedmiot wraca do sprzedającego - do
            skrzynki „Do odebrania” albo prosto do ekwipunku (patrz niżej). Wyłączone wygasanie = oferty wiszą, dopóki ktoś nie kupi albo
            gracz ich nie wycofa.
          </p>
        </Fold>

        <p>
          <b>Podatek.</b> Część ceny, której sprzedający nie dostaje - np. przy 5% za przedmiot sprzedany za 100 dostaje 95. Te pieniądze
          znikają z serwera.
        </p>
        <Fold title="Podatek - szczegóły" open={open === "tax"}>
          <p className="small">
            Kupujący zawsze płaci pełną cenę z oferty. Podatek zabiera się sprzedającemu przy wypłacie. Dzięki temu na serwerze nie
            przybywa w nieskończoność pieniędzy, a ceny na Targu nie rosną bez końca. Na start wystarczy 3-5%.
          </p>
          <p className="small">Wyłączenie podatku nie gubi procentu - po ponownym włączeniu wraca to, co było.</p>
        </Fold>

        <p>
          <b>Skrzynka „Do odebrania”.</b> Przycisk w oknie Targu, w którym czekają wygasłe oferty i kupione przedmioty, które nie zmieściły
          się w ekwipunku.
        </p>
        <Fold title="Skrzynka „Do odebrania” - szczegóły" open={open === "mailbox"}>
          <p className="small">
            <b>Włączona:</b> gracz odbiera przedmioty, kiedy chce, klikając je w skrzynce. Nic nie wypada na ziemię, nic nie ginie.
          </p>
          <p className="small">
            <b>Wyłączona:</b> kupiony przedmiot, który się nie mieści, wypada graczowi pod nogi. Wygasła oferta wraca do ekwipunku (albo
            przy następnym wejściu, gdy gracza nie ma w grze). Przycisk „Do odebrania” znika z okna.
          </p>
        </Fold>

        <p>
          <b>Wygląd okna.</b> W zakładce <b>Wygląd okna</b> widzisz okno Targu tak, jak w grze. Ustawiasz rozmiar, tytuł, tło, gdzie stoją
          oferty i gdzie przyciski.
        </p>
        <Fold title="Wygląd okna - szczegóły" open={open === "window"}>
          <p className="small">
            Kliknij pole, żeby wybrać, co ma w nim być: oferta, przycisk albo tło. Przedmioty i przyciski możesz też przeciągać myszką -
            dwa pola zamieniają się wtedy miejscami. Nic innego się nie przesuwa.
          </p>
          <p className="small">
            Oferty wypełniają pola ofert po kolei. Gdy ofert jest więcej niż pól, pojawia się następna strona. Te same pola służą też do
            wyników szukania i skrzynki „Do odebrania”.
          </p>
          <p className="small">
            Każdy przycisk zawsze gdzieś stoi. Chcesz go przenieść - przeciągnij go albo kliknij inne pole i wybierz ten przycisk.
            Przycisk „Zamknij” zmienia się w „Wróć do menu”, gdy gracz otworzy Targ z menu serwera.
          </p>
        </Fold>

        <p>
          <b>Oferty na żywo.</b> Zakładka z ofertami, które są teraz na Targu. Możesz zdjąć jedną ofertę albo wszystkie oferty gracza -
          przedmioty wracają do sprzedających.
        </p>
        <Fold title="Oferty na żywo - szczegóły" open={open === "live"}>
          <p className="small">
            Zdjęcie oferty działa od razu, bez „Wyślij na serwer”. Przedmiot nie ginie: trafia do skrzynki „Do odebrania” sprzedającego
            (albo do jego ekwipunku, gdy skrzynka jest wyłączona). Przydaje się przy ofertach z obraźliwą nazwą, oszustwach albo gdy
            gracz dostał bana.
          </p>
          <p className="small">
            Lista pokazuje stan z chwili wczytania - „Odśwież” wczytuje ją od nowa. Gdy aplikacja nie może wysłać komendy na serwer,
            pokaże ją do wklejenia w konsoli.
          </p>
        </Fold>

        <p>
          <b>Teksty w grze.</b> Wszystko, co Targ pisze graczom: tytuły okien, napisy na przyciskach, opis oferty i wiadomości na czacie.
        </p>
        <Fold title="Teksty w grze - szczegóły" open={open === "texts"}>
          <p className="small">
            Otwórz grupę, kliknij tekst i pisz w polu pod spodem. Przyciski „+ cena”, „+ nick sprzedawcy” itd. wstawiają ramki - w ich
            miejsce Targ sam wpisze właściwą rzecz. Na serwer idą tylko teksty, które zmieniłeś.
          </p>
        </Fold>
      </div>
    </div>
  );
}

export function SmallHelp({ title, onClose, onMore, children }: { title: string; onClose: () => void; onMore?: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>{title}</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        {children}
        {onMore && (
          <div className="row">
            <button type="button" onClick={onMore}>
              Dowiedz się więcej
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Treść małych „?” - klucz = część przewodnika, do której prowadzi „Dowiedz się więcej”. */
export const MARKET_SMALL_HELP: Record<Exclude<MarketGuidePart, null> | "ranks", { title: string; body: ReactNode; part: Exclude<MarketGuidePart, null> }> = {
  limits: {
    title: "Oferty i limity",
    part: "limits",
    body: (
      <>
        <p>Limit to ile ofert gracz może mieć naraz na Targu. Ceny spoza widełek Targ odrzuci przy wystawianiu.</p>
        <p>
          <b>Przykład:</b> limit 10 - gracz wystawia 10 rzeczy, jedenastą dopiero, gdy któraś się sprzeda albo ją wycofa.
        </p>
      </>
    ),
  },
  ranks: {
    title: "Więcej ofert dla rang",
    part: "limits",
    body: (
      <>
        <p>Gracz z rangą może mieć więcej ofert naraz. Wpisz nazwę rangi i liczbę, a graczom z tą rangą nadaj uprawnienie podane pod nazwą.</p>
        <p>
          <b>Przykład:</b> zwykły limit 10, VIP 20 - gracz z uprawnieniem VIP wystawi 20 rzeczy naraz.
        </p>
      </>
    ),
  },
  tax: {
    title: "Podatek",
    part: "tax",
    body: (
      <p>
        Sprzedający nie dostaje tej części ceny - pieniądze znikają z serwera. Kupujący płaci zawsze tyle, ile w ofercie. <b>Przykład:</b>{" "}
        5% - za przedmiot sprzedany za 100 sprzedający dostaje 95.
      </p>
    ),
  },
  mailbox: {
    title: "Skrzynka „Do odebrania”",
    part: "mailbox",
    body: (
      <p>
        Włączona: wygasłe oferty i kupione rzeczy, które nie zmieściły się w ekwipunku, czekają w przycisku „Do odebrania”. Wyłączona:
        takie rzeczy wypadają pod nogi albo wracają do ekwipunku.
      </p>
    ),
  },
  window: {
    title: "Wygląd okna",
    part: "window",
    body: (
      <p>
        Kliknij pole, żeby wybrać: oferta, przycisk albo tło. Albo przeciągnij przedmiot na inne pole - zamienią się miejscami. Szare
        przedmioty na polach ofert to tylko przykład.
      </p>
    ),
  },
  live: {
    title: "Oferty na żywo",
    part: "live",
    body: (
      <p>
        Oferty, które są teraz na Targu. „Zdejmij” działa od razu - przedmiot wraca do sprzedającego (do skrzynki „Do odebrania” albo
        ekwipunku), nic nie ginie.
      </p>
    ),
  },
  texts: {
    title: "Teksty w grze",
    part: "texts",
    body: (
      <p>
        Wszystko, co Targ pisze graczom. Kliknij tekst i zmień go w polu pod spodem. <span className="ci-sample">Podkreślone</span> to
        przykład - w grze wstawi się prawdziwa nazwa, cena itd.
      </p>
    ),
  },
};

export function MarketCommandsModal({ config, onClose }: { config: MarketConfig; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Komendy Targu</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <div className="ci-section-title">Dla graczy</div>
        <div className="ci-protip">
          <CopyRow cmd="/targ" what="otwiera Targ" />
          <CopyRow cmd="/targ wystaw <cena>" what="wystawia przedmiot z ręki, np. /targ wystaw 500" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Dla admina
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          W konsoli serwera wpisuj bez „/” na początku.
        </p>
        <div className="ci-protip">
          <CopyRow cmd="/@market reload" what="wczytuje ustawienia od nowa (aplikacja robi to sama po „Wyślij na serwer”)" />
          <CopyRow cmd="/@market list <gracz>" what="pokazuje oferty gracza z ich numerami" />
          <CopyRow cmd="/@market remove <gracz>" what="zdejmuje wszystkie oferty gracza - przedmioty wracają do niego" />
          <CopyRow cmd="/@market remove-offer <numer>" what="zdejmuje jedną ofertę (numer z listy wyżej)" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Uprawnienia
        </div>
        <div className="ci-protip">
          <CopyRow cmd="mainplugins.market.admin" what="komendy /@market" />
          {config.rankLimits
            .filter((r) => r.rank.trim())
            .map((r) => (
              <CopyRow key={r.rank} cmd={`mainplugins.market.rank.${r.rank.trim().toLowerCase()}`} what={`ranga ${r.rank.trim()} - ${r.limit} ofert naraz`} />
            ))}
          <CopyRow cmd="mainplugins.market.limit.15" what="gracz może mieć 15 ofert naraz (liczba dowolna, wygrywa najwyższa)" />
        </div>
      </div>
    </div>
  );
}
