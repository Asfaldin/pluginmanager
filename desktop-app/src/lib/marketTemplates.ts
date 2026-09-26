import { BUTTON_IDS, defaultMarket, parseMarketYaml, serializeMarketYaml } from "./marketYaml";

// Gotowe ustawienia Targu do wczytania w edytorze (liczby + wygląd okna; teksty zostają, jakie są).
// Jeden gotowy = to samo, co plugin wgrywa na nowym serwerze. Resztę właściciel zapisuje sam.

export interface MarketTemplate {
  "market.yml": string;
}

export type MarketTemplateId = "ours" | "empty";

/** Pusty: te same liczby, okno bez pól ofert - same przyciski na dole, pola ofert stawiasz sam. */
function empty(): string {
  const c = defaultMarket();
  return serializeMarketYaml({ ...c, offerSlots: [], buttons: Object.fromEntries(BUTTON_IDS.map((id) => [id, c.buttons[id]])) });
}

export function marketTemplateChoices(): { id: MarketTemplateId; label: string; desc: string; template: MarketTemplate }[] {
  return [
    {
      id: "ours",
      label: "Gotowy",
      desc: "6 rzędów, 21 ofert na stronie, 10 ofert na gracza",
      template: { "market.yml": serializeMarketYaml(defaultMarket()) },
    },
    {
      id: "empty",
      label: "Pusty",
      desc: "okno bez pól na oferty - układasz je sam w „Wygląd okna”",
      template: { "market.yml": empty() },
    },
  ];
}

/** Szablon z pliku (pobrany przez „Pobierz” przy szablonie); null = to nie jest szablon Targu. */
export function parseMarketTemplateFile(text: string): MarketTemplate | null {
  try {
    const t = JSON.parse(text) as Partial<MarketTemplate>;
    if (typeof t["market.yml"] !== "string") return null;
    parseMarketYaml(t["market.yml"]);
    return { "market.yml": t["market.yml"] };
  } catch {
    return null;
  }
}

export function isMarketTemplate(t: unknown): boolean {
  return Boolean(t) && typeof (t as MarketTemplate)["market.yml"] === "string";
}
