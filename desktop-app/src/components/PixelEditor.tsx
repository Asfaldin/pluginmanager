import { useEffect, useMemo, useRef, useState } from "react";
import { rpSavePngBytes } from "../lib/api";
import { MC_COLORS } from "../lib/minecraftColors";

interface Props {
  packDir: string;
  relPath: string;
  initialDataUrl: string | null;
  defaultWidth: number;
  defaultHeight: number;
  onClose: () => void;
  onSaved: () => void;
}

type Tool = "pencil" | "similarBrush" | "eraser" | "fill" | "eyedropper" | "line" | "rect" | "rectFilled";

const MAX_HISTORY = 30;
const MAX_RECENT_COLORS = 10;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? [];
  return [parseInt(m[1] ?? "00", 16), parseInt(m[2] ?? "00", 16), parseInt(m[3] ?? "00", 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hexToHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = hexToRgb(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [255 * hue2rgb(hue + 1 / 3), 255 * hue2rgb(hue), 255 * hue2rgb(hue - 1 / 3)];
}

function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(...hslToRgb(h, s, clamp01(l)));
}

function suggestSimilarColors(hex: string): string[] {
  const [h, s, l] = hexToHsl(hex);
  const shadeDeltas = [-0.35, -0.2, -0.08, 0.08, 0.2, 0.35];
  const hueDeltas = [-25, -12, 12, 25];
  return [...shadeDeltas.map((dl) => hslToHex(h, s, l + dl)), ...hueDeltas.map((dh) => hslToHex(h + dh, s, l))];
}

function cloneImageData(id: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void) {
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(cx, cy);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

function plotRect(x0: number, y0: number, x1: number, y1: number, filled: boolean, plot: (x: number, y: number) => void) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  if (filled) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) plot(x, y);
    }
  } else {
    for (let x = minX; x <= maxX; x++) {
      plot(x, minY);
      plot(x, maxY);
    }
    for (let y = minY; y <= maxY; y++) {
      plot(minX, y);
      plot(maxX, y);
    }
  }
}

export default function PixelEditor({ packDir, relPath, initialDataUrl, defaultWidth, defaultHeight, onClose, onSaved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const isDrawingRef = useRef(false);
  const shapeStartRef = useRef<[number, number] | null>(null);
  const shapeBaseRef = useRef<ImageData | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);

  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#000000");
  const [alpha, setAlpha] = useState(255);
  const [tolerance, setTolerance] = useState(20);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [zoom, setZoom] = useState(14);
  const [showGrid, setShowGrid] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const suggestedColors = useMemo(() => suggestSimilarColors(color), [color]);

  function renderDisplay() {
    const disp = canvasRef.current;
    const id = imageDataRef.current;
    if (!disp || !id) return;
    disp.width = id.width * zoom;
    disp.height = id.height * zoom;

    const off = offscreenRef.current ?? document.createElement("canvas");
    offscreenRef.current = off;
    off.width = id.width;
    off.height = id.height;
    off.getContext("2d")!.putImageData(id, 0, 0);

    const ctx = disp.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, disp.width, disp.height);
    ctx.drawImage(off, 0, 0, id.width, id.height, 0, 0, disp.width, disp.height);

    if (showGrid && zoom >= 4) {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= id.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, disp.height);
        ctx.stroke();
      }
      for (let y = 0; y <= id.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(disp.width, y * zoom + 0.5);
        ctx.stroke();
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      let imageData: ImageData;
      if (initialDataUrl) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Nie udało się wczytać tekstury"));
          img.src = initialDataUrl;
        });
        const tmp = document.createElement("canvas");
        tmp.width = img.naturalWidth;
        tmp.height = img.naturalHeight;
        tmp.getContext("2d")!.drawImage(img, 0, 0);
        imageData = tmp.getContext("2d")!.getImageData(0, 0, tmp.width, tmp.height);
      } else {
        imageData = new ImageData(Math.max(1, defaultWidth), Math.max(1, defaultHeight));
      }
      if (cancelled) return;
      imageDataRef.current = imageData;
      undoStackRef.current = [];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setReady(true);
    }
    init().catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDataUrl]);

  useEffect(() => {
    if (ready) renderDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom, showGrid]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushUndo() {
    if (!imageDataRef.current) return;
    undoStackRef.current.push(cloneImageData(imageDataRef.current));
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function handleUndo() {
    if (!imageDataRef.current || undoStackRef.current.length === 0) return;
    redoStackRef.current.push(cloneImageData(imageDataRef.current));
    imageDataRef.current = undoStackRef.current.pop()!;
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    renderDisplay();
  }

  function handleRedo() {
    if (!imageDataRef.current || redoStackRef.current.length === 0) return;
    undoStackRef.current.push(cloneImageData(imageDataRef.current));
    imageDataRef.current = redoStackRef.current.pop()!;
    setCanRedo(redoStackRef.current.length > 0);
    setCanUndo(true);
    renderDisplay();
  }

  function rememberColor(hex: string) {
    setRecentColors((prev) => [hex, ...prev.filter((c) => c !== hex)].slice(0, MAX_RECENT_COLORS));
  }

  function pickColor(hex: string) {
    setColor(hex);
    rememberColor(hex);
  }

  function setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
    const id = imageDataRef.current;
    if (!id || x < 0 || y < 0 || x >= id.width || y >= id.height) return;
    const idx = (y * id.width + x) * 4;
    id.data[idx] = r;
    id.data[idx + 1] = g;
    id.data[idx + 2] = b;
    id.data[idx + 3] = a;
  }

  function getPixel(x: number, y: number): [number, number, number, number] {
    const id = imageDataRef.current!;
    const idx = (y * id.width + x) * 4;
    return [id.data[idx], id.data[idx + 1], id.data[idx + 2], id.data[idx + 3]];
  }

  function paintPixel(x: number, y: number) {
    const [r, g, b] = hexToRgb(color);
    setPixel(x, y, r, g, b, alpha);
  }

  function paintSimilarPixel(x: number, y: number) {
    const [h, s, l] = hexToHsl(color);
    const hueJitter = (Math.random() * 2 - 1) * tolerance * 1.2;
    const lightJitter = (Math.random() * 2 - 1) * (tolerance / 200);
    const [r, g, b] = hslToRgb(h + hueJitter, s, clamp01(l + lightJitter));
    setPixel(x, y, r, g, b, alpha);
  }

  function floodFill(startX: number, startY: number) {
    const id = imageDataRef.current;
    if (!id) return;
    const { width: w, height: h } = id;
    const [tr, tg, tb, ta] = getPixel(startX, startY);
    const [nr, ng, nb] = hexToRgb(color);
    if (tr === nr && tg === ng && tb === nb && ta === alpha) return;

    const visited = new Uint8Array(w * h);
    const stack: [number, number][] = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const vIdx = y * w + x;
      if (visited[vIdx]) continue;
      const idx = vIdx * 4;
      if (id.data[idx] !== tr || id.data[idx + 1] !== tg || id.data[idx + 2] !== tb || id.data[idx + 3] !== ta) continue;
      visited[vIdx] = 1;
      id.data[idx] = nr;
      id.data[idx + 1] = ng;
      id.data[idx + 2] = nb;
      id.data[idx + 3] = alpha;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  function pixelCoordFromEvent(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [Math.floor((e.clientX - rect.left) / zoom), Math.floor((e.clientY - rect.top) / zoom)];
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const [x, y] = pixelCoordFromEvent(e);
    isDrawingRef.current = true;

    if (tool === "eyedropper") {
      const [r, g, b] = getPixel(x, y);
      pickColor(rgbToHex(r, g, b));
      return;
    }

    if (tool === "line" || tool === "rect" || tool === "rectFilled") {
      pushUndo();
      shapeStartRef.current = [x, y];
      shapeBaseRef.current = cloneImageData(imageDataRef.current!);
      return;
    }

    pushUndo();
    if (tool === "pencil") paintPixel(x, y);
    else if (tool === "similarBrush") paintSimilarPixel(x, y);
    else if (tool === "eraser") setPixel(x, y, 0, 0, 0, 0);
    else if (tool === "fill") floodFill(x, y);
    renderDisplay();
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const [x, y] = pixelCoordFromEvent(e);

    if (shapeStartRef.current && shapeBaseRef.current) {
      imageDataRef.current = cloneImageData(shapeBaseRef.current);
      const [sx, sy] = shapeStartRef.current;
      if (tool === "line") bresenhamLine(sx, sy, x, y, (px, py) => paintPixel(px, py));
      else plotRect(sx, sy, x, y, tool === "rectFilled", (px, py) => paintPixel(px, py));
      renderDisplay();
      return;
    }

    if (tool === "pencil") paintPixel(x, y);
    else if (tool === "similarBrush") paintSimilarPixel(x, y);
    else if (tool === "eraser") setPixel(x, y, 0, 0, 0, 0);
    else return;
    renderDisplay();
  }

  function endStroke() {
    isDrawingRef.current = false;
    shapeStartRef.current = null;
    shapeBaseRef.current = null;
  }

  function clearAll() {
    const id = imageDataRef.current;
    if (!id) return;
    pushUndo();
    id.data.fill(0);
    renderDisplay();
  }

  async function handleSave() {
    const id = imageDataRef.current;
    const off = offscreenRef.current;
    if (!id || !off) return;
    setBusy(true);
    setError(null);
    try {
      off.getContext("2d")!.putImageData(id, 0, 0);
      const blob: Blob = await new Promise((resolve, reject) =>
        off.toBlob((b) => (b ? resolve(b) : reject(new Error("Eksport PNG nie powiódł się"))), "image/png")
      );
      const base64 = await blobToBase64(blob);
      await rpSavePngBytes(packDir, relPath, base64);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const TOOL_BUTTONS: Array<{ key: Tool; label: string }> = [
    { key: "pencil", label: "Ołówek" },
    { key: "similarBrush", label: "Pędzel (podobne kolory)" },
    { key: "eraser", label: "Gumka" },
    { key: "line", label: "Linia" },
    { key: "rect", label: "Prostokąt" },
    { key: "rectFilled", label: "Prostokąt wypełniony" },
    { key: "fill", label: "Wiaderko" },
    { key: "eyedropper", label: "Pipeta" },
  ];

  return (
    <div className="pixel-editor-fullpage">
      <h3>{relPath}</h3>

        <div className="pixel-editor-body">
          <div className="pixel-editor-canvas-wrap">
            {ready ? (
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={endStroke}
                onMouseLeave={endStroke}
              />
            ) : (
              <span className="muted">Wczytywanie...</span>
            )}
          </div>

          <div className="pixel-editor-sidebar">
            <div className="pixel-editor-section">
              <div className="pixel-editor-section-title">Narzędzia</div>
              <div className="pixel-editor-tool-grid">
                {TOOL_BUTTONS.map((t) => (
                  <button key={t.key} type="button" className={tool === t.key ? "active" : ""} onClick={() => setTool(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="row">
                <button type="button" onClick={handleUndo} disabled={!canUndo} title="Cofnij (Ctrl+Z)">
                  ↶ Cofnij
                </button>
                <button type="button" onClick={handleRedo} disabled={!canRedo} title="Ponów (Ctrl+Y)">
                  ↷ Ponów
                </button>
              </div>
            </div>

            <div className="pixel-editor-section">
              <div className="pixel-editor-section-title">Kolor</div>
              <div className="row">
                <input type="color" value={color} onChange={(e) => pickColor(e.target.value)} />
                <input
                  className="pixel-editor-hex"
                  value={color}
                  onChange={(e) => {
                    const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                    setColor(v);
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) rememberColor(v);
                  }}
                  maxLength={7}
                />
              </div>
              <label className="checkbox">
                Krycie {alpha}
                <input type="range" min={0} max={255} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
              </label>
              {tool === "similarBrush" && (
                <label className="checkbox">
                  Tolerancja {tolerance}
                  <input type="range" min={1} max={60} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
                </label>
              )}

              <div className="pixel-editor-section-title">Podobne kolory</div>
              <div className="pixel-editor-palette">
                {suggestedColors.map((c, i) => (
                  <button key={`${c}-${i}`} type="button" className="mc-swatch" style={{ background: c }} title={c} onClick={() => pickColor(c)} />
                ))}
              </div>

              <div className="pixel-editor-section-title">Paleta Minecraft</div>
              <div className="pixel-editor-palette">
                {MC_COLORS.map(([code, hex, label]) => (
                  <button
                    key={code}
                    type="button"
                    className="mc-swatch"
                    style={{ background: hex }}
                    title={label}
                    onClick={() => pickColor(hex)}
                  />
                ))}
              </div>

              {recentColors.length > 0 && (
                <>
                  <div className="pixel-editor-section-title">Ostatnie</div>
                  <div className="pixel-editor-palette">
                    {recentColors.map((c) => (
                      <button key={c} type="button" className="mc-swatch" style={{ background: c }} title={c} onClick={() => pickColor(c)} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="pixel-editor-section">
              <div className="pixel-editor-section-title">Widok</div>
              <div className="row">
                <button type="button" onClick={() => setZoom((z) => Math.max(2, z - 4))}>
                  Zoom −
                </button>
                <span className="muted">{zoom}x</span>
                <button type="button" onClick={() => setZoom((z) => Math.min(48, z + 4))}>
                  Zoom +
                </button>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                Siatka
              </label>
              <button type="button" onClick={clearAll}>
                Wyczyść całość
              </button>
            </div>

            {error && <p className="status">{error}</p>}

            <div className="row">
              <button onClick={handleSave} disabled={busy || !ready}>
                Zapisz
              </button>
              <button onClick={onClose} disabled={busy}>
                Zamknij
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
