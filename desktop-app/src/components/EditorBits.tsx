import { BookOpen, CircleAlert, HelpCircle, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import MinecraftTextInput from "./MinecraftTextInput";

// Wspólne kawałki edytorów (Skrzynki, Questy): zwijane sekcje, komendy do skopiowania, edytor linijek opisu.

export function LoreEditor({
  value,
  onChange,
  placeholder = "&7Linijka opisu",
}: {
  value: string[];
  onChange: (l: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      {value.map((line, i) => (
        <div key={i} className="mc-message-row">
          <MinecraftTextInput value={line} onChange={(v) => onChange(value.map((l, li) => (li === i ? v : l)))} placeholder={placeholder} />
          <button type="button" onClick={() => onChange(value.filter((_, li) => li !== i))}>
            Usuń
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, ""])}>
        + Dodaj linijkę
      </button>
    </div>
  );
}

/** Jedna komenda z opisem i przyciskiem „Kopiuj” (do schowka, do wklejenia w grze/konsoli). */
export function CopyRow({ cmd, what }: { cmd: string; what: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ci-protip-row">
      <code>{cmd}</code>
      <span className="muted small">{what}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(cmd)
            .then(() => {
              setCopied(true);
              // Po chwili wraca do „Kopiuj”, żeby dało się skopiować jeszcze raz.
              setTimeout(() => setCopied(false), 500);
            })
            .catch(() => {});
        }}
      >
        {copied ? "Skopiowano" : "Kopiuj"}
      </button>
    </div>
  );
}

/** Ramka „Przydatne komendy”. */
export function CommandTip({ commands }: { commands: { cmd: string; what: string }[] }) {
  return (
    <div className="ci-protip">
      <div className="ci-protip-title">Przydatne komendy</div>
      {commands.map(({ cmd, what }) => (
        <CopyRow key={cmd} cmd={cmd} what={what} />
      ))}
    </div>
  );
}

/** Sekcja zwijana strzałką - żeby prawy panel nie pokazywał wszystkiego naraz. */
export function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="ci-fold" open={open}>
      <summary>
        <span className="ci-fold-title">{title}</span>
      </summary>
      <div className="ci-fold-body">{children}</div>
    </details>
  );
}

/** Pasek z komunikatem (np. "Wysłano na serwer") i krzyżykiem do schowania go.
    `tone="error"` przełącza na czerwony wariant - ten sam komponent zamiast osobnego,
    niedomykalnego `<p className="error">` używanego dotąd w Sklepie/Koncie/Serwerach. */
export function StatusBar({ text, onClose, tone = "status" }: { text: string; onClose: () => void; tone?: "status" | "error" }) {
  return (
    <p className={tone === "error" ? "status status-error" : "status"}>
      <span>{text}</span>
      <button type="button" className="ci-trash" title="Schowaj komunikat" onClick={onClose}>
        <X size={14} />
      </button>
    </p>
  );
}

/** Nagłówek listy, który ją zwija i rozwija (strzałka jak w Questach). */
export function ListToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: ReactNode }) {
  return (
    <button type="button" className="ci-group list-toggle" title={open ? "Zwiń listę" : "Rozwiń listę"} onClick={onToggle}>
      <span className="quest-list-arrow">{open ? "▾" : "▸"}</span> {label}
    </button>
  );
}

// Które "?" i "!" użytkownik już otworzył - zapamiętane na tym komputerze (localStorage),
// żeby nowe podpowiedzi świeciły się tylko do pierwszego kliknięcia.
const HELP_SEEN_KEY = "pm-help-seen";

function readHelpSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HELP_SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Przycisk podpowiedzi: `kind="help"` to "?" (jak to działa), `kind="info"` to "!" (ważna informacja).
    Dopóki nie był otwarty, świeci się (? na żółto, ! na czerwono); po pierwszym kliknięciu już zawsze normalny.
    `id` musi być unikalne w całej aplikacji - po nim pamiętamy, że był otwarty. */
export function HelpButton({
  id,
  title,
  onClick,
  kind = "help",
  label,
}: {
  id: string;
  title: string;
  onClick: () => void;
  kind?: "help" | "info";
  /** Z napisem = główny przewodnik po stronie (np. "Jak działa sklep"): większy, z ikonką książki. */
  label?: string;
}) {
  const [seen, setSeen] = useState(() => readHelpSeen().has(id));
  const Icon = label ? BookOpen : kind === "info" ? CircleAlert : HelpCircle;
  return (
    <button
      type="button"
      className={`ci-help-btn ci-help-${kind}${label ? " ci-help-guide" : ""}${seen ? "" : " ci-help-new"}`}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.preventDefault();
        if (!seen) {
          const all = readHelpSeen();
          all.add(id);
          try {
            localStorage.setItem(HELP_SEEN_KEY, JSON.stringify([...all]));
          } catch {
            // brak localStorage - trudno, po prostu będzie świecić dalej
          }
          setSeen(true);
        }
        onClick();
      }}
    >
      <Icon size={16} strokeWidth={1.75} />
      {label && <span>{label}</span>}
    </button>
  );
}

/** Przycisk, który działa dopiero po DRUGIM kliknięciu - na rzeczy typu "Przywróć domyślne", które
    kasują czyjąś pracę. Pierwszy klik zmienia go na czerwone "Na pewno? Kliknij jeszcze raz";
    po kilku sekundach albo po kliknięciu gdzie indziej wraca do zwykłego wyglądu. */
export function ConfirmButton({
  children,
  onConfirm,
  confirmText = "Na pewno? Kliknij jeszcze raz",
  disabled,
  title,
}: {
  children: ReactNode;
  onConfirm: () => void;
  confirmText?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? "ci-danger" : undefined}
      disabled={disabled}
      title={title}
      onBlur={() => setArmed(false)}
      onClick={(e) => {
        e.preventDefault();
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmText : children}
    </button>
  );
}
