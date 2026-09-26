import { BookmarkPlus, Check, ChevronDown, Download, FileUp, LayoutTemplate, Pencil, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export interface UserTemplateEntry {
  id: string;
  name: string;
  savedAt: number;
  /** Krótko, co w nim jest (np. „4 kategorie”). */
  detail: string;
}

export interface TemplateChoice {
  id: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

interface Props {
  /** Co jest teraz w edytorze 1:1: id gotowego szablonu albo "user:<id>"; null = zmieniony, własny. */
  current: string | null;
  choices: TemplateChoice[];
  /** Co zapisuje szablon, w bierniku: „sklep”, „Targ”. */
  what: string;
  /** Tytuł okna, np. „Szablony sklepu”. */
  title: string;
  userTemplates: UserTemplateEntry[];
  disabled?: boolean;
  /** Gotowy szablon, "user:<id>", "file" albo "save". */
  onPick: (id: string) => void;
  onRemoveUser: (id: string) => void;
  /** „Pobierz” przy szablonie z listy - zapisuje go jako plik tam, gdzie wybierzesz. */
  onExportUser?: (id: string) => void;
  onRenameUser?: (id: string) => void;
  /** Mały przycisk obok menu: zapisuje obecny stan jako szablon od razu, bez pytania o nazwę. */
  onQuickSave?: () => void;
  /** Są zmiany, których nie ma na serwerze - przy „własnym” pokazujemy ostrzeżenie, że znikną po wyjściu. */
  unsent?: boolean;
}

function dateText(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Szablony (Sklep, Targ...): przycisk „Szablon: ...” otwiera okno z kartami - gotowe szablony i Twoje
 * (wczytaj, pobierz jako plik, zmień nazwę, usuń), na górze zapis obecnego stanu i wgranie z pliku.
 */
export default function TemplateMenu({
  current,
  choices,
  what,
  title,
  userTemplates,
  disabled,
  onPick,
  onRemoveUser,
  onExportUser,
  onRenameUser,
  onQuickSave,
  unsent,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Akcja zamyka okno - pytania „na pewno?” i okienka plików pokazują się już nad stroną.
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const currentName = current?.startsWith("user:")
    ? userTemplates.find((t) => `user:${t.id}` === current)?.name
    : choices.find((c) => c.id === current)?.label;

  function card(key: string, icon: ReactNode, name: string, desc: string, actions?: ReactNode) {
    const active = current === key;
    return (
      <div key={key} className={`tpl-card${active ? " current" : ""}`}>
        <div className="tpl-card-head">
          <span className="tpl-menu-icon">{icon}</span>
          <span className="tpl-card-name">{name}</span>
          {active && (
            <span className="tpl-card-now">
              <Check size={13} strokeWidth={2.5} /> teraz
            </span>
          )}
        </div>
        <div className="tpl-card-desc">{desc}</div>
        <div className="tpl-card-actions">
          <button type="button" className={active ? undefined : "ci-publish"} disabled={active} onClick={() => run(() => onPick(key))}>
            Wczytaj
          </button>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="tpl-menu-wrap">
      <button type="button" className="tpl-menu-button" disabled={disabled} onClick={() => setOpen(true)}>
        <LayoutTemplate size={16} strokeWidth={1.75} />
        <span>
          Szablon: <b>{currentName ?? "własny"}</b>
        </span>
        <ChevronDown size={15} strokeWidth={2} className="tpl-menu-chevron" />
      </button>
      {onQuickSave && (
        <button
          type="button"
          className="tpl-quick-save"
          title="Zapisz obecne ustawienia jako szablon (od razu, z datą w nazwie)"
          disabled={disabled}
          onClick={onQuickSave}
        >
          <BookmarkPlus size={16} strokeWidth={1.75} />
        </button>
      )}
      {onQuickSave && unsent && current === null && (
        <span className="tpl-unsent">
          <TriangleAlert size={16} strokeWidth={2} className="tpl-unsent-icon" />
          <span className="tpl-unsent-text">
            <b>Zmiany znikną po wyjściu ze strony</b>
            <span>zapisz szablon przyciskiem obok albo wyślij na serwer</span>
          </span>
        </span>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal modal-wide card tpl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center", margin: 0 }}>
              <h2 style={{ margin: 0, flex: 1 }}>{title}</h2>
              <button type="button" className="ci-trash" title="Zamknij" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="row tpl-modal-top">
              <button type="button" className="ci-publish" onClick={() => run(() => onPick("save"))}>
                <BookmarkPlus size={15} strokeWidth={1.75} /> Zapisz obecny {what} jako nowy
              </button>
              <button type="button" onClick={() => run(() => onPick("file"))}>
                <FileUp size={15} strokeWidth={1.75} /> Wgraj z pliku
              </button>
            </div>
            <p className="muted small" style={{ margin: "0 0 0.8rem" }}>
              Wczytanie szablonu zmienia tylko to, co widzisz w aplikacji - na serwer trafi dopiero po „Wyślij na serwer”.
            </p>

            <div className="tpl-section-title">Gotowe</div>
            <div className="tpl-cards">{choices.map((c) => card(c.id, c.icon, c.label, c.desc))}</div>

            <div className="tpl-section-title">Twoje</div>
            {userTemplates.length === 0 ? (
              <p className="muted small">
                Nie masz jeszcze swoich szablonów. Zapisz obecny {what} przyciskiem u góry albo wgraj szablon z pliku.
              </p>
            ) : (
              <div className="tpl-cards">
                {userTemplates.map((t) =>
                  card(
                    `user:${t.id}`,
                    <LayoutTemplate size={16} strokeWidth={1.75} />,
                    t.name,
                    `${dateText(t.savedAt)}${t.detail ? ` · ${t.detail}` : ""}`,
                    <>
                      {onExportUser && (
                        <button type="button" className="ci-trash" title="Pobierz jako plik (kopia, inny serwer, wysłanie komuś)" onClick={() => run(() => onExportUser(t.id))}>
                          <Download size={15} />
                        </button>
                      )}
                      {onRenameUser && (
                        <button type="button" className="ci-trash" title="Zmień nazwę" onClick={() => run(() => onRenameUser(t.id))}>
                          <Pencil size={15} />
                        </button>
                      )}
                      <button type="button" className="ci-trash" title="Usuń szablon" onClick={() => run(() => onRemoveUser(t.id))}>
                        <Trash2 size={15} />
                      </button>
                    </>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
