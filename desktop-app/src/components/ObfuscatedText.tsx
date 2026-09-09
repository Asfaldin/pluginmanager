import { useEffect, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

function scramble(text: string): string {
  return text
    .split("")
    .map((ch) => (ch === " " ? " " : CHARS[Math.floor(Math.random() * CHARS.length)]))
    .join("");
}

/** Imituje efekt &k (obfuscated) z Minecrafta - losowe znaki tej samej długości co
    oryginalny tekst, przełączane co ~75ms, zamiast statycznego podkreślenia. Spacje
    zostają spacjami, żeby słowa dało się policzyć wzrokiem mimo migających liter.
    Używane zarówno w podglądzie (MinecraftTextPreview), jak i na przycisku "Zaszyfrowany"
    w toolbarze, żeby efekt było od razu widać, a nie tylko czytać z tooltipa. */
export default function ObfuscatedText({ text }: { text: string }) {
  const [display, setDisplay] = useState(() => scramble(text));

  useEffect(() => {
    const id = setInterval(() => setDisplay(scramble(text)), 75);
    return () => clearInterval(id);
  }, [text]);

  return <>{display}</>;
}
