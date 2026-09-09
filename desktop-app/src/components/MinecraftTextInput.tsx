import { useEffect, useRef, useState } from "react";
import { MC_COLORS } from "../lib/minecraftColors";
import MinecraftTextPreview from "./MinecraftTextPreview";
import ObfuscatedText from "./ObfuscatedText";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Wywoływane po wciśnięciu Enter w polu tekstowym - opcjonalne, np. AnnouncementsPage
      zwija wiersz po Enterze zamiast zostawiać go zawsze rozwiniętym. */
  onEnter?: () => void;
}

export default function MinecraftTextInput({ value, onChange, placeholder, onEnter }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Popover zamyka się przy kliknięciu gdziekolwiek indziej - bez tego zostawałby
  // otwarty na stałe, bo nic innego go nie zamyka (nie jest to <select>/natywny dialog).
  useEffect(() => {
    if (!pickerOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [pickerOpen]);

  function insert(code: string) {
    const input = inputRef.current;
    if (!input) {
      onChange(value + code);
      return;
    }
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const next = value.slice(0, start) + code + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + code.length;
      input.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="mc-text-input" ref={wrapperRef}>
      <div className="mc-text-row">
        {/* Mały kwadrat przed polem tekstowym zamiast stałego panelu obok - klik otwiera
            popover z kolorami/stylem dokładnie tam, gdzie się pisze, więc nic nie zajmuje
            miejsca, dopóki faktycznie nie chcesz czegoś pokolorować. */}
        <button
          type="button"
          className="mc-swatch-trigger"
          title="Kolor i styl tekstu"
          onClick={() => setPickerOpen((o) => !o)}
        />
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
        />
      </div>
      <div className="mc-preview">
        <MinecraftTextPreview text={value} />
      </div>

      {pickerOpen && (
        <div className="mc-color-popover">
          <div className="mc-toolbar-group">
            <span className="mc-toolbar-label">Kolor</span>
            {/* Wszystkie 16 oficjalnych kolorów czatu Minecrafta (Java Edition, kody
                &0-&9/&a-&f), w kolejności kodów - nazwa koloru pod myszą (tooltip),
                bez liter na kafelkach (mniej szumu wizualnego). */}
            <div className="mc-color-grid">
              {MC_COLORS.map(([code, hex, label]) => (
                <button
                  key={code}
                  type="button"
                  title={`${label} (&${code})`}
                  className="mc-swatch"
                  style={{ background: hex }}
                  onClick={() => insert(`&${code}`)}
                />
              ))}
            </div>
          </div>

          <div className="mc-toolbar-group">
            <span className="mc-toolbar-label">Styl</span>
            <div className="mc-toolbar">
              <button type="button" className="mc-style-btn" title="Pogrubienie" onClick={() => insert("&l")}>
                <b>B</b>
              </button>
              <button type="button" className="mc-style-btn" title="Kursywa" onClick={() => insert("&o")}>
                <i>I</i>
              </button>
              <button type="button" className="mc-style-btn" title="Podkreślenie" onClick={() => insert("&n")}>
                <u>U</u>
              </button>
              <button type="button" className="mc-style-btn" title="Przekreślenie" onClick={() => insert("&m")}>
                <s>S</s>
              </button>
              {/* Sam przycisk faktycznie miga losowymi znakami (patrz ObfuscatedText.tsx),
                  żeby było widać, co robi &k, zamiast zgadywać po samym "?#?". */}
              <button type="button" className="mc-style-btn mc-style-btn-wide" title="Zaszyfrowany (losowe znaki w grze)" onClick={() => insert("&k")}>
                <ObfuscatedText text="Abc" />
              </button>
              <button type="button" className="mc-style-btn mc-style-btn-wide" title="Reset formatowania" onClick={() => insert("&r")}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
