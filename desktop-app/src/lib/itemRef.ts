// Odwołanie do przedmiotu we wszystkich configach: { item: MATERIAL } albo { custom: ID }, opcjonalnie amount.

export interface ItemRef {
  item?: string;
  custom?: string;
  amount?: number;
}

export function itemRefFromYaml(raw: unknown): ItemRef {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ref: ItemRef = {};
  if (o.custom != null) ref.custom = String(o.custom);
  else ref.item = o.item != null ? String(o.item) : "STONE";
  if (typeof o.amount === "number" && o.amount > 1) ref.amount = o.amount;
  return ref;
}

/** alwaysAmount = zapisz ilość także, gdy to 1 (czytelniej w wymogach zadań). */
export function itemRefToYaml(r: ItemRef, alwaysAmount = false): Record<string, unknown> {
  const o: Record<string, unknown> = r.custom != null ? { custom: r.custom } : { item: r.item ?? "STONE" };
  if (alwaysAmount || (r.amount && r.amount > 1)) o.amount = r.amount ?? 1;
  return o;
}
