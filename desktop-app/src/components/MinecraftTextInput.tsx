import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import {
  charsWithStyle,
  groupRuns,
  isToken,
  parseUnits,
  replaceRange,
  serializeUnits,
  styleAt,
  styleRange,
  toggleFlag,
  wordEnd,
  wordStart,
  type McFlag,
  type McStyle,
  type McUnit,
} from "../lib/mcRichText";
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
  /** Bez podglądu pod polem w trybie kodów - gdy strona pokazuje podgląd sama. */
  hidePreview?: boolean;
  /** Przyciski wstawiające tekst w miejscu kursora, np. {category} opisane jako "nazwa kategorii".
      W polu takie wstawki są jednym "klockiem" z opisem zamiast klamer. */
  inserts?: Array<{ code: string; label: string }>;
  /** Dla przycisków Cofnij/Ponów na stronie - patrz MinecraftTextHandle. */
  ref?: Ref<MinecraftTextHandle>;
  /** Czy jest co cofać / ponawiać - do wyszarzania przycisków na stronie. */
  onHistoryChange?: (h: { canUndo: boolean; canRedo: boolean }) => void;
}

/** Sterowanie polem z zewnątrz: przyciski Cofnij/Ponów i "Przywróć domyślny" (z możliwością cofnięcia). */
export interface MinecraftTextHandle {
  undo: () => void;
  redo: () => void;
  /** Podmienia cały tekst jak zwykła edycja - da się to cofnąć. */
  replaceAll: (text: string) => void;
}

// Polskie nazwy 16 kolorów czatu, w kolejności kodów &0-&f (MC_COLORS ma angielskie).
const COLOR_NAMES_PL: Record<string, string> = {
  "0": "czarny",
  "1": "ciemnoniebieski",
  "2": "ciemnozielony",
  "3": "morski",
  "4": "ciemnoczerwony",
  "5": "fioletowy",
  "6": "złoty",
  "7": "szary",
  "8": "ciemnoszary",
  "9": "niebieski",
  a: "zielony",
  b: "błękitny",
  c: "czerwony",
  d: "różowy",
  e: "żółty",
  f: "biały",
};

const DEFAULT_COLOR = "#e6e8ee";

function applyStyle(el: HTMLElement, s: McStyle) {
  el.style.color = s.color ?? DEFAULT_COLOR;
  el.style.fontWeight = s.bold ? "700" : "400";
  el.style.fontStyle = s.italic ? "italic" : "normal";
  el.style.textDecoration = [s.underline && "underline", s.strikethrough && "line-through"].filter(Boolean).join(" ") || "none";
  if (s.obfuscated) el.classList.add("mc-rich-obf");
}

const isChip = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.dataset.token != null;
const nodeLen = (n: Node) => (isChip(n) ? 1 : (n.textContent ?? "").length);

/** Miejsce w drzewie strony -> numer znaku w polu (klocek liczy się jako 1). */
function pointToOffset(root: HTMLElement, node: Node, off: number): number {
  const kids = Array.from(root.childNodes);
  if (node === root) return kids.slice(0, off).reduce((n, k) => n + nodeLen(k), 0);
  let n = 0;
  for (const k of kids) {
    if (k === node || k.contains(node)) {
      if (isChip(k)) return n + (off > 0 ? 1 : 0);
      if (node.nodeType === Node.TEXT_NODE) return n + off;
      return n + (off > 0 ? nodeLen(k) : 0);
    }
    n += nodeLen(k);
  }
  return n;
}

/** Numer znaku -> miejsce w drzewie strony (do ustawienia kursora). */
function offsetToPoint(root: HTMLElement, off: number): [Node, number] {
  const kids = root.childNodes;
  let rem = off;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (isChip(k)) {
      if (rem === 0) return [root, i];
      rem -= 1;
      continue;
    }
    const len = nodeLen(k);
    if (rem <= len) return [k.firstChild ?? k, rem];
    rem -= len;
  }
  return [root, kids.length];
}

/** Pole tekstowe z kolorami Minecrafta "jak w Wordzie": widać od razu kolorowy tekst, kolor i styl
    nadaje się zaznaczeniu. Do `onChange` zawsze idzie zwykły tekst z kodami & (to czyta plugin).
    Dla zaawansowanych jest przełącznik "&" pokazujący surowe kody. */
export default function MinecraftTextInput({ value, onChange, placeholder, onEnter, hidePreview, inserts, ref, onHistoryChange }: Props) {
  const tokens = (inserts ?? []).map((i) => i.code);
  const tokensKey = tokens.join("\u0000");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const rawRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rawMode, setRawMode] = useState(false);

  const unitsRef = useRef<McUnit[]>(parseUnits(value, tokens));
  const valueRef = useRef(value);
  const tokensKeyRef = useRef(tokensKey);
  // Styl "na później": kolor kliknięty bez zaznaczenia działa na to, co zaraz wpiszesz w tym miejscu.
  const pendingRef = useRef<{ at: number; style: McStyle } | null>(null);
  const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const composingRef = useRef(false);
  // Świeże propsy dla nasłuchiwaczy dodanych raz (addEventListener).
  const propsRef = useRef({ onChange, onEnter, tokens, inserts, onHistoryChange });
  propsRef.current = { onChange, onEnter, tokens, inserts, onHistoryChange };

  function reportHistory() {
    const h = historyRef.current;
    propsRef.current.onHistoryChange?.({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  }

  function remember(prev: string) {
    historyRef.current.past.push(prev);
    if (historyRef.current.past.length > 200) historyRef.current.past.shift();
    historyRef.current.future = [];
  }

  useImperativeHandle(ref, () => ({
    undo: () => undo(false),
    redo: () => undo(true),
    replaceAll: (text: string) => {
      pendingRef.current = null;
      const units = parseUnits(text, propsRef.current.tokens);
      commit(units, units.length);
    },
  }));

  function paint(sel?: [number, number]) {
    const root = editorRef.current;
    if (!root) return;
    const labels = propsRef.current.inserts ?? [];
    const nodes: Node[] = groupRuns(unitsRef.current).map((run) => {
      const el = document.createElement("span");
      if ("token" in run) {
        el.dataset.token = run.token;
        el.contentEditable = "false";
        el.className = "mc-chip";
        el.textContent = labels.find((l) => l.code === run.token)?.label ?? run.token;
        el.title = `Wstawka ${run.token} - sklep podmieni ją w chwili ogłoszenia`;
      } else {
        el.textContent = run.text;
      }
      applyStyle(el, run.style);
      return el;
    });
    root.replaceChildren(...nodes);
    if (sel && document.activeElement === root) setSelection(sel[0], sel[1]);
  }

  function setSelection(a: number, b: number) {
    const root = editorRef.current;
    const s = window.getSelection();
    if (!root || !s) return;
    const [an, ao] = offsetToPoint(root, a);
    const [bn, bo] = offsetToPoint(root, b);
    const r = document.createRange();
    r.setStart(an, ao);
    r.setEnd(bn, bo);
    s.removeAllRanges();
    s.addRange(r);
  }

  function getSelection(): [number, number] | null {
    const root = editorRef.current;
    const s = window.getSelection();
    if (!root || !s || s.rangeCount === 0) return null;
    const r = s.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    const a = pointToOffset(root, r.startContainer, r.startOffset);
    const b = pointToOffset(root, r.endContainer, r.endOffset);
    return [Math.min(a, b), Math.max(a, b)];
  }

  function selectionOrEnd(): [number, number] {
    const n = unitsRef.current.length;
    return getSelection() ?? [n, n];
  }

  /** Zapisuje zmianę: kody & do onChange, pole rysowane od nowa, kursor/zaznaczenie na miejsce. */
  function commit(units: McUnit[], selStart: number, selEnd = selStart, record = true) {
    const text = serializeUnits(units);
    // Wpisane ręcznie "&e" od razu staje się kolorem - kursor cofa się o zjedzone znaki.
    const re = parseUnits(text, propsRef.current.tokens);
    const eaten = units.length - re.length;
    const fix = (n: number) => Math.max(0, Math.min(re.length, n - eaten));
    if (record && text !== valueRef.current) remember(valueRef.current);
    if (eaten > 0) {
      // Kod wpisany na końcu (np. "&a") nie ma jeszcze znaków - dalsze pisanie ma dostać jego kolor.
      const probe = parseUnits(serializeUnits(units.slice(0, selStart)) + "\u0001");
      pendingRef.current = { at: fix(selStart), style: { ...probe[probe.length - 1].style } };
    }
    unitsRef.current = re;
    const changed = text !== valueRef.current;
    valueRef.current = text;
    paint(eaten > 0 ? [fix(selStart), fix(selEnd)] : [selStart, selEnd]);
    if (changed) propsRef.current.onChange(text);
    reportHistory();
  }

  function insertUnits(inserted: McUnit[]) {
    const [s, e] = selectionOrEnd();
    pendingRef.current = null;
    commit(replaceRange(unitsRef.current, s, e, inserted), s + inserted.length);
  }

  function typingStyle(at: number): McStyle {
    const p = pendingRef.current;
    return p && p.at === at ? { ...p.style } : styleAt(unitsRef.current, at);
  }

  function insertText(text: string, parseCodes: boolean) {
    const clean = text.replace(/[\r\n]+/g, " ");
    if (!clean) return;
    const [s] = selectionOrEnd();
    const tokensNow = propsRef.current.tokens;
    const inserted = parseCodes
      ? parseUnits(clean, tokensNow)
      : parseUnits(clean.replace(/&/g, "\u0000"), tokensNow).map((u) => {
          const style = typingStyle(s);
          return isToken(u) ? { token: u.token, style } : { ch: u.ch === "\u0000" ? "&" : u.ch, style };
        });
    insertUnits(inserted);
  }

  function deleteRange(a: number, b: number) {
    if (a >= b) return;
    pendingRef.current = null;
    commit(replaceRange(unitsRef.current, a, b, []), a);
  }

  function undo(redo = false) {
    const h = historyRef.current;
    const from = redo ? h.future : h.past;
    const to = redo ? h.past : h.future;
    const v = from.pop();
    if (v == null) return;
    to.push(valueRef.current);
    unitsRef.current = parseUnits(v, propsRef.current.tokens);
    commit(unitsRef.current, unitsRef.current.length, unitsRef.current.length, false);
  }

  /** Kolor albo styl z okienka: na zaznaczenie, a bez zaznaczenia - na to, co zaraz wpiszesz. */
  function restyle(change: { color: string } | { flag: McFlag } | "reset") {
    const [s, e] = selectionOrEnd();
    const units = unitsRef.current;
    if (s === e) {
      const base = typingStyle(s);
      const style: McStyle =
        change === "reset" ? {} : "color" in change ? { ...base, color: change.color } : { ...base, [change.flag]: !base[change.flag] };
      pendingRef.current = { at: s, style };
      editorRef.current?.focus();
      setSelection(s, s);
      return;
    }
    const next =
      change === "reset" ? styleRange(units, s, e, "reset") : "color" in change ? styleRange(units, s, e, { color: change.color }) : toggleFlag(units, s, e, change.flag);
    commit(next, s, e);
  }

  // Zmiana tekstu z zewnątrz (inna kategoria, "Przywróć domyślny", cofnięcie) - rysujemy od nowa.
  useLayoutEffect(() => {
    if (value === valueRef.current && tokensKey === tokensKeyRef.current) return;
    tokensKeyRef.current = tokensKey;
    valueRef.current = value;
    unitsRef.current = parseUnits(value, tokens);
    historyRef.current = { past: [], future: [] };
    reportHistory();
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tokensKey]);

  // Pierwsze rysowanie i powrót z trybu kodów.
  useLayoutEffect(() => {
    if (rawMode) return;
    unitsRef.current = parseUnits(valueRef.current, propsRef.current.tokens);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMode]);

  // Wszystkie zmiany w polu idą przez model (beforeinput), a nie przez przeglądarkę -
  // dzięki temu w polu nie powstają dziwne znaczniki i zawsze wiadomo, jaki styl ma każdy znak.
  useEffect(() => {
    const root = editorRef.current;
    if (!root || rawMode) return;
    function onBeforeInput(e: InputEvent) {
      if (composingRef.current || e.inputType === "insertCompositionText") return;
      const [s, en] = selectionOrEnd();
      const units = unitsRef.current;
      switch (e.inputType) {
        case "insertText":
        case "insertReplacementText":
          e.preventDefault();
          insertText(e.data ?? e.dataTransfer?.getData("text/plain") ?? "", false);
          return;
        case "insertParagraph":
        case "insertLineBreak":
          e.preventDefault();
          propsRef.current.onEnter?.();
          return;
        case "deleteContentBackward":
          e.preventDefault();
          deleteRange(s !== en ? s : Math.max(0, s - 1), en);
          return;
        case "deleteContentForward":
          e.preventDefault();
          deleteRange(s, s !== en ? en : Math.min(units.length, s + 1));
          return;
        case "deleteWordBackward":
          e.preventDefault();
          deleteRange(s !== en ? s : wordStart(units, s), en);
          return;
        case "deleteWordForward":
          e.preventDefault();
          deleteRange(s, s !== en ? en : wordEnd(units, s));
          return;
        case "deleteSoftLineBackward":
        case "deleteHardLineBackward":
          e.preventDefault();
          deleteRange(0, en);
          return;
        case "deleteSoftLineForward":
        case "deleteHardLineForward":
          e.preventDefault();
          deleteRange(s, units.length);
          return;
        case "deleteByCut":
        case "deleteByDrag":
          e.preventDefault();
          deleteRange(s, en);
          return;
        case "insertFromDrop":
          e.preventDefault();
          insertText(e.dataTransfer?.getData("text/plain") ?? "", true);
          return;
        case "formatBold":
        case "formatItalic":
        case "formatUnderline":
        case "historyUndo":
        case "historyRedo":
          // obsłużone w onKeyDown
          e.preventDefault();
          return;
        default:
          // Czego nie znamy - przeglądarka zrobi swoje, a "input" niżej odczyta wynik z pola.
          return;
      }
    }
    function onInput() {
      if (composingRef.current) return;
      readBackFromDom();
    }
    root.addEventListener("beforeinput", onBeforeInput);
    root.addEventListener("input", onInput);
    return () => {
      root.removeEventListener("beforeinput", onBeforeInput);
      root.removeEventListener("input", onInput);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMode]);

  /** Awaryjnie: odczyt pola po zmianie zrobionej przez przeglądarkę (np. pisanie z kompozycją). */
  function readBackFromDom() {
    const root = editorRef.current;
    if (!root) return;
    const sel = getSelection();
    const units: McUnit[] = [];
    let last: McStyle = {};
    root.childNodes.forEach((k) => {
      const el = k instanceof HTMLElement ? k : null;
      const style = el ? styleOf(el) : last;
      last = style;
      if (el && isChip(el)) units.push({ token: el.dataset.token!, style });
      else units.push(...charsWithStyle(k.textContent ?? "", style));
    });
    const at = sel ? sel[1] : units.length;
    commit(units, at);
  }

  function styleOf(el: HTMLElement): McStyle {
    const i = Array.from(editorRef.current?.childNodes ?? []).indexOf(el);
    // Styl bierzemy z modelu po pozycji kawałka - prościej i pewniej niż czytać CSS z powrotem.
    const runs = groupRuns(unitsRef.current);
    return { ...(runs[i]?.style ?? {}) };
  }

  useEffect(() => {
    if (!pickerOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [pickerOpen]);

  // Przyciski nie zabierają fokusu polu - inaczej zaznaczenie znikałoby przed kliknięciem koloru.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  /** Zmiana w trybie kodów - też trafia do historii (Cofnij/Ponów). */
  function setRaw(next: string) {
    if (next === valueRef.current) return;
    remember(valueRef.current);
    valueRef.current = next;
    unitsRef.current = parseUnits(next, propsRef.current.tokens);
    onChange(next);
    reportHistory();
  }

  function rawInsert(code: string) {
    const input = rawRef.current;
    const v = valueRef.current;
    if (!input) {
      setRaw(v + code);
      return;
    }
    const start = input.selectionStart ?? v.length;
    const end = input.selectionEnd ?? v.length;
    setRaw(v.slice(0, start) + code + v.slice(end));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + code.length, start + code.length);
    });
  }

  function pickColor(code: string, hex: string) {
    if (rawMode) rawInsert(`&${code}`);
    else restyle({ color: hex });
  }

  function pickFlag(flag: McFlag, code: string) {
    if (rawMode) rawInsert(`&${code}`);
    else restyle({ flag });
  }

  function pickReset() {
    if (rawMode) rawInsert("&r");
    else restyle("reset");
  }

  function pickInsert(code: string) {
    if (rawMode) {
      rawInsert(code);
      return;
    }
    const [s] = selectionOrEnd();
    editorRef.current?.focus();
    insertUnits([{ token: code, style: typingStyle(s) }]);
  }

  return (
    <div className="mc-text-input" ref={wrapperRef}>
      <div className="mc-text-row">
        {/* Mały kwadrat przed polem tekstowym zamiast stałego panelu obok - klik otwiera
            popover z kolorami/stylem dokładnie tam, gdzie się pisze. */}
        <button type="button" className="mc-swatch-trigger" title="Kolor i styl tekstu" onMouseDown={keepFocus} onClick={() => setPickerOpen((o) => !o)} />
        {rawMode ? (
          <input
            ref={rawRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter?.();
              }
            }}
          />
        ) : (
          <div
            ref={editorRef}
            className="mc-rich"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline={false}
            spellCheck={false}
            data-placeholder={placeholder ?? ""}
            // W <label> klik w pole "przeklikałby się" na pierwszy przycisk w środku - blokujemy to.
            onClick={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              const mod = e.ctrlKey || e.metaKey;
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter?.();
              } else if (mod && e.key.toLowerCase() === "z") {
                e.preventDefault();
                undo(e.shiftKey);
              } else if (mod && e.key.toLowerCase() === "y") {
                e.preventDefault();
                undo(true);
              } else if (mod && ["b", "i", "u"].includes(e.key.toLowerCase())) {
                e.preventDefault();
                restyle({ flag: ({ b: "bold", i: "italic", u: "underline" } as const)[e.key.toLowerCase() as "b" | "i" | "u"] });
              }
            }}
            onCompositionStart={() => (composingRef.current = true)}
            onCompositionEnd={() => {
              composingRef.current = false;
              readBackFromDom();
            }}
            onCopy={(e) => {
              const [s, en] = selectionOrEnd();
              if (s === en) return;
              e.preventDefault();
              // Do schowka idą kody & - wklejone w inne pole zachowa kolory.
              e.clipboardData.setData("text/plain", serializeUnits(unitsRef.current.slice(s, en)));
            }}
            onCut={(e) => {
              const [s, en] = selectionOrEnd();
              if (s === en) return;
              e.preventDefault();
              e.clipboardData.setData("text/plain", serializeUnits(unitsRef.current.slice(s, en)));
              deleteRange(s, en);
            }}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData("text/plain");
              // Wklejony tekst z kodami & (np. z configu) od razu dostaje kolory.
              insertText(text, /&([0-9a-fk-or]|#[0-9a-f]{6})/i.test(text));
            }}
            onDrop={(e) => e.preventDefault()}
          />
        )}
        <button
          type="button"
          className={`mc-raw-toggle${rawMode ? " active" : ""}`}
          title={rawMode ? "Wróć do zwykłego pola z kolorami" : "Pokaż kody kolorów (&) - dla zaawansowanych"}
          onMouseDown={keepFocus}
          onClick={() => setRawMode((m) => !m)}
        >
          &amp;
        </button>
      </div>

      {inserts && inserts.length > 0 && (
        <div className="mc-inserts">
          {inserts.map((ins) => (
            <button key={ins.code} type="button" title={`Wstawia ${ins.code} - sklep podmieni to w chwili ogłoszenia`} onMouseDown={keepFocus} onClick={() => pickInsert(ins.code)}>
              + {ins.label}
            </button>
          ))}
        </div>
      )}

      {rawMode && !hidePreview && (
        <div className="mc-preview">
          <MinecraftTextPreview text={value} />
        </div>
      )}

      {pickerOpen && (
        <div className="mc-color-popover" onMouseDown={keepFocus}>
          {!rawMode && <div className="mc-toolbar-hint">Zaznacz tekst myszką i kliknij kolor. Bez zaznaczenia kolor działa na to, co zaraz napiszesz.</div>}
          <div className="mc-toolbar-group">
            <span className="mc-toolbar-label">Kolor</span>
            <div className="mc-color-grid">
              {MC_COLORS.map(([code, hex]) => (
                <button
                  key={code}
                  type="button"
                  title={`${COLOR_NAMES_PL[code] ?? code} (&${code})`}
                  className="mc-swatch"
                  style={{ background: hex }}
                  onClick={() => pickColor(code, hex)}
                />
              ))}
            </div>
          </div>

          <div className="mc-toolbar-group">
            <span className="mc-toolbar-label">Styl</span>
            <div className="mc-toolbar">
              <button type="button" className="mc-style-btn" title="Pogrubienie (Ctrl+B)" onClick={() => pickFlag("bold", "l")}>
                <b>B</b>
              </button>
              <button type="button" className="mc-style-btn" title="Kursywa (Ctrl+I)" onClick={() => pickFlag("italic", "o")}>
                <i>I</i>
              </button>
              <button type="button" className="mc-style-btn" title="Podkreślenie (Ctrl+U)" onClick={() => pickFlag("underline", "n")}>
                <u>U</u>
              </button>
              <button type="button" className="mc-style-btn" title="Przekreślenie" onClick={() => pickFlag("strikethrough", "m")}>
                <s>S</s>
              </button>
              {/* Sam przycisk faktycznie miga losowymi znakami (patrz ObfuscatedText.tsx),
                  żeby było widać, co robi &k, zamiast zgadywać po samym "?#?". */}
              <button type="button" className="mc-style-btn mc-style-btn-wide" title="Zaszyfrowany (losowe znaki w grze)" onClick={() => pickFlag("obfuscated", "k")}>
                <ObfuscatedText text="Abc" />
              </button>
              <button type="button" className="mc-style-btn mc-style-btn-wide" title="Zwykły tekst - bez koloru i stylu" onClick={pickReset}>
                Zwykły
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
