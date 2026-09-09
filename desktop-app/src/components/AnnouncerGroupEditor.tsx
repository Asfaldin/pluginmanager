import { useState } from "react";
import AnnouncerMessageEditor from "./AnnouncerMessageEditor";
import ChannelPicker from "./ChannelPicker";
import ToolbarMore from "./ToolbarMore";
import { ALL_DAYS, ALL_ORDERINGS, EMPTY_MESSAGE, type AnnGroup, type AnnMessage, type DayName } from "../lib/announcerConfig";

const ORDERING_LABELS: Record<string, string> = { SEQUENTIAL: "Po kolei", RANDOM: "Losowo", WEIGHTED: "Losowo wg wagi" };
const DAY_LABELS: Record<DayName, string> = {
  MONDAY: "Pon", TUESDAY: "Wt", WEDNESDAY: "Śr", THURSDAY: "Czw", FRIDAY: "Pt", SATURDAY: "Sob", SUNDAY: "Nd",
};

interface Props {
  group: AnnGroup;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<AnnGroup>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}

/** Jedna grupa ogłoszeń - własny harmonogram (interwał/kolejność/okno czasowe) i lista
    wiadomości. Stan rozwinięcia POSZCZEGÓLNYCH wiadomości żyje tutaj lokalnie (nie w
    rodzicu) - każda grupa ma swój niezależny zestaw. */
export default function AnnouncerGroupEditor({ group: g, index, total, expanded, onToggleExpand, onChange, onRemove, onMove }: Props) {
  const [msgExpand, setMsgExpand] = useState<Record<number, boolean>>({});

  function isMsgExpanded(i: number, text: string): boolean {
    return i in msgExpand ? msgExpand[i] : text.trim() === "";
  }
  function toggleMsgExpanded(i: number, text: string) {
    setMsgExpand((prev) => ({ ...prev, [i]: !isMsgExpanded(i, text) }));
  }

  function updateMessage(i: number, patch: Partial<AnnMessage>) {
    const next = [...g.messages];
    next[i] = { ...next[i], ...patch };
    onChange({ messages: next });
  }
  function removeMessage(i: number) {
    if (!window.confirm("Usunąć tę wiadomość z grupy? Tego nie da się cofnąć.")) return;
    onChange({ messages: g.messages.filter((_, idx) => idx !== i) });
    setMsgExpand((prev) => {
      const next: Record<number, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (idx === i) continue;
        next[idx > i ? idx - 1 : idx] = v;
      }
      return next;
    });
  }
  function moveMessage(i: number, delta: number) {
    const target = i + delta;
    if (target < 0 || target >= g.messages.length) return;
    const next = [...g.messages];
    [next[i], next[target]] = [next[target], next[i]];
    onChange({ messages: next });
  }
  function addMessage() {
    const newIndex = g.messages.length;
    onChange({ messages: [...g.messages, { ...EMPTY_MESSAGE }] });
    setMsgExpand((prev) => ({ ...prev, [newIndex]: true }));
  }

  function toggleDay(day: DayName) {
    const days = g.schedule.days.includes(day) ? g.schedule.days.filter((d) => d !== day) : [...g.schedule.days, day];
    onChange({ schedule: { ...g.schedule, days } });
  }

  if (!expanded) {
    return (
      <div className="card" style={{ marginBottom: "0.6rem" }}>
        <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
          <button type="button" className="mc-message-toggle" title="Rozwiń" onClick={onToggleExpand}>▸</button>
          <span className="card-title" style={{ flex: 1 }}>{g.name || "(bez nazwy)"}</span>
          <span className="muted small">{g.messages.length} wiadomości</span>
          <div className="row" style={{ margin: 0 }}>
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0}>↑</button>
            <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}>↓</button>
            <button type="button" onClick={onRemove}>Usuń grupę</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: "0.6rem" }}>
      <div className="row" style={{ justifyContent: "space-between", margin: "0 0 0.5rem" }}>
        <button type="button" className="mc-message-toggle" title="Zwiń" onClick={onToggleExpand}>▾</button>
        <label style={{ flex: 1 }}>
          Nazwa grupy (klucz w YAML)
          <input value={g.name} onChange={(e) => onChange({ name: e.target.value.trim().toLowerCase().replace(/\s+/g, "-") })} />
        </label>
        <div className="row" style={{ margin: 0 }}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}>↓</button>
          <button type="button" onClick={onRemove}>Usuń grupę</button>
        </div>
      </div>

      <div className="row">
        <label>
          Interwał (s, 0 = globalny)
          <input type="number" min={0} style={{ width: 100 }} value={g.intervalSeconds} onChange={(e) => onChange({ intervalSeconds: Number(e.target.value) })} />
        </label>
        <label>
          Kolejność
          <select value={g.ordering} onChange={(e) => onChange({ ordering: e.target.value as AnnGroup["ordering"] })}>
            {ALL_ORDERINGS.map((o) => (
              <option key={o} value={o}>{ORDERING_LABELS[o]}</option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={g.noRepeat} onChange={(e) => onChange({ noRepeat: e.target.checked })} />
          Nie powtarzaj tej samej dwa razy pod rząd
        </label>
      </div>

      <label className="muted small" style={{ display: "block" }}>Domyślne kanały dla wiadomości bez własnych</label>
      <ChannelPicker value={g.channels} onChange={(channels) => onChange({ channels })} />

      <ToolbarMore>
        <div className="row">
          <label>
            Prefiks przed każdą wiadomością (czat)
            <input value={g.prefix} onChange={(e) => onChange({ prefix: e.target.value })} placeholder="&8[&bPorada&8] &7" />
          </label>
          <label>
            Domyślny dźwięk
            <input value={g.sound} onChange={(e) => onChange({ sound: e.target.value })} placeholder="entity.player.levelup" />
          </label>
        </div>
        <div className="row">
          <label className="checkbox">
            <input type="checkbox" checked={g.discord} onChange={(e) => onChange({ discord: e.target.checked })} />
            Mirrorować na Discord domyślnie
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={g.frame} onChange={(e) => onChange({ frame: e.target.checked })} />
            Ozdobne linie przed/po (czat)
          </label>
        </div>

        <p className="muted small">Harmonogram (puste = zawsze aktywna)</p>
        <div className="row">
          {ALL_DAYS.map((d) => (
            <label key={d} className="checkbox">
              <input type="checkbox" checked={g.schedule.days.includes(d)} onChange={() => toggleDay(d)} />
              {DAY_LABELS[d]}
            </label>
          ))}
        </div>
        <label style={{ maxWidth: 220 }}>
          Zakres godzin (np. 22:00-06:00)
          <input value={g.schedule.timeRange} onChange={(e) => onChange({ schedule: { ...g.schedule, timeRange: e.target.value } })} placeholder="cała doba" />
        </label>
      </ToolbarMore>

      <p className="card-title" style={{ marginTop: "0.75rem" }}>Wiadomości</p>
      {g.messages.map((m, i) => (
        <AnnouncerMessageEditor
          key={i}
          message={m}
          index={i}
          total={g.messages.length}
          expanded={isMsgExpanded(i, m.text)}
          onToggleExpand={() => toggleMsgExpanded(i, m.text)}
          onChange={(patch) => updateMessage(i, patch)}
          onRemove={() => removeMessage(i)}
          onMove={(delta) => moveMessage(i, delta)}
        />
      ))}
      <button type="button" onClick={addMessage}>+ Dodaj wiadomość</button>
    </div>
  );
}
