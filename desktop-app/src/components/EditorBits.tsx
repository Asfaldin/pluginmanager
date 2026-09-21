import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
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
