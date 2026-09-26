import * as yaml from "js-yaml";

// Oferty, które teraz są na Targu - z listings.yml pluginu (listings.<id>: seller-name, price, listed-at,
// type, amount, name). Starsze oferty bez opisu plugin uzupełnia sam przy starcie.

export interface LiveOffer {
  id: string;
  seller: string;
  price: number;
  listedAt: number;
  /** Materiał (DIAMOND) - pusty, gdy oferta nie ma jeszcze opisu. */
  type: string;
  amount: number;
  /** Nazwa przedmiotu (własna albo z gry). */
  name: string;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function parseOffers(text: string | null): LiveOffer[] {
  if (!text) return [];
  let root: unknown;
  try {
    root = yaml.load(text);
  } catch {
    return [];
  }
  return Object.entries(obj(obj(root).listings))
    .map(([id, v]) => {
      const o = obj(v);
      return {
        id,
        seller: typeof o["seller-name"] === "string" ? o["seller-name"] : "?",
        price: typeof o.price === "number" ? o.price : 0,
        listedAt: typeof o["listed-at"] === "number" ? o["listed-at"] : 0,
        type: typeof o.type === "string" ? o.type : "",
        amount: typeof o.amount === "number" ? o.amount : 1,
        name: typeof o.name === "string" ? o.name : "",
      };
    })
    .sort((a, b) => b.listedAt - a.listedAt);
}

/** Za ile oferta wygaśnie (ms); null = nigdy (expireDays 0). Ujemne = już po czasie. */
export function expiresIn(offer: LiveOffer, expireDays: number, now = Date.now()): number | null {
  if (expireDays <= 0) return null;
  return offer.listedAt + expireDays * 86_400_000 - now;
}
