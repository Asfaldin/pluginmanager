import ChannelPicker from "./ChannelPicker";
import MinecraftTextInput from "./MinecraftTextInput";
import MinecraftTextPreview from "./MinecraftTextPreview";
import ToolbarMore from "./ToolbarMore";
import type { AnnMessage } from "../lib/announcerConfig";

const CLICK_TYPES = ["", "RUN_COMMAND", "SUGGEST_COMMAND", "OPEN_URL"];

interface Props {
  message: AnnMessage;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<AnnMessage>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}

/** Jedna wiadomość wewnątrz grupy - ten sam wzorzec zwijania co reszta edytora (podgląd
    efektu końcowego zamiast surowych kodów, gdy zwinięta), ale ze wszystkimi nowymi polami
    (warunki widoczności, prezentacja, klik, nagroda "odbierz") schowanymi pod "Zaawansowane" -
    inaczej ściana ~20 pól na wiadomość zasłoniłaby samą treść. */
export default function AnnouncerMessageEditor({ message: m, index, total, expanded, onToggleExpand, onChange, onRemove, onMove }: Props) {
  const hasTitle = m.channels.includes("TITLE");
  const hasBossbar = m.channels.includes("BOSSBAR");

  if (!expanded) {
    return (
      <div className="mc-message-row mc-message-collapsed">
        <button type="button" className="mc-message-toggle" title="Rozwiń do edycji" onClick={onToggleExpand}>
          ▸
        </button>
        <span className="muted small">#{index + 1}</span>
        <div className="mc-message-collapsed-text">
          <MinecraftTextPreview text={m.text} emptyLabel="(pusta wiadomość)" />
        </div>
        {!m.enabled && <span className="badge">wyłączona</span>}
        {m.claim && <span className="badge badge-on">nagroda</span>}
        <div className="row mc-message-collapsed-actions">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}>↓</button>
          <button type="button" onClick={onRemove}>Usuń</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-message-row">
      <div className="row" style={{ justifyContent: "space-between", margin: "0 0 0.3rem" }}>
        <button type="button" className="mc-message-toggle" title="Zwiń" onClick={onToggleExpand}>
          ▾
        </button>
        <span className="muted small">#{index + 1}</span>
      </div>

      <MinecraftTextInput value={m.text} onChange={(v) => onChange({ text: v })} placeholder="&aTreść wiadomości" onEnter={onToggleExpand} />

      <div className="row">
        <label className="checkbox">
          <input type="checkbox" checked={m.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          Włączona
        </label>
        <label>
          Waga (przy kolejności WEIGHTED)
          <input type="number" min={1} style={{ width: 80 }} value={m.weight} onChange={(e) => onChange({ weight: Math.max(1, Number(e.target.value)) })} />
        </label>
      </div>

      <label className="muted small" style={{ display: "block", marginTop: "0.4rem" }}>
        Kanały (puste = dziedzicz z grupy)
      </label>
      <ChannelPicker value={m.channels} onChange={(channels) => onChange({ channels })} />

      <ToolbarMore>
        <p className="muted small" style={{ marginTop: 0 }}>Warunki widoczności</p>
        <div className="row">
          <label>
            Uprawnienie (puste = wszyscy)
            <input value={m.permission} onChange={(e) => onChange({ permission: e.target.value })} placeholder="np. vip.perk" />
          </label>
          <label>
            Min. graczy online
            <input type="number" min={0} style={{ width: 90 }} value={m.minPlayers} onChange={(e) => onChange({ minPlayers: Math.max(0, Number(e.target.value)) })} />
          </label>
        </div>
        <label>
          Światy (po przecinku, puste = wszystkie)
          <input
            value={m.worlds.join(", ")}
            onChange={(e) => onChange({ worlds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="world, world_nether"
          />
        </label>
        <label>
          {'Warunek PlaceholderAPI (np. "%vault_eco_balance% >= 100")'}
          <input value={m.condition} onChange={(e) => onChange({ condition: e.target.value })} placeholder="opcjonalnie" />
        </label>

        <p className="muted small">Prezentacja</p>
        <div className="row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={m.sound !== null}
              onChange={(e) => onChange({ sound: e.target.checked ? "" : null })}
            />
            Własny dźwięk (zamiast dziedziczonego z grupy)
          </label>
          {m.sound !== null && (
            <input value={m.sound} onChange={(e) => onChange({ sound: e.target.value })} placeholder="entity.player.levelup" />
          )}
        </div>
        <div className="row">
          <label className="checkbox">
            <input type="checkbox" checked={m.minimessage} onChange={(e) => onChange({ minimessage: e.target.checked })} />
            Tekst w MiniMessage (zamiast kodów &)
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={m.center} onChange={(e) => onChange({ center: e.target.checked })} />
            Wyśrodkuj na czacie
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={m.discord !== null}
              onChange={(e) => onChange({ discord: e.target.checked ? false : null })}
            />
            Nadpisz mirrorowanie na Discord
          </label>
          {m.discord !== null && (
            <label className="checkbox">
              <input type="checkbox" checked={m.discord} onChange={(e) => onChange({ discord: e.target.checked })} />
              wysyłaj na Discord
            </label>
          )}
        </div>

        {hasTitle && (
          <>
            <p className="muted small">Tytuł (ticki)</p>
            <div className="row">
              <label>
                Pojawianie
                <input type="number" min={0} style={{ width: 80 }} value={m.titleFadeIn} onChange={(e) => onChange({ titleFadeIn: Number(e.target.value) })} />
              </label>
              <label>
                Trwanie
                <input type="number" min={0} style={{ width: 80 }} value={m.titleStay} onChange={(e) => onChange({ titleStay: Number(e.target.value) })} />
              </label>
              <label>
                Znikanie
                <input type="number" min={0} style={{ width: 80 }} value={m.titleFadeOut} onChange={(e) => onChange({ titleFadeOut: Number(e.target.value) })} />
              </label>
            </div>
          </>
        )}

        {hasBossbar && (
          <>
            <p className="muted small">Bossbar</p>
            <div className="row">
              <label>
                Kolor
                <input value={m.bossbarColor} onChange={(e) => onChange({ bossbarColor: e.target.value.toUpperCase() })} placeholder="BLUE" />
              </label>
              <label>
                Sekundy
                <input type="number" min={1} style={{ width: 80 }} value={m.bossbarSeconds} onChange={(e) => onChange({ bossbarSeconds: Math.max(1, Number(e.target.value)) })} />
              </label>
            </div>
          </>
        )}

        <p className="muted small">Klikalność</p>
        <div className="row">
          <label>
            Typ kliknięcia
            <select value={m.clickType} onChange={(e) => onChange({ clickType: e.target.value })}>
              {CLICK_TYPES.map((t) => (
                <option key={t} value={t}>{t || "(brak)"}</option>
              ))}
            </select>
          </label>
          {m.clickType && (
            <label>
              Wartość (komenda albo URL)
              <input value={m.clickValue} onChange={(e) => onChange({ clickValue: e.target.value })} />
            </label>
          )}
          <label>
            Podpowiedź po najechaniu
            <input value={m.hover} onChange={(e) => onChange({ hover: e.target.value })} />
          </label>
        </div>

        <p className="muted small">Nagroda "kliknij, aby odebrać"</p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={m.claim !== null}
            onChange={(e) =>
              onChange({
                claim: e.target.checked
                  ? { limit: 0, windowSeconds: 0, button: "&a&l[ODBIERZ]", already: "&7Już odebrałeś tę nagrodę.", full: "&cWszystkie nagrody zostały już rozdane!", claimed: "&aNagroda odebrana!", commands: [] }
                  : null,
              })
            }
          />
          Ta wiadomość ma przycisk z nagrodą
        </label>
        {m.claim && (
          <>
            <div className="row">
              <label>
                Limit odbiorów (0 = bez limitu)
                <input type="number" min={0} style={{ width: 90 }} value={m.claim.limit} onChange={(e) => onChange({ claim: { ...m.claim!, limit: Number(e.target.value) } })} />
              </label>
              <label>
                Okno czasowe (s, 0 = do następnego ogłoszenia)
                <input type="number" min={0} style={{ width: 90 }} value={m.claim.windowSeconds} onChange={(e) => onChange({ claim: { ...m.claim!, windowSeconds: Number(e.target.value) } })} />
              </label>
              <label>
                Tekst przycisku
                <input value={m.claim.button} onChange={(e) => onChange({ claim: { ...m.claim!, button: e.target.value } })} />
              </label>
            </div>
            <label>
              Komendy z konsoli po odbiorze (jedna na linię, %player% = nick)
              <textarea
                rows={3}
                value={m.claim.commands.join("\n")}
                onChange={(e) => onChange({ claim: { ...m.claim!, commands: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } })}
              />
            </label>
          </>
        )}
      </ToolbarMore>
    </div>
  );
}
