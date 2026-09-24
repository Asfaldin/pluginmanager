// Polskie odmiany do opisów pod polami ("5 przedmiotów", "co 2 godziny", "co tydzień") -
// opis ma mówić o liczbie, która JEST wpisana, a nie o stałym przykładzie.

/** 1 przedmiot, 2 przedmioty, 5 przedmiotów, 22 przedmioty, 12 przedmiotów. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const last = Math.abs(n) % 10;
  const lastTwo = Math.abs(n) % 100;
  if (Number.isInteger(n) && last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return Number.isInteger(n) ? many : few;
}

/** "codziennie", "co 3 dni", "co 14 dni" - zawsze w dniach, bez przeliczania na tygodnie (tak chce użytkownik). */
export function everyDays(n: number): string {
  return n === 1 ? "codziennie" : `co ${n} dni`;
}

/** "raz na godzinę", "co 2 godziny", "co 30 minut", "co 90 minut". */
export function everyMinutes(n: number): string {
  if (n === 60) return "raz na godzinę";
  if (n > 0 && n % 60 === 0) {
    const h = n / 60;
    return `co ${h} ${plural(h, "godzinę", "godziny", "godzin")}`;
  }
  return `co ${n} ${plural(n, "minutę", "minuty", "minut")}`;
}

/** Liczba do opisu: bez zbędnych zer, z przecinkiem ("12,5"). */
export function num(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}
