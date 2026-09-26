import { RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ask } from "../../components/AskModal";
import { CopyRow, HelpButton } from "../../components/EditorBits";
import MaterialIcon from "../../components/MaterialIcon";
import MinecraftTextPreview from "../../components/MinecraftTextPreview";
import { rconSendCommand, sftpReadFile } from "../../lib/api";
import { itemDisplayName } from "../../lib/itemNames";
import { expiresIn, parseOffers, type LiveOffer } from "../../lib/marketLive";
import { plural } from "../../lib/plText";

interface Props {
  profileId: string;
  /** Folder pluginu Targu na serwerze. */
  dir: string;
  expireDays: number;
  mailbox: boolean;
  currency: string;
  iconPackDir?: string;
  onHelp: () => void;
}

function timeLeft(ms: number): string {
  if (ms <= 0) return "wygasa teraz";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `wygaśnie za ${d} ${plural(d, "dzień", "dni", "dni")}`;
  }
  if (h >= 1) return `wygaśnie za ${h} godz.`;
  return `wygaśnie za ${Math.max(1, Math.floor(ms / 60_000))} min`;
}

function listedAgo(at: number, now: number): string {
  if (!at) return "";
  const h = Math.floor((now - at) / 3_600_000);
  if (h < 1) return "wystawiona przed chwilą";
  if (h < 24) return `wystawiona ${h} godz. temu`;
  const d = Math.floor(h / 24);
  return `wystawiona ${d} ${plural(d, "dzień", "dni", "dni")} temu`;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/&[0-9a-fk-or]/g, "");
}

/** Zakładka „Oferty na żywo”: co jest teraz na Targu, ze zdejmowaniem ofert od razu na serwerze. */
export default function MarketLiveTab({ profileId, dir, expireDays, mailbox, currency, iconPackDir, onHelp }: Props) {
  const [offers, setOffers] = useState<LiveOffer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [seller, setSeller] = useState("");
  const [now, setNow] = useState(Date.now());

  async function reload() {
    setLoading(true);
    let text: string | null = null;
    try {
      text = await sftpReadFile(profileId, `${dir}/listings.yml`);
    } catch {
      // Targ jeszcze nic nie zapisał - brak ofert
    }
    setOffers(parseOffers(text));
    setNow(Date.now());
    setLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    if (!profileId) return;
    void reload();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, dir]);

  /** Wysyła komendę na serwer; bez połączenia pokazuje ją do wpisania w konsoli. true = poszło. */
  async function run(command: string, done: string): Promise<boolean> {
    setManual(null);
    try {
      await rconSendCommand(profileId, command);
      setInfo(done);
      return true;
    } catch {
      setInfo(null);
      setManual(command);
      return false;
    }
  }

  const back = mailbox ? "do jego skrzynki „Do odebrania”" : "do jego ekwipunku";
  const nameOf = (o: LiveOffer) => (o.name.trim() ? o.name : o.type ? itemDisplayName(o.type) : "przedmiot");

  async function removeOne(o: LiveOffer) {
    if (!(await ask(`Oferta gracza ${o.seller} zniknie z Targu, a przedmiot wróci ${back}.`, { title: "Zdjąć tę ofertę?", okLabel: "Zdejmij" }))) return;
    if (await run(`@market remove-offer ${o.id}`, `Zdjęto ofertę gracza ${o.seller}.`)) setOffers(offers.filter((x) => x.id !== o.id));
  }

  async function removeAll(name: string) {
    const n = offers.filter((o) => o.seller === name).length;
    if (
      !(await ask(`Wszystkie oferty gracza ${name} (${n}) znikną z Targu, a przedmioty wrócą ${back}.`, {
        title: "Zdjąć wszystkie oferty gracza?",
        okLabel: "Zdejmij wszystkie",
      }))
    )
      return;
    if (await run(`@market remove ${name}`, `Zdjęto oferty gracza ${name}.`)) {
      setOffers(offers.filter((o) => o.seller !== name));
      setSeller("");
    }
  }

  const sellers = [...new Set(offers.map((o) => o.seller))].sort((a, b) => a.localeCompare(b, "pl"));
  const q = norm(query.trim());
  const shown = offers.filter((o) => (!seller || o.seller === seller) && (!q || norm(nameOf(o)).includes(q) || norm(o.seller).includes(q)));

  return (
    <section className="card form">
      <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>Oferty na żywo</h2>
        <HelpButton id="market-live" title="Oferty na żywo" onClick={onHelp} />
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => void reload()} disabled={loading || !profileId} title="Wczytuje od nowa, co teraz jest na Targu">
          <RefreshCw size={14} strokeWidth={1.75} /> Odśwież
        </button>
      </div>
      <p className="muted small">
        Oferty, które są teraz na Targu. Zdejmowanie działa <b>od razu</b> na serwerze - bez „Wyślij na serwer”. Przedmiot nie ginie, wraca do
        sprzedającego.
      </p>
      {info && <p className="ci-note small">{info}</p>}
      {manual && (
        <div className="ci-warning small">
          <b>Aplikacja nie może wysłać komendy</b> - serwer jest wyłączony albo nie pozwala aplikacji wysyłać komend. Wpisz ją w konsoli serwera:
          <div className="ci-protip" style={{ marginTop: "0.4rem" }}>
            <CopyRow cmd={manual} what="skopiuj i wklej w konsoli" />
          </div>
        </div>
      )}

      {!profileId ? (
        <p className="muted small">Wybierz serwer u góry.</p>
      ) : !loaded ? (
        <p className="muted small">Wczytuję oferty...</p>
      ) : offers.length === 0 ? (
        <p className="muted small">Na Targu nie ma teraz żadnej oferty.</p>
      ) : (
        <>
          <div className="row" style={{ alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <label className="ci-text-search" style={{ flex: 1, minWidth: "14rem", margin: 0 }}>
              <Search size={15} strokeWidth={1.75} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj przedmiotu albo gracza" />
              {query && (
                <button type="button" className="ci-trash" title="Wyczyść" onClick={() => setQuery("")}>
                  <X size={14} />
                </button>
              )}
            </label>
            <select value={seller} onChange={(e) => setSeller(e.target.value)}>
              <option value="">Wszyscy gracze ({sellers.length})</option>
              {sellers.map((s) => (
                <option key={s} value={s}>
                  {s} ({offers.filter((o) => o.seller === s).length})
                </option>
              ))}
            </select>
            {seller && (
              <button type="button" className="ci-danger" onClick={() => void removeAll(seller)}>
                <Trash2 size={14} strokeWidth={1.75} /> Zdejmij wszystkie oferty: {seller}
              </button>
            )}
          </div>
          <p className="muted small" style={{ margin: "0.4rem 0" }}>
            {shown.length === offers.length
              ? `Na Targu: ${offers.length} ${plural(offers.length, "oferta", "oferty", "ofert")}.`
              : `Pokazano ${shown.length} z ${offers.length}.`}
          </p>
          {shown.map((o) => {
            const left = expiresIn(o, expireDays, now);
            return (
              <div key={o.id} className="ci-cat-row" style={{ alignItems: "center", gap: "0.6rem" }}>
                {o.type ? <MaterialIcon material={o.type} iconPackDir={iconPackDir} /> : <span style={{ width: 24 }} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>
                    {o.amount > 1 && `${o.amount}x `}
                    <MinecraftTextPreview text={nameOf(o)} />
                  </b>{" "}
                  za <b>{o.price.toLocaleString("pl-PL")}{currency}</b>
                  <br />
                  <span className="muted small">
                    {o.seller} · {listedAgo(o.listedAt, now)}
                    {left != null && ` · ${timeLeft(left)}`}
                  </span>
                </span>
                <button type="button" title={`Zdejmuje ofertę z Targu - przedmiot wraca ${back}`} onClick={() => void removeOne(o)}>
                  Zdejmij
                </button>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
