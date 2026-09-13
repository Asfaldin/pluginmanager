import { useEffect, useState } from "react";
import { rpTextureStatus } from "../lib/api";
import { iconCropForMaterial, textureRelPathsForMaterial, type IconCrop } from "../lib/materialIcons";

interface Props {
  material: string;
  iconPackDir?: string;
  className?: string;
}

/** Skleja ikonkę z kawałków tekstury modelu (skrzynie, głowy) na canvasie. */
function composeCrop(dataUrl: string, crop: IconCrop): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = crop.width;
      canvas.height = crop.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.imageSmoothingEnabled = false;
      for (const p of crop.parts) ctx.drawImage(img, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.sw, p.sh);
      resolve(canvas.toDataURL());
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
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
      const crop = iconCropForMaterial(material);
      if (crop) {
        try {
          const st = await rpTextureStatus(iconPackDir, crop.texture);
          if (st.overridden && st.preview_data_url) {
            const url = await composeCrop(st.preview_data_url, crop);
            if (!cancelled) setPreview(url);
            return;
          }
        } catch {
          // brak tekstury modelu - próbujemy zwykłych ścieżek niżej
        }
      }
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
