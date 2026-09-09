import { parseMinecraftText } from "../lib/minecraftColors";
import ObfuscatedText from "./ObfuscatedText";

/** Renderuje tekst z kodami koloru/formatowania Minecrafta (&a, &l, &#RRGGBB...) jako
    faktycznie pokolorowany/pogrubiony/etc. tekst - współdzielone przez pole edycji
    (MinecraftTextInput) i zwinięty podgląd wiadomości (np. AnnouncementsPage), żeby
    obie te rzeczy zawsze wyglądały identycznie. */
export default function MinecraftTextPreview({ text, emptyLabel = "(podgląd)" }: { text: string; emptyLabel?: string }) {
  if (!text) return <span className="muted">{emptyLabel}</span>;
  const segments = parseMinecraftText(text);
  return (
    <>
      {segments.map((s, i) => (
        <span
          key={i}
          title={s.obfuscated ? "W grze: losowe znaki" : undefined}
          className={s.obfuscated ? "mc-obfuscated" : undefined}
          style={{
            color: s.color ?? "#e6e8ee",
            fontWeight: s.bold ? 700 : 400,
            fontStyle: s.italic ? "italic" : "normal",
            textDecoration: [s.underline && "underline", s.strikethrough && "line-through"].filter(Boolean).join(" ") || "none",
          }}
        >
          {s.obfuscated ? <ObfuscatedText text={s.text} /> : s.text}
        </span>
      ))}
    </>
  );
}
