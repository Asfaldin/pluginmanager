import { Link, useParams } from "react-router-dom";

/** Regulamin/Polityka Prywatności, otwierane z checkboxa rejestracji w AccountLoginCard.tsx
    - wcześniej checkbox wymuszał akceptację tekstu, którego nie dało się nigdzie przeczytać.

    WAŻNE: treść poniżej to SZKIELET/DRAFT, nie gotowy dokument prawny - sekcje i typowe
    klauzule są na miejscu, ale przed realną sprzedażą licencji MUSI to przejrzeć prawnik
    (dane sprzedawcy, NIP, polityka zwrotów zgodna z ustawą o prawach konsumenta, RODO).
    Nie zastępuje to konsultacji prawnej - jest tu wyłącznie po to, żeby checkbox miał
    dokąd prowadzić, zamiast do nikąd. */
const CONTENT: Record<"terms" | "privacy", { title: string; sections: { heading: string; body: string }[] }> = {
  terms: {
    title: "Regulamin",
    sections: [
      {
        heading: "1. Postanowienia ogólne",
        body:
          "Niniejszy regulamin określa zasady korzystania z aplikacji PluginManager oraz zakupu licencji na pluginy serwerowe za jej pośrednictwem. Korzystając ze Sklepu w aplikacji, akceptujesz poniższe warunki.",
      },
      {
        heading: "2. Konto klienta",
        body:
          "Do zakupu i zarządzania licencjami wymagane jest założenie konta (adres e-mail i hasło). Klient odpowiada za zachowanie poufności danych logowania.",
      },
      {
        heading: "3. Licencje",
        body:
          "Zakupiona licencja uprawnia do korzystania z danego pluginu na jednym serwerze Minecraft, zgodnie z opisem produktu w Sklepie. Licencja jest przypisywana do pierwszego serwera, na którym zostanie użyta.",
      },
      {
        heading: "4. Płatności i zwroty",
        body:
          "Płatności są realizowane przez zewnętrznego operatora płatności. Zasady zwrotów są zgodne z obowiązującymi przepisami o prawach konsumenta.",
      },
      {
        heading: "5. Odpowiedzialność",
        body:
          "Sprzedawca dokłada starań, aby pluginy działały zgodnie z opisem, nie gwarantuje jednak nieprzerwanego, bezbłędnego działania w każdej konfiguracji serwera.",
      },
    ],
  },
  privacy: {
    title: "Polityka Prywatności",
    sections: [
      {
        heading: "1. Jakie dane zbieramy",
        body: "Adres e-mail i hasło (przechowywane w formie zahashowanej) podane przy zakładaniu konta, a także historia zakupionych licencji.",
      },
      {
        heading: "2. W jakim celu",
        body: "Dane służą wyłącznie do obsługi konta, sprzedaży i weryfikacji licencji oraz kontaktu w sprawach związanych z zakupem.",
      },
      {
        heading: "3. Udostępnianie danych",
        body: "Dane nie są sprzedawane ani udostępniane podmiotom trzecim poza operatorem płatności, niezbędnym do realizacji zakupu.",
      },
      {
        heading: "4. Twoje prawa",
        body: "Masz prawo do wglądu, poprawy i usunięcia swoich danych - skontaktuj się w tej sprawie ze sprzedawcą.",
      },
    ],
  },
};

export default function LegalPage() {
  const { kind } = useParams<{ kind: "terms" | "privacy" }>();
  const doc = kind && kind in CONTENT ? CONTENT[kind] : null;

  return (
    <div className="page">
      <Link to="/account" className="back-link">← Konto</Link>
      {!doc ? (
        <p className="error">Nie znaleziono tego dokumentu.</p>
      ) : (
        <>
          <h1>{doc.title}</h1>
          <p className="muted small">
            Wersja robocza - ostateczna treść (dane sprzedawcy, zgodność z przepisami) zostanie uzupełniona przed uruchomieniem sprzedaży.
          </p>
          {doc.sections.map((s) => (
            <div key={s.heading} style={{ marginTop: "1.2rem" }}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
