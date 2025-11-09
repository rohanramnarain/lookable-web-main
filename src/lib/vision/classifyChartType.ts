"use client";

import type { ChartType } from "../state/style";
import { classifyWithVision, visionEnabledByEnv } from "./engine";
import { hasVisionConsented } from "@/lib/webllm";

export type Classification = {
  chartType: Exclude<ChartType, "bar-horizontal"> | "bar"; // orientation handled separately
  confidence: number; // 0..1
  usedVision: boolean; // whether a vision model was invoked
  note?: string; // debug info
};

// Allowed set for prompts / validation
export const ALLOWED_TYPES: Array<Classification["chartType"]> = [
  "line",
  "area",
  "bar",
  "scatter",
];

/**
 * Heuristic classifier placeholder. Does NOT use a vision model.
 * Returns a low-confidence guess and marks usedVision=false.
 * You can later plug in a Qwen-VL call and keep this as fallback.
 */
export async function classifyChartTypeFromHeuristics(imgEl: HTMLImageElement | HTMLCanvasElement): Promise<Classification> {
  try {
    // Simple heuristic: analyze edge orientation via Sobel-like gradient on a downscaled canvas.
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no ctx");

    const w = 256, h = 256;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(imgEl as any, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Compute simple gradients and histogram of orientations
    let vert = 0, horiz = 0, diag = 0;
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const i = (y * w + x) * 4;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const lumR = (data[i + 4] + data[i + 5] + data[i + 6]) / 3;
        const lumD = (data[i + w * 4] + data[i + w * 4 + 1] + data[i + w * 4 + 2]) / 3;
        const dx = lumR - lum;
        const dy = lumD - lum;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (ady > adx * 1.5) vert++;
        else if (adx > ady * 1.5) horiz++;
        else diag++;
      }
    }

    // Naive rules: many vertical edges -> bars; many diagonal -> line/area; else scatter
    let chartType: Classification["chartType"] = "line";
    let confidence = 0.4;
    if (vert > horiz * 1.2 && vert > diag * 1.1) {
      chartType = "bar";
      confidence = 0.55;
    } else if (diag > vert * 1.1 && diag > horiz * 1.1) {
      chartType = "line";
      confidence = 0.5;
    } else if (horiz > vert * 1.2) {
      // Horizontal bands might still be bars; keep as bar with low confidence
      chartType = "bar";
      confidence = 0.45;
    } else {
      chartType = "scatter";
      confidence = 0.4;
    }

    return { chartType, confidence, usedVision: false, note: `heuristics v1: v=${vert} h=${horiz} d=${diag}` };
  } catch (e) {
    return { chartType: "line", confidence: 0.3, usedVision: false, note: "heuristic error" };
  }
}

/**
 * Unified classifier entry: currently uses heuristics only.
 * Later, if a client vision model is available and user consented, call it here,
 * validate against ALLOWED_TYPES, and fallback to heuristics on error/low confidence.
 */
export async function classifyChartType(imgEl: HTMLImageElement | HTMLCanvasElement): Promise<Classification> {
  try {
    if (visionEnabledByEnv() && hasVisionConsented()) {
      const out = await classifyWithVision(imgEl);
      if (out && out.chartType && ALLOWED_TYPES.includes(out.chartType)) {
        return { chartType: out.chartType, confidence: out.confidence ?? 0.5, usedVision: true, note: "vision" };
      }
    }
  } catch {}
  // Fallback to heuristics
  return classifyChartTypeFromHeuristics(imgEl);
}
