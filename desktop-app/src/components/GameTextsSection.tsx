import { Redo2, Search, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";
import { ConfirmButton, Fold, HelpButton } from "./EditorBits";
import MinecraftTextInput, { type MinecraftTextHandle } from "./MinecraftTextInput";
import SamplePreview from "./SamplePreview";
import type { GameTexts, TextField } from "../lib/langTexts";
import { plural } from "../lib/plText";

interface Props {
  texts: GameTexts;
  setTexts: (patch: GameTexts) => void;
  /** Wszystkie teksty pluginu (lib/langTexts createTextSet). */
  fields: TextField[];
  /** Grupy w kolejności: [id, tytuł, opis]. */
  groups: Array<[string, string, string]>;
  /** Domyślne teksty w języku serwera (do „Przywróć domyślny” i plakietki „zmieniony”). */
  defaults: GameTexts;
  placeholderLabels: Record<string, string>;
  /** Przykładowe wartości wstawek do podglądu (znaczek waluty dokłada się sam). */
  sampleValues: Record<string, string>;
  currency: string;
  /** Który tekst ma być od razu otwarty. */
  focusKey?: string | null;
  /** Id pytajnika (świeci osobno dla każdego pluginu). */
  helpId: string;
  onHelp: () => void;
  /** Kto pisze teksty, np. „sklep”, „Targ”. */
  who?: string;
  /** Przykład w wyszukiwarce. */
  searchHint?: string;
}

/** Bez polskich znaków i wielkości liter - "nie stac" znajdzie "Nie stać Cię". */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/&[0-9a-fk-or]/g, "");
}

/** Ustawienia → „Teksty w grze”: wszystkie teksty pluginu w grupach, z wyszukiwarką i podglądem. Wspólne dla każdego pluginu. */
export default function GameTextsSection({ texts, setTexts, fields, groups, defaults, placeholderLabels, sampleValues, currency, focusKey, helpId, onHelp, who = "sklep", searchHint = "np. „nie stać” albo „tabliczka”" }: Props) {
  const [editing, setEditing] = useState<string | null>(focusKey ?? null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<MinecraftTextHandle>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const values = { ...sampleValues, currency };
  const q = norm(query.trim());
  const matches = (f: TextField) => !q || norm(f.label).includes(q) || norm(texts[f.key] ?? "").includes(q);

  function editor(f: TextField) {
    const value = texts[f.key] ?? "";
    const isDefault = value === defaults[f.key];
    const inserts = f.placeholders.map((ph) => ({ code: `{${ph}}`, label: placeholderLabels[ph] ?? ph }));
    const lines = value.split("\n");
    return (
      <div className="ci-chat-edit">
        <div className="row" style={{ alignItems: "center", margin: 0, gap: "0.4rem" }}>
          <b style={{ marginRight: "0.4rem" }}>{f.label}</b>
          {!f.list && (
            <>
              <button type="button" title="Cofnij (Ctrl+Z)" disabled={!history.canUndo} onClick={() => inputRef.current?.undo()}>
                <Undo2 size={14} strokeWidth={1.75} /> Cofnij
              </button>
              <button type="button" title="Ponów (Ctrl+Y)" disabled={!history.canRedo} onClick={() => inputRef.current?.redo()}>
                <Redo2 size={14} strokeWidth={1.75} /> Ponów
              </button>
            </>
          )}
          <button
            type="button"
            disabled={isDefault}
            onClick={() => (f.list ? setTexts({ [f.key]: defaults[f.key] }) : inputRef.current?.replaceAll(defaults[f.key]))}
          >
            Przywróć domyślny
          </button>
          <button type="button" onClick={() => setEditing(null)}>
            Gotowe
          </button>
        </div>
        {f.list ? (
          <>
            {lines.map((line, i) => (
              <div key={i} className="row" style={{ alignItems: "flex-start", gap: "0.3rem", margin: "0.25rem 0", flexWrap: "nowrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MinecraftTextInput
                    value={line}
                    onChange={(v) => setTexts({ [f.key]: lines.map((l, j) => (j === i ? v : l)).join("\n") })}
                    hidePreview
                    inserts={inserts}
                  />
                </div>
                <button
                  type="button"
                  className="ci-trash"
                  title="Usuń tę linijkę"
                  disabled={lines.length === 1}
                  onClick={() => setTexts({ [f.key]: lines.filter((_, j) => j !== i).join("\n") })}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setTexts({ [f.key]: `${value}\n` })}>
              + Linijka
            </button>
          </>
        ) : (
          <MinecraftTextInput
            ref={inputRef}
            onHistoryChange={setHistory}
            value={value}
            onChange={(v) => setTexts({ [f.key]: v })}
            onEnter={() => setEditing(null)}
            hidePreview
            inserts={inserts}
          />
        )}
      </div>
    );
  }

  const found = fields.filter(matches).length;
  return (
    <>
      <h2>Teksty w grze</h2>
      <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        <span className="muted small">
          Wszystko, co {who} pisze graczom. Kliknij linijkę, żeby ją zmienić. <span className="ci-sample">Podkreślone przerywaną linią</span> to
          przykłady - w grze w ich miejscu pojawi się prawdziwa nazwa, cena itd.
        </span>
        <HelpButton id={helpId} title="Jak działają teksty" onClick={onHelp} />
        <ConfirmButton
          title="Wszystkie teksty wracają do tych z pluginu"
          disabled={fields.every((f) => texts[f.key] === defaults[f.key])}
          onConfirm={() => {
            setEditing(null);
            setTexts(defaults);
          }}
        >
          <Undo2 size={14} strokeWidth={1.75} /> Przywróć wszystkie domyślne
        </ConfirmButton>
      </div>
      <label className="ci-text-search">
        <Search size={15} strokeWidth={1.75} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Szukaj tekstu, ${searchHint}`} />
        {query && (
          <button type="button" className="ci-trash" title="Wyczyść" onClick={() => setQuery("")}>
            <X size={14} />
          </button>
        )}
      </label>
      {q && (
        <p className="muted small" style={{ margin: "0.2rem 0 0.5rem" }}>
          {found ? `Znaleziono ${found} ${plural(found, "tekst", "teksty", "tekstów")}.` : "Nic nie pasuje - spróbuj innego słowa."}
        </p>
      )}
      {groups.map(([group, title, sub]) => {
        const inGroup = fields.filter((f) => f.group === group && matches(f));
        if (!inGroup.length) return null;
        const changed = inGroup.filter((f) => texts[f.key] !== defaults[f.key]).length;
        const open = Boolean(q) || inGroup.some((f) => f.key === editing);
        return (
          <Fold key={group} title={`${title} (${inGroup.length})${changed ? ` - zmienione: ${changed}` : ""}`} open={open}>
            <p className="muted small" style={{ marginTop: 0 }}>
              {sub}
            </p>
            {inGroup.map((f) => (
              <div key={f.key} className="ci-text-row">
                <div className="ci-text-label small">
                  {f.label}
                  {texts[f.key] !== defaults[f.key] && <span className="ci-badge">zmieniony</span>}
                </div>
                <button
                  type="button"
                  className={`mc-preview ci-chat-lines ci-text-preview${editing === f.key ? " active" : ""}`}
                  title="Kliknij, żeby zmienić"
                  onClick={() => setEditing(editing === f.key ? null : f.key)}
                >
                  {(texts[f.key] ?? "").split("\n").map((line, i) => (
                    <div key={i}>
                      <SamplePreview text={line} values={values} labels={placeholderLabels} emptyLabel="(pusta linijka - nic się nie wyświetli)" />
                    </div>
                  ))}
                </button>
                {editing === f.key && editor(f)}
              </div>
            ))}
          </Fold>
        );
      })}
    </>
  );
}
