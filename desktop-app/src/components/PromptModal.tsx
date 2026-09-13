import { useEffect, useRef, useState } from "react";

interface PromptRequest {
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
}

// Prosty moduł-singleton zamiast Contextu - showPrompt() jest wołane z dziesiątek
// miejsc (presety, komendy itd.) w komponentach, które i tak nie są potomkami jednego
// wspólnego providera w oczywisty sposób, więc zwykła funkcja importowana wprost jest
// wygodniejsza niż przeciąganie hooka wszędzie. Host montowany raz w App.tsx.
let setRequest: ((req: PromptRequest | null) => void) | null = null;

/** Zamiennik window.prompt() - to samo API (tekst + wartość domyślna, null przy Anuluj),
    ale w stylu appki zamiast natywnego okienka przeglądarki/webview (które wygląda jak
    coś obcego, "spoza aplikacji"). Zwraca Promise, więc wołający musi być async. */
export function showPrompt(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    if (!setRequest) {
      resolve(null);
      return;
    }
    setRequest({ message, defaultValue, resolve });
  });
}

export default function PromptHost() {
  const [request, setRequestState] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRequest = setRequestState;
    return () => {
      setRequest = null;
    };
  }, []);

  useEffect(() => {
    if (request) {
      setValue(request.defaultValue);
      // Focus po renderze modala, tak jak natywny prompt() od razu ustawia kursor w polu.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [request]);

  if (!request) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    request!.resolve(value);
    setRequestState(null);
  }

  function cancel() {
    request!.resolve(null);
    setRequestState(null);
  }

  return (
    <div className="modal-overlay" onClick={cancel}>
      <form className="modal card form" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <p style={{ marginTop: 0 }}>{request.message}</p>
        <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" onClick={cancel}>
            Anuluj
          </button>
          <button type="submit">OK</button>
        </div>
      </form>
    </div>
  );
}
