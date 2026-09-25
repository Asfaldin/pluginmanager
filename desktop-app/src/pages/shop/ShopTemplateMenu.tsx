import { Bookmark, Check, ChevronDown, FileDown, FileUp, LayoutTemplate, Package, Sparkles, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ShopTemplateId } from "../../lib/shopTemplates";
import { plural } from "../../lib/plText";

export interface UserTemplateEntry {
  id: string;
  name: string;
  savedAt: number;
  categories: number;
}

interface Props {
  /** Co jest teraz w edytorze 1:1: id gotowego szablonu albo "user:<id>"; null = sklep zmieniony, własny. */
  current: string | null;
  labels: Record<ShopTemplateId, string>;
  userTemplates: UserTemplateEntry[];
  disabled?: boolean;
  /** Gotowy szablon, "user:<id>", "file" albo "save". */
  onPick: (id: string) => void;
  onRemoveUser: (id: string) => void;
}

const DESC: Record<ShopTemplateId, string> = {
  big: "10 kategorii, rotacja, spawnery - ten sam sklep dostaje nowy serwer",
  small: "4 kategorie po 8 przedmiotów, okrągłe ceny - łatwy do przerobienia",
  empty: "bez kategorii - budujesz wszystko sam",
};

const ICON: Record<ShopTemplateId, ReactNode> = {
  big: <Sparkles size={16} strokeWidth={1.75} />,
  small: <Package size={16} strokeWidth={1.75} />,
  empty: <Square size={16} strokeWidth={1.75} />,
};

function dateText(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Wybór szablonu Sklepu: gotowe szablony, Twoje szablony, wgranie z pliku i zapis obecnego sklepu jako szablon. */
export default function ShopTemplateMenu({ current, labels, userTemplates, disabled, onPick, onRemoveUser }: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    setOpen(false);
    onPick(id);
  };
  const ids = Object.keys(labels) as ShopTemplateId[];
  const currentName = current?.startsWith("user:")
    ? userTemplates.find((t) => `user:${t.id}` === current)?.name
    : current
      ? labels[current as ShopTemplateId]
      : null;

  return (
    <div className="tpl-menu" ref={boxRef}>
      <button type="button" className={`tpl-menu-button${open ? " open" : ""}`} disabled={disabled} onClick={() => setOpen(!open)}>
        <LayoutTemplate size={16} strokeWidth={1.75} />
        <span>
          Szablon: <b>{currentName ?? "własny"}</b>
        </span>
        <ChevronDown size={15} strokeWidth={2} className="tpl-menu-chevron" />
      </button>
      {open && (
        <div className="tpl-menu-panel">
          <div className="tpl-menu-title">Gotowe szablony</div>
          {ids.map((id) => (
            <button key={id} type="button" className={`tpl-menu-item${current === id ? " current" : ""}`} onClick={() => pick(id)}>
              <span className="tpl-menu-icon">{ICON[id]}</span>
              <span className="tpl-menu-text">
                <span className="tpl-menu-label">{labels[id]}</span>
                <span className="tpl-menu-desc">{DESC[id]}</span>
              </span>
              {current === id && <Check size={16} strokeWidth={2.25} className="tpl-menu-check" />}
            </button>
          ))}

          {userTemplates.length > 0 && (
            <>
              <div className="tpl-menu-sep" />
              <div className="tpl-menu-title">Twoje szablony</div>
              <div className="tpl-menu-scroll">
                {userTemplates.map((t) => {
                  const key = `user:${t.id}`;
                  return (
                    <div key={t.id} className={`tpl-menu-item${current === key ? " current" : ""}`} role="button" tabIndex={0} onClick={() => pick(key)}>
                      <span className="tpl-menu-icon">
                        <Bookmark size={16} strokeWidth={1.75} />
                      </span>
                      <span className="tpl-menu-text">
                        <span className="tpl-menu-label">{t.name}</span>
                        <span className="tpl-menu-desc">
                          {dateText(t.savedAt)} · {t.categories} {plural(t.categories, "kategoria", "kategorie", "kategorii")}
                        </span>
                      </span>
                      {current === key && <Check size={16} strokeWidth={2.25} className="tpl-menu-check" />}
                      <button
                        type="button"
                        className="ci-trash"
                        title="Usuń z listy (plik na Pulpicie zostaje)"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveUser(t.id);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="tpl-menu-sep" />
          <div className="tpl-menu-title">Plik</div>
          <button type="button" className="tpl-menu-item" onClick={() => pick("file")}>
            <span className="tpl-menu-icon">
              <FileUp size={16} strokeWidth={1.75} />
            </span>
            <span className="tpl-menu-text">
              <span className="tpl-menu-label">Wgraj szablon z pliku</span>
              <span className="tpl-menu-desc">sklep zapisany wcześniej - trafi też na listę „Twoje szablony”</span>
            </span>
          </button>
          <button type="button" className="tpl-menu-item" onClick={() => pick("save")}>
            <span className="tpl-menu-icon">
              <FileDown size={16} strokeWidth={1.75} />
            </span>
            <span className="tpl-menu-text">
              <span className="tpl-menu-label">Zapisz obecny sklep jako szablon</span>
              <span className="tpl-menu-desc">na listę „Twoje szablony” i jako plik na Pulpicie (kopia, inny serwer)</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
