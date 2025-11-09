"use client";

import { hasVisionConsented } from "@/lib/webllm";

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

  // Attempt to load a vision-capable web runtime (placeholder)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const webllm = await import("@mlc-ai/web-llm");
    const base = (process.env.NEXT_PUBLIC_VISION_MODEL_BASE_URL as string) || "/models/vision";
    const b = String(base || "/models/vision");
    const manifestUrl = (b.endsWith("/") ? b : b + "/") + "manifest.json";
    const r = await fetch(manifestUrl, { cache: "no-store" });
    if (!r.ok) return null;
    const manifest = await r.json();
    // In a real integration you'd create/init the engine with vision support here.
    visionEngine = { runtime: webllm, manifest };
    return visionEngine;
  } catch {
    return null;
  }
}

/**
 * Attempt to classify the chart type using a client-side vision model.
 * Returns null if the engine is unavailable or if inference fails.
 */
export async function classifyWithVision(img: HTMLImageElement | HTMLCanvasElement): Promise<{ chartType: "line"|"area"|"bar"|"scatter"; confidence: number } | null> {
  const eng = await ensureVisionEngine();
  if (!eng) return null;

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

    // Placeholder prompt: a real integration would use the engine's multimodal API.
    // We do NOT claim success here; return null to force heuristic fallback until wired.
    void dataUrl; // keep linter happy
    return null;
  } catch {
    return null;
  }
}
