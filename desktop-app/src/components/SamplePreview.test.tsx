import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SamplePreview from "./SamplePreview";

it("przykłady są podkreślone, reszta tekstu nie, kolory jak w grze", () => {
  const html = renderToStaticMarkup(
    <SamplePreview text="&d★ OFERTA: {category} ★ {nieznane}" values={{ category: "&e&lKolekcja" }} labels={{ category: "nazwa kategorii" }} />
  );
  expect(html).toContain('class="ci-sample" title="Przykład - w grze wstawi się tu nazwa kategorii">Kolekcja</span>');
  expect(html).toContain("★ OFERTA: </span>");
  // po wstawce z kolorem tekst dalej jest żółty i gruby - jak w grze
  expect(html).toMatch(/color:#FFFF55;font-weight:700[^>]*> ★ \{nieznane\}<\/span>/);
  expect(html).not.toMatch(/[-]/);
});
