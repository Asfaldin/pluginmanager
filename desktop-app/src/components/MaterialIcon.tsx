import { useEffect, useState } from "react";
import { rpTextureStatus } from "../lib/api";
import { textureRelPathsForMaterial } from "../lib/materialIcons";

interface Props {
  material: string;
  iconPackDir?: string;
  className?: string;
}

export default function MaterialIcon({ material, iconPackDir, className }: Props) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!iconPackDir || !material) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      for (const rel of textureRelPathsForMaterial(material)) {
        try {
          const st = await rpTextureStatus(iconPackDir, rel);
          if (st.overridden && st.preview_data_url) {
            if (!cancelled) setPreview(st.preview_data_url);
            return;
          }
        } catch {
          // try next candidate path
        }
      }
      if (!cancelled) setPreview(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [iconPackDir, material]);

  if (!iconPackDir) return null;
  return (
    <div className={`material-field-icon${className ? ` ${className}` : ""}`} title={material}>
      {preview ? <img src={preview} alt={material} /> : <span className="muted small">?</span>}
    </div>
  );
}
