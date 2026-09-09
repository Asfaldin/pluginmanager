import { ALL_CHANNELS, type ChannelName } from "../lib/announcerConfig";

const CHANNEL_LABELS: Record<ChannelName, string> = {
  CHAT: "Czat",
  ACTIONBAR: "Actionbar",
  TITLE: "Tytuł",
  BOSSBAR: "Bossbar",
};

/** Zestaw checkboxów CHAT/ACTIONBAR/TITLE/BOSSBAR - jedna wiadomość/grupa może mieć kilka
    naraz. Pusty zestaw jest poprawny i znaczący (patrz miejsce użycia - zwykle "dziedzicz z grupy"). */
export default function ChannelPicker({ value, onChange }: { value: ChannelName[]; onChange: (next: ChannelName[]) => void }) {
  function toggle(ch: ChannelName) {
    onChange(value.includes(ch) ? value.filter((c) => c !== ch) : [...value, ch]);
  }
  return (
    <div className="row" style={{ margin: 0, gap: "0.75rem" }}>
      {ALL_CHANNELS.map((ch) => (
        <label key={ch} className="checkbox">
          <input type="checkbox" checked={value.includes(ch)} onChange={() => toggle(ch)} />
          {CHANNEL_LABELS[ch]}
        </label>
      ))}
    </div>
  );
}
