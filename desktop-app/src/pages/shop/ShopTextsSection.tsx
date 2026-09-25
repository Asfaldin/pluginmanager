import { Redo2, Search, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";
import { ConfirmButton, Fold, HelpButton } from "../../components/EditorBits";
import MinecraftTextInput, { type MinecraftTextHandle } from "../../components/MinecraftTextInput";
import SamplePreview from "../../components/SamplePreview";
import {
  defaultAnnounceTexts,
  PLACEHOLDER_LABELS,
  SAMPLE_VALUES,
  sameTexts,
  TEXT_FIELDS,
  TEXT_GROUPS,
  type AnnounceTexts,
  type TextField,
} from "../../lib/shopAnnounce";
import { plural } from "../../lib/plText";

interface Props {
  texts: AnnounceTexts;
  setTexts: (patch: AnnounceTexts) => void;
  language: string;
  currency: string;
  /** Który tekst ma być od razu otwarty (np. po „Zmień tekst” przy rotacji). */
  focusKey?: string | null;
  onHelp: () => void;
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

/** Ustawienia → „Teksty w grze”: wszystkie teksty Sklepu w grupach, z wyszukiwarką i podglądem. */
export default function ShopTextsSection({ texts, setTexts, language, currency, focusKey, onHelp }: Props) {
  const [editing, setEditing] = useState<string | null>(focusKey ?? null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<MinecraftTextHandle>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const defaults = defaultAnnounceTexts(language);
  const values = { ...SAMPLE_VALUES, currency };
  const q = norm(query.trim());
  const matches = (f: TextField) => !q || norm(f.label).includes(q) || norm(texts[f.key] ?? "").includes(q);

  function editor(f: TextField) {
    const value = texts[f.key] ?? "";
    const isDefault = value === defaults[f.key];
    const inserts = f.placeholders.map((ph) => ({ code: `{${ph}}`, label: PLACEHOLDER_LABELS[ph] ?? ph }));
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

  const found = TEXT_FIELDS.filter(matches).length;
  return (
    <>
      <h2>Teksty w grze</h2>
      <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        <span className="muted small">
          Wszystko, co sklep pisze graczom. Kliknij linijkę, żeby ją zmienić. <span className="ci-sample">Podkreślone przerywaną linią</span> to
          przykłady - w grze w ich miejscu pojawi się prawdziwa nazwa, cena itd.
        </span>
        <HelpButton id="shop-texts-v5" title="Jak działają teksty" onClick={onHelp} />
        <ConfirmButton
          title="Wszystkie teksty sklepu wracają do tych z pluginu"
          disabled={sameTexts(texts, defaults)}
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
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj tekstu, np. „nie stać” albo „tabliczka”" />
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
      {TEXT_GROUPS.map(([group, title, sub]) => {
        const fields = TEXT_FIELDS.filter((f) => f.group === group && matches(f));
        if (!fields.length) return null;
        const changed = fields.filter((f) => texts[f.key] !== defaults[f.key]).length;
        const open = Boolean(q) || fields.some((f) => f.key === editing);
        return (
          <Fold key={group} title={`${title} (${fields.length})${changed ? ` - zmienione: ${changed}` : ""}`} open={open}>
            <p className="muted small" style={{ marginTop: 0 }}>
              {sub}
            </p>
            {fields.map((f) => (
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
                      <SamplePreview text={line} values={values} labels={PLACEHOLDER_LABELS} emptyLabel="(pusta linijka - nic się nie wyświetli)" />
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
