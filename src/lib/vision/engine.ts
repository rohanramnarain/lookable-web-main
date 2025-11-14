"use client";

import { hasVisionConsented } from "@/lib/webllm";
import { ALLOWED_CHART_TYPES, type ChartType } from "@/lib/state/style";

let visionEngine: any | null = null;

export function visionEnabledByEnv(): boolean {
  try {
    const v = (process.env.NEXT_PUBLIC_ENABLE_VISION_STYLE as string | undefined) ?? "";
    return /^(1|true|yes|on)$/i.test(v);
  } catch {
    return false;
  }
}

export async function ensureVisionEngine(): Promise<any | null> {
  if (visionEngine) return visionEngine;
  if (typeof window === "undefined") return null;
  if (!visionEnabledByEnv()) return null;
  if (!hasVisionConsented()) return null;

  try {
    // Dynamically load web-llm runtime
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const webllm: any = await import("@mlc-ai/web-llm");
    const base = (process.env.NEXT_PUBLIC_VISION_MODEL_BASE_URL as string) || "/models/vision";
    const modelId = (process.env.NEXT_PUBLIC_VISION_MODEL_ID as string) || "Qwen2.5-VL-7B-Instruct";
    const b = base.endsWith("/") ? base : base + "/";
    const manifestUrl = b + "manifest.json";
    let manifest: any = null;
    try {
      const resp = await fetch(manifestUrl, { cache: "no-store" });
      if (resp.ok) manifest = await resp.json();
    } catch {}

    // Attempt to construct an engine if CreateMLCEngine is exposed. Fallback to runtime only.
    let engineInstance: any = null;
    try {
      if (webllm.CreateMLCEngine) {
        engineInstance = await webllm.CreateMLCEngine({
          model: modelId,
          baseUrl: b, // base path for weights (convention; adjust if different)
        });
      }
    } catch (err) {
      // swallow; we'll use a lightweight wrapper instead
    }

    visionEngine = {
      runtime: webllm,
      manifest,
      engineInstance,
      async generate(prompt: string): Promise<string> {
        // Prefer engineInstance chat API if available
        try {
          if (engineInstance && engineInstance.chat && engineInstance.chat.completions) {
            const completion = await engineInstance.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              temperature: 0,
            });
            const text = completion?.choices?.[0]?.message?.content; // API shape may vary
            if (typeof text === "string") return text;
          }
        } catch {}
        // Fallback: some versions expose engineInstance.generate or runtime.generate
        try {
          if (engineInstance && typeof engineInstance.generate === 'function') {
            const out = await engineInstance.generate(prompt);
            return typeof out === 'string' ? out : JSON.stringify(out);
          }
        } catch {}
        // Last resort: return empty
        return "";
      }
    };
    return visionEngine;
  } catch {
    return null;
  }
}

/**
 * Attempt to classify the chart type using a client-side vision model.
 * Returns null if the engine is unavailable or if inference fails.
 */
export async function classifyWithVision(img: HTMLImageElement | HTMLCanvasElement): Promise<{ chartType: "line"|"area"|"bar"|"bar-horizontal"|"scatter"|"circle"|"pie"|"donut"; confidence: number; hasGrid?: boolean } | null> {
  const eng = await ensureVisionEngine();
  if (!eng) return null; // engine unavailable or consent/flag off

  try {
    // Convert image to data URL to pass to the engine as prompt context.
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const w = Math.min(512, (img as any).width || 512);
    const h = Math.min(512, (img as any).height || 512);
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    ctx.drawImage(img as any, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");

    // Build a prompt instructing the model to classify the chart strictly.
    const prompt = `You are a vision model that classifies chart images. Allowed chart types: line, area, bar, bar-horizontal, scatter, circle, pie, donut. Also detect whether the main plot area has visible gridlines (horizontal or vertical guide lines). Return ONLY strict JSON: {"chartType":"one of allowed","confidence":0.xx,"hasGrid":true/false}. Confidence 0-1. If uncertain return {"chartType":"unknown","confidence":0,"hasGrid":false}.`;

    // Some web-llm builds allow image URLs in the prompt; if not, this serves as a placeholder.
    const combinedPrompt = `${prompt}\nIMAGE_DATA_URL_BEGIN\n${dataUrl}\nIMAGE_DATA_URL_END`;

    const raw = await eng.generate(combinedPrompt);
    if (typeof raw === 'string' && raw.trim()) {
      // Extract JSON block
      const m = raw.match(/\{[^]*\}/);
      if (m) {
        try {
          const obj = JSON.parse(m[0]);
          const ct = String(obj.chartType || '').toLowerCase();
          const confNum = typeof obj.confidence === 'number' ? obj.confidence : 0;
          const hasGrid = typeof obj.hasGrid === 'boolean' ? obj.hasGrid : undefined;
          const allowed = ["line","area","bar","bar-horizontal","scatter","circle","pie","donut"];
          if (allowed.includes(ct) && confNum > 0) {
            return { chartType: ct as any, confidence: Math.min(Math.max(confNum,0),1), hasGrid };
          }
          if (ct === 'unknown' || confNum === 0) return null; // abstain
        } catch {}
      }
    }
    // Abstain if parse failed
    return null;
  } catch {
    return null;
  }
}

function getVisionEndpoint(): string | null {
  // 1. Build-time inline env (requires Next.js restart if changed)
  try {
    const v = process.env.NEXT_PUBLIC_VISION_ENDPOINT as string | undefined;
    if (v && v.trim()) return v.trim();
  } catch {}

  // 2. Dev-time overrides without restart
  try {
    if (typeof window !== 'undefined') {
      const ls = window.localStorage?.getItem('VISION_ENDPOINT') || window.localStorage?.getItem('NEXT_PUBLIC_VISION_ENDPOINT');
      if (ls && ls.trim()) return ls.trim();
      const anyWin = window as any;
      const winVal = typeof anyWin.VISION_ENDPOINT === 'string' ? anyWin.VISION_ENDPOINT : null;
      if (winVal && winVal.trim()) return winVal.trim();
    }
  } catch {}

  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[vision] No vision endpoint configured');
  }
  return null;
}

async function canvasFrom(img: HTMLImageElement | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if ((img as HTMLCanvasElement).getContext) return img as HTMLCanvasElement;
  const c = document.createElement("canvas");
  const w = Math.min(1024, (img as HTMLImageElement).naturalWidth || (img as any).width || 512);
  const h = Math.min(1024, (img as HTMLImageElement).naturalHeight || (img as any).height || 512);
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext("2d");
  if (ctx) ctx.drawImage(img as any, 0, 0, c.width, c.height);
  return c;
}

export async function classifyWithVisionEndpoint(img: HTMLImageElement | HTMLCanvasElement): Promise<{ chartType: ChartType; confidence: number; hasGrid?: boolean } | null> {
  const ep = getVisionEndpoint();
  if (!ep || typeof window === "undefined") return null;
  try {
    const c = await canvasFrom(img);
    const blob: Blob = await new Promise((resolve) => c.toBlob((b) => resolve(b || new Blob()), "image/png", 0.92));
    const form = new FormData();
    form.append("file", blob, "chart.png");
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[vision] POST', ep, '(~image/png)');
    }
    const res = await fetch(ep, { method: "POST", body: form });
    if (!res.ok) return null;
    const js = await res.json();
    const ct = typeof js.chartType === "string" ? (js.chartType as string).toLowerCase() : "";
    const conf = typeof js.confidence === "number" ? js.confidence : 0;
    const hasGrid = typeof js.hasGrid === "boolean" ? js.hasGrid : undefined;
    if (ALLOWED_CHART_TYPES.includes(ct as ChartType) && conf > 0) {
      return { chartType: ct as ChartType, confidence: Math.min(Math.max(conf, 0), 1), hasGrid };
    }
    return null;
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[vision] Endpoint classification failed');
    }
    return null;
  }
}
