"use client";

import { useEffect, useRef, useState } from "react";
import { classifyChartType } from "@/lib/vision/classifyChartType";
import { setStyleConfig, setVisionUsed, type StyleConfig, type ChartType } from "@/lib/state/style";

type PaletteColor = { hex: string; count: number };

export default function StyleFromImagePage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [chartType, setChartType] = useState<ChartType>("line");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [legendPosition, setLegendPosition] = useState<StyleConfig["legendPosition"]>("right");
  const [fontSize, setFontSize] = useState<number>(11);
  const [grid, setGrid] = useState<boolean>(true);
  const [background, setBackground] = useState<string | undefined>(undefined);
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [pointSize, setPointSize] = useState<number>(20);
  const [usedVision, setUsedVision] = useState<boolean>(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  useEffect(() => {
    if (!previewUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      imgRef.current = img;
      // Draw into a canvas for processing
      const canvas = canvasRef.current || document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const maxSide = 512;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.floor(img.width * scale));
      canvas.height = Math.max(1, Math.floor(img.height * scale));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvasRef.current = canvas;

      // Extract palette
      const pal = await extractPalette(canvas, 6);
      setPalette(pal);

      // Classify chart type (heuristics for now)
  const cls = await classifyChartType(canvas);
  setChartType(cls.chartType as ChartType);
  setConfidence(cls.confidence);
  setUsedVision(!!cls.usedVision);
  setVisionUsed(!!cls.usedVision);
    };
    img.onerror = () => {
      setPreviewUrl(null);
    };
    img.src = previewUrl;
    return () => {
      try { URL.revokeObjectURL(previewUrl); } catch {}
    };
  }, [previewUrl]);

  function applyStyle() {
    const cfg: StyleConfig = {
      chartType,
      colorPalette: palette.map((p) => p.hex),
      legendPosition,
      fontSize,
      grid,
      background,
      strokeWidth,
      pointSize,
    };
    setStyleConfig(cfg);
    alert("Style saved. Generate a chart from the home tab to apply.");
  }

  return (
    <main className="container" style={{ paddingTop: 16 }}>
      <h1 className="page-title">Style from Image</h1>
      <p className="subtitle">Upload a chart image. Well extract a color palette and guess the chart type. You can edit and save as a style preset.</p>

      <div className="card" style={{ marginTop: 12 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} />
        {previewUrl && (
          <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "flex-start" }}>
            <img src={previewUrl} alt="Preview" style={{ maxWidth: 320, height: "auto", borderRadius: 8, border: "1px solid #eee" }} />
            <div style={{ flex: 1 }}>
              <section style={{ marginBottom: 12 }}>
                <h3>Palette</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {palette.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 20, height: 20, background: c.hex, border: "1px solid #ccc", borderRadius: 3 }} />
                      <code>{c.hex}</code>
                    </div>
                  ))}
                </div>
              </section>

              <section style={{ marginBottom: 12 }}>
                <h3>Chart type</h3>
                <select value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)}>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                  <option value="bar">Bar</option>
                  <option value="bar-horizontal">Bar (Horizontal)</option>
                  <option value="scatter">Scatter</option>
                </select>
                <div style={{ display: "inline-flex", gap: 10, alignItems: "center", marginLeft: 8 }}>
                  {confidence != null && (
                    <span style={{ opacity: 0.7, fontSize: 12 }}>confidence: {(confidence * 100).toFixed(0)}%</span>
                  )}
                  <span className="badge" title="Which classifier produced the chart type">
                    Classifier: {usedVision ? "Vision" : "Heuristics"}
                  </span>
                </div>
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: 8 }}>
                <label>Legend position</label>
                <select value={legendPosition} onChange={(e) => setLegendPosition(e.target.value as any)}>
                  <option value="right">Right</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                </select>

                <label>Base font size</label>
                <input type="number" min={8} max={24} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />

                <label>Grid lines</label>
                <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />

                <label>Background</label>
                <input type="text" placeholder="#ffffff or transparent" value={background ?? ""} onChange={(e) => setBackground(e.target.value || undefined)} />

                <label>Stroke width</label>
                <input type="number" min={0} max={10} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} />

                <label>Point size</label>
                <input type="number" min={0} max={200} value={pointSize} onChange={(e) => setPointSize(Number(e.target.value))} />
              </section>

              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={applyStyle}>Save style preset</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </main>
  );
}

// --- Utilities ---

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

async function extractPalette(canvas: HTMLCanvasElement, k = 6): Promise<PaletteColor[]> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Sample pixels (stride)
  const points: number[][] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 200) continue; // skip transparent
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // skip near-white backgrounds
      if (r > 245 && g > 245 && b > 245) continue;
      points.push([r, g, b]);
    }
  }
  if (points.length === 0) return [];

  // K-means clustering (few iterations)
  const centroids = initializeCentroids(points, k);
  const MAX_ITERS = 10;
  for (let it = 0; it < MAX_ITERS; it++) {
    const buckets: number[][][] = Array.from({ length: k }, () => []);
    for (const p of points) {
      const idx = nearestCentroid(p, centroids);
      buckets[idx].push(p);
    }
    for (let i = 0; i < k; i++) {
      if (buckets[i].length === 0) continue;
      const mean = [0, 0, 0];
      for (const p of buckets[i]) { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; }
      centroids[i] = [
        Math.round(mean[0] / buckets[i].length),
        Math.round(mean[1] / buckets[i].length),
        Math.round(mean[2] / buckets[i].length),
      ];
    }
  }

  // Build palette with counts
  const counts = new Array(k).fill(0);
  for (const p of points) counts[nearestCentroid(p, centroids)]++;
  const pal = centroids.map((c, i) => ({ hex: rgbToHex(c[0], c[1], c[2]), count: counts[i] }));
  // Sort by frequency, drop duplicates
  const uniq: PaletteColor[] = [];
  const seen = new Set<string>();
  for (const c of pal.sort((a, b) => b.count - a.count)) {
    if (seen.has(c.hex)) continue;
    seen.add(c.hex);
    uniq.push(c);
  }
  return uniq.slice(0, k);
}

function initializeCentroids(points: number[][], k: number): number[][] {
  const out: number[][] = [];
  const used = new Set<number>();
  while (out.length < k && used.size < points.length) {
    const idx = Math.floor(Math.random() * points.length);
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(points[idx].slice());
  }
  // If not enough distinct points, duplicate first
  while (out.length < k) out.push(points[0].slice());
  return out;
}

function nearestCentroid(p: number[], centroids: number[][]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const c = centroids[i];
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
