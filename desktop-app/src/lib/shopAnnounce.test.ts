import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { changedTexts, defaultAnnounceTexts, fillPlaceholders, parseAnnounceTexts, patchLangFile, TEXT_FIELDS } from "./shopAnnounce";

const LANG = `# teksty sklepu
gui:
  title: "&6Sklep"
dynamic:
  reset-broadcast: "&6Stary tekst"
rotation:
  broadcast-header: "&d★ {category}"
  broadcast-item: "&8- {item}"
  broadcast-footer: "&7za {days} dni"
admin:
  usage:
    - "&e/@shop reload"
`;

describe("shopAnnounce", () => {
  it("czyta teksty z pliku, brakujące bierze z domyślnych", () => {
    const t = parseAnnounceTexts(LANG, "pl");
    expect(t["rotation.broadcast-header"]).toBe("&d★ {category}");
    expect(t["dynamic.reset-broadcast"]).toBe("&6Stary tekst");
    expect(t["event.broadcast-off"]).toBe(defaultAnnounceTexts("pl")["event.broadcast-off"]);
  });

  it("bez pliku i przy zepsutym pliku zwraca domyślne", () => {
    expect(parseAnnounceTexts(null, "en")).toEqual(defaultAnnounceTexts("en"));
    expect(parseAnnounceTexts("a: [", "pl")).toEqual(defaultAnnounceTexts("pl"));
  });

  it("zmienia tylko swoje linijki, reszta pliku zostaje", () => {
    const texts = { ...parseAnnounceTexts(LANG, "pl"), "rotation.broadcast-header": '&c"Nowa" oferta: {category}' };
    const out = patchLangFile(LANG, texts);
    expect(out).toContain("# teksty sklepu");
    expect(out).toContain('  title: "&6Sklep"');
    expect(out).toContain('    - "&e/@shop reload"');
    const parsed = yaml.load(out) as Record<string, Record<string, unknown>>;
    expect(parsed.rotation["broadcast-header"]).toBe('&c"Nowa" oferta: {category}');
    expect(parsed.rotation["broadcast-item"]).toBe("&8- {item}");
    // sekcji event nie bylo - dopisana na koncu
    expect(parsed.event["broadcast-all-off"]).toBe(defaultAnnounceTexts("pl")["event.broadcast-all-off"]);
    expect(parsed.admin.usage).toEqual(["&e/@shop reload"]);
  });

  it("dopisuje brakujący klucz do istniejącej sekcji i działa na pustym pliku", () => {
    const out = patchLangFile("dynamic:\n  other: x\n", { "dynamic.reset-broadcast": "&aOK" });
    expect(yaml.load(out)).toEqual({ dynamic: { "reset-broadcast": "&aOK", other: "x" } });
    expect(yaml.load(patchLangFile("", { "dynamic.reset-broadcast": "&aOK" }))).toEqual({ dynamic: { "reset-broadcast": "&aOK" } });
  });

  it("drugi zapis tych samych tekstów niczego nie zmienia", () => {
    const texts = parseAnnounceTexts(LANG, "pl");
    const once = patchLangFile(LANG, texts);
    expect(patchLangFile(once, texts)).toBe(once);
  });

  it("zna wszystkie teksty pluginu z ludzkimi nazwami i wstawkami", () => {
    expect(TEXT_FIELDS.length).toBeGreaterThan(150);
    expect(TEXT_FIELDS.filter((f) => f.label === f.key)).toEqual([]);
    const bought = TEXT_FIELDS.find((f) => f.key === "buy.bought")!;
    expect(bought).toMatchObject({ group: "player", list: false });
    expect(bought.placeholders).toEqual(["amount", "item", "price", "currency"]);
    expect(TEXT_FIELDS.find((f) => f.key === "admin.usage")).toMatchObject({ group: "admin", list: true });
    expect(TEXT_FIELDS.find((f) => f.key === "places.sign-line-1")?.group).toBe("places");
    expect(TEXT_FIELDS.find((f) => f.key === "places.npc-created")?.group).toBe("admin");
    // angielskie domyślne mają te same klucze
    expect(Object.keys(defaultAnnounceTexts("en")).sort()).toEqual(Object.keys(defaultAnnounceTexts("pl")).sort());
  });

  it("listę (kilka linijek) zapisuje w całości, bez ruszania sąsiadów", () => {
    const texts = { "admin.usage": "&aPierwsza\n&bDruga" };
    const out = patchLangFile(LANG + "  after: x\n", texts);
    const parsed = yaml.load(out) as Record<string, Record<string, unknown>>;
    expect(parsed.admin.usage).toEqual(["&aPierwsza", "&bDruga"]);
    expect(parsed.admin.after).toBe("x");
    expect(patchLangFile(out, texts)).toBe(out);
    expect(parseAnnounceTexts(out, "pl")["admin.usage"]).toBe("&aPierwsza\n&bDruga");
  });

  it("do pliku idą tylko zmienione teksty", () => {
    const base = defaultAnnounceTexts("pl");
    expect(changedTexts({ ...base, "buy.bought": "&aOK" }, base)).toEqual({ "buy.bought": "&aOK" });
    expect(changedTexts(base, base)).toEqual({});
  });

  it("podmienia wstawki w podglądzie, nieznane zostawia", () => {
    expect(fillPlaceholders("{item} za {price}$ {x}", { item: "Bruk", price: "10" })).toBe("Bruk za 10$ {x}");
  });
});
