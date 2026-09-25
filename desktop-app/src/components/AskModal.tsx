import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AskOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
  okLabel?: string;
  cancelLabel?: string;
  /** Czerwony przycisk potwierdzenia. Domyślnie sam się włącza, gdy pytanie jest o usuwanie. */
  danger?: boolean;
}

interface AskRequest extends AskOptions {
  message: string;
  resolve: (ok: boolean) => void;
}

// Moduł-singleton jak w PromptModal.tsx - ask() woła się z wielu stron, host montowany raz w App.tsx.
let setRequest: ((req: AskRequest | null) => void) | null = null;

/** Zamiennik ask() z @tauri-apps/plugin-dialog - to samo API (true = Tak), ale okienko w stylu
    appki zamiast systemowego okna Windowsa, które wyglądało jak coś spoza aplikacji. */
export function ask(message: string, options: AskOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setRequest) {
      resolve(false);
      return;
    }
    setRequest({ ...options, message, resolve });
  });
}

export default function AskHost() {
  const [request, setRequestState] = useState<AskRequest | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setRequest = setRequestState;
    return () => {
      setRequest = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    setTimeout(() => okRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  if (!request) return null;

  function answer(ok: boolean) {
    request?.resolve(ok);
    setRequestState(null);
  }

  const danger = request.danger ?? /usun|usuń/i.test(`${request.title ?? ""} ${request.message}`);
  const warn = request.kind === "warning" || request.kind === "error";
  return (
    <div className="modal-overlay" onClick={() => answer(false)}>
      <div className="modal card ask-modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ask-modal-head">
          {warn && <TriangleAlert size={20} className={danger ? "ask-modal-icon danger" : "ask-modal-icon"} />}
          <h2>{request.title ?? "Na pewno?"}</h2>
        </div>
        <p className="ask-modal-text">{request.message}</p>
        <div className="row ask-modal-buttons">
          <button type="button" onClick={() => answer(false)}>
            {request.cancelLabel ?? "Anuluj"}
          </button>
          <button ref={okRef} type="button" className={danger ? "ci-danger" : "ci-publish"} onClick={() => answer(true)}>
            {request.okLabel ?? "Tak"}
          </button>
        </div>
      </div>
    </div>
  );
}
