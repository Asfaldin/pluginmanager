import { MessageSquare } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBar } from "../components/EditorBits";
import { shopCreateTicket, shopMyTickets, shopTicketMeta } from "../lib/api";
import type { TicketMeta, TicketRecord } from "../lib/types";
import { useAuth } from "../state/AuthContext";
import { useProfiles } from "../state/ProfilesContext";

const MESSAGE_FROM_LABELS: Record<"customer" | "admin", string> = {
  customer: "Ty",
  admin: "Wsparcie",
};

const STATUS_LABELS: Record<TicketRecord["status"], string> = {
  open: "Otwarte",
  answered: "Odpowiedziano",
  closed: "Zamknięte",
};

const STATUS_CLASS: Record<TicketRecord["status"], string> = {
  open: "ticket-badge ticket-badge-open",
  answered: "ticket-badge ticket-badge-answered",
  closed: "ticket-badge ticket-badge-closed",
};

const PRIORITY_CLASS: Record<string, string> = {
  Niski: "ticket-badge ticket-badge-priority-low",
  Średni: "ticket-badge ticket-badge-priority-medium",
  Wysoki: "ticket-badge ticket-badge-priority-high",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Strona pomocy - formularz zgłoszeń (patrz license-server/src/tickets.js) plus krótkie
    FAQ oparte na realnym działaniu appki. Gate-exempt (patrz isGateExempt w Layout.tsx) -
    dostępna nawet bez zalogowania, ale samo tworzenie/przeglądanie zgłoszeń wymaga konta
    (są do niego przypisane). Odpowiadanie na zgłoszenia na razie przez curl, tak samo jak
    wystawianie licencji - patrz Mainplugins/license-server/README.md. */
export default function SupportPage() {
  const { customer } = useAuth();
  const { profiles } = useProfiles();
  const [meta, setMeta] = useState<TicketMeta | null>(null);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [serverProfile, setServerProfile] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  useEffect(() => {
    shopTicketMeta()
      .then((m) => {
        setMeta(m);
        setCategory((c) => c || m.categories[0] || "");
        setPriority((p) => p || m.priorities[0] || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!customer) {
      setTickets([]);
      return;
    }
    setTicketsLoading(true);
    shopMyTickets()
      .then(setTickets)
      .catch(() => {})
      .finally(() => setTicketsLoading(false));
  }, [customer]);

  async function submitTicket(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || !category || !priority) return;
    setBusy(true);
    setStatus(null);
    try {
      await shopCreateTicket({
        subject: subject.trim(),
        category,
        priority,
        serverProfile: serverProfile || null,
        message: message.trim(),
      });
      setSubject("");
      setMessage("");
      setServerProfile("");
      setTickets(await shopMyTickets());
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Wsparcie</h1>

      {customer && (
        <form onSubmit={submitTicket} className="card form">
          <div className="card-title">Nowe zgłoszenie</div>
          <label>
            Temat
            <input required value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <div className="row">
            <label style={{ flex: 1 }}>
              Kategoria
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {(meta?.categories ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              Priorytet
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {(meta?.priorities ?? []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              Przypisany serwer
              <select value={serverProfile} onChange={(e) => setServerProfile(e.target.value)}>
                <option value="">- Żaden -</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Wiadomość
            <textarea required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" disabled={busy}>
              {busy ? "Wysyłam..." : "Utwórz zgłoszenie"}
            </button>
          </div>
        </form>
      )}

      {!customer && (
        <p className="muted">
          <Link to="/account">Zaloguj się</Link>, żeby utworzyć zgłoszenie i zobaczyć swoje wcześniejsze.
        </p>
      )}

      {customer && (
        <div className="ticket-list">
          {ticketsLoading && <p className="muted">Ładowanie...</p>}
          {!ticketsLoading && tickets.length === 0 && <p className="muted">Nie masz jeszcze żadnych zgłoszeń.</p>}
          {tickets.map((t) => {
            const expanded = expandedTicketId === t.id;
            return (
              <div key={t.id} className={expanded ? "ticket-group expanded" : "ticket-group"}>
                <div
                  className="ticket-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedTicketId(expanded ? null : t.id)}
                  onKeyDown={(e) => e.key === "Enter" && setExpandedTicketId(expanded ? null : t.id)}
                >
                  <MessageSquare size={16} strokeWidth={1.75} className="ticket-row-icon" />
                  <div className="ticket-row-col">
                    <span className="ticket-badge">{t.subject}</span>
                    <span className="ticket-row-label">TEMAT</span>
                  </div>
                  <div className="ticket-row-col">
                    <span className={STATUS_CLASS[t.status]}>{STATUS_LABELS[t.status]}</span>
                    <span className="ticket-row-label">STATUS</span>
                  </div>
                  <div className="ticket-row-col">
                    <span className="ticket-badge">{t.category}</span>
                    <span className="ticket-row-label">KATEGORIA</span>
                  </div>
                  <div className="ticket-row-col">
                    <span className={PRIORITY_CLASS[t.priority] ?? "ticket-badge"}>{t.priority}</span>
                    <span className="ticket-row-label">PRIORYTET</span>
                  </div>
                  <div className="ticket-row-col">
                    <span className="ticket-badge">{formatDate(t.updatedAt)}</span>
                    <span className="ticket-row-label">ZAKTUALIZOWANO</span>
                  </div>
                </div>

                {expanded && (
                  <div className="ticket-thread">
                    {t.messages.map((m, i) => (
                      <div key={i} className={`ticket-message ticket-message-${m.from}`}>
                        <div className="ticket-message-head">
                          <span className="ticket-message-from">{MESSAGE_FROM_LABELS[m.from]}</span>
                          <span className="ticket-message-at">{formatDate(m.at)}</span>
                        </div>
                        <p className="ticket-message-body">{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
