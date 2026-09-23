import type { ReactNode } from "react";
import { parseMinecraftText } from "../lib/minecraftColors";

// Znaczniki wokół podstawionej wartości: początek (+ numer wstawki) i koniec. Z Prywatnego obszaru
// Unicode, więc nie zderzą się z prawdziwym tekstem, a parser kolorów traktuje je jak zwykłe znaki.
const START = 0xe000;
const END = String.fromCharCode(0xe0ff);

/** Podgląd tekstu z wstawkami (np. {category}) podmienionymi na przykłady. Przykładowe kawałki są
    podkreślone kropkami i mają dymek "przykład", żeby było jasne, co w grze wstawi się samo.
    Podmiana idzie PRZED kolorami - tak jak w pluginie, więc kolory wyglądają jak w grze. */
export default function SamplePreview({
  text,
  values,
  labels,
  emptyLabel = "(pusto)",
}: {
  text: string;
  values: Record<string, string>;
  labels: Record<string, string>;
  emptyLabel?: string;
}) {
  if (!text) return <span className="muted">{emptyLabel}</span>;
  const keys = Object.keys(values);
  const marked = text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const i = keys.indexOf(k);
    return i < 0 ? m : String.fromCharCode(START + i) + values[k] + END;
  });
  const out: ReactNode[] = [];
  let sample: string | null = null;
  parseMinecraftText(marked).forEach((seg, si) => {
    const style = {
      color: seg.color ?? "#e6e8ee",
      fontWeight: seg.bold ? 700 : 400,
      fontStyle: seg.italic ? "italic" : "normal",
      textDecoration: [seg.underline && "underline", seg.strikethrough && "line-through"].filter(Boolean).join(" ") || "none",
    } as const;
    let buf = "";
    const flush = (key: string) => {
      if (!buf) return;
      out.push(
        sample != null ? (
          <span key={key} style={style} className="ci-sample" title={`Przykład - w grze wstawi się tu ${labels[sample] ?? sample}`}>
            {buf}
          </span>
        ) : (
          <span key={key} style={style}>
            {buf}
          </span>
        )
      );
      buf = "";
    };
    for (let i = 0; i < seg.text.length; i++) {
      const c = seg.text.charCodeAt(i);
      if (c >= START && c < START + keys.length) {
        flush(`${si}-${i}`);
        sample = keys[c - START];
      } else if (seg.text[i] === END) {
        flush(`${si}-${i}`);
        sample = null;
      } else {
        buf += seg.text[i];
      }
    }
    flush(`${si}-end`);
  });
  return <>{out}</>;
}
