import { File, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { sftpListDir } from "../lib/api";
import type { RemoteEntry } from "../lib/types";

interface Props {
  profileId: string;
  startPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function RemoteFilePicker({ profileId, startPath, onSelect, onClose }: Props) {
  const [path, setPath] = useState(startPath);
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function browse(p: string) {
    setLoading(true);
    setError(null);
    try {
      setEntries(await sftpListDir(profileId, p));
      setPath(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    browse(startPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goUp() {
    const trimmed = path.replace(/\/+$/, "");
    const parent = trimmed.substring(0, trimmed.lastIndexOf("/")) || "/";
    browse(parent);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <button type="button" onClick={goUp}>
            .. Wyżej
          </button>
          <span className="muted small">{path}</span>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto" }}>
            Zamknij
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <ul className="file-list">
          {entries.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                className="file-entry"
                onClick={() => (entry.is_dir ? browse(entry.path) : onSelect(entry.path))}
              >
                {entry.is_dir ? <Folder size={14} strokeWidth={1.75} /> : <File size={14} strokeWidth={1.75} />} {entry.name}
              </button>
            </li>
          ))}
          {loading && <li className="muted">Ładowanie...</li>}
          {!loading && entries.length === 0 && <li className="muted">Pusto.</li>}
        </ul>
      </div>
    </div>
  );
}
