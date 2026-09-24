import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { defaultAnnounceTexts, fillPlaceholders, parseAnnounceTexts, patchLangFile } from "./shopAnnounce";

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

  it("podmienia wstawki w podglądzie, nieznane zostawia", () => {
    expect(fillPlaceholders("{item} za {price}$ {x}", { item: "Bruk", price: "10" })).toBe("Bruk za 10$ {x}");
  });
});
