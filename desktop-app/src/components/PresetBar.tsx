import { Download, Save, Trash2 } from "lucide-react";

interface PresetBarProps {
  presets: Array<{ name: string; savedAt: number }>;
  selectedName: string;
  onSelectName: (name: string) => void;
  onSaveAs: () => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
  disabled?: boolean;
}

// Same bar on every editor: a local, per-page "save a version of my work"
// safety net - never touches the server. "Zapisz obecny jako..." snapshots
// whatever's currently in the draft; "Wczytaj do edycji" only replaces the
// local draft (still needs the page's own "Wyślij na serwer" to go live) -
// handy if something got overwritten on the server and you want back what
// you had.
export default function PresetBar({ presets, selectedName, onSelectName, onSaveAs, onLoad, onDelete, disabled }: PresetBarProps) {
  return (
    <div className="row card" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <strong className="card-title">Presety (lokalnie):</strong>
      <select value={selectedName} onChange={(e) => onSelectName(e.target.value)}>
        <option value="">- wybierz -</option>
        {presets.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name} ({new Date(p.savedAt).toLocaleString()})
          </option>
        ))}
      </select>
      <button type="button" onClick={onSaveAs} disabled={disabled}>
        <Save size={14} strokeWidth={1.75} /> Zapisz obecny jako...
      </button>
      <button type="button" disabled={!selectedName} onClick={() => onLoad(selectedName)}>
        <Download size={14} strokeWidth={1.75} /> Wczytaj do edycji
      </button>
      <button type="button" disabled={!selectedName} onClick={() => onDelete(selectedName)}>
        <Trash2 size={14} strokeWidth={1.75} /> Usuń zapis
      </button>
    </div>
  );
}
