import { useEffect, useState } from "react";
import { rpTextureStatus } from "../lib/api";
import { iconCropForMaterial, textureRelPathsForMaterial, tintForMaterial, type IconCrop } from "../lib/materialIcons";

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

/**
 * Repaints a greyscale vanilla texture (grass, leaves, vines) with the colour
 * the game applies at runtime. Textures that already carry colour are returned
 * untouched, so a texture pack's own version never gets a second coat.
 */
function applyTint(dataUrl: string, color: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      let data: ImageData;
      try {
        data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        return resolve(dataUrl); // tainted canvas - leave the texture as it is
      }
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        if (px[i] !== px[i + 1] || px[i + 1] !== px[i + 2]) return resolve(dataUrl);
      }
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        px[i] = Math.round(px[i] * r);
        px[i + 1] = Math.round(px[i + 1] * g);
        px[i + 2] = Math.round(px[i + 2] * b);
      }
      ctx.putImageData(data, 0, 0);
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
      const tint = tintForMaterial(material);
      for (const rel of textureRelPathsForMaterial(material)) {
        try {
          const st = await rpTextureStatus(iconPackDir, rel);
          if (st.overridden && st.preview_data_url) {
            let url = st.preview_data_url;
            if (tint) {
              try {
                url = await applyTint(url, tint);
              } catch {
                // painting failed - show the raw texture rather than nothing
              }
            }
            if (!cancelled) setPreview(url);
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
