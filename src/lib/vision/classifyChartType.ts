"use client";

import { ALLOWED_CHART_TYPES, ChartType } from '@/lib/state/style';
import { classifyWithVision, classifyWithVisionEndpoint } from '@/lib/vision/engine';

// Heuristic-only baseline; if/when vision is enabled, this module will first
// attempt a VL classification then fall back to these heuristics.
type VisionResult = { chartType: ChartType; confidence: number; hasGrid?: boolean };

export async function classifyChartType(opts: {
  image?: HTMLImageElement | HTMLCanvasElement | ImageData | undefined;
  visionAllowed: boolean;
}): Promise<{ chartType: ChartType; confidence: number; usedVision: boolean; hasGrid?: boolean }> {
  // Vision-only classification: no heuristic fallback.
  // If the vision engine is unavailable or abstains, we return usedVision=false
  // and a neutral confidence; callers should NOT change chart type in that case.
  const { image, visionAllowed } = opts || {};

  if (visionAllowed && image && typeof window !== 'undefined') {
    const isCanvas = typeof (image as any).getContext === 'function';
    const isImg = (image as any).tagName === 'IMG';
    if (isCanvas || isImg) {
      // Prefer local HTTP endpoint if configured
      try {
        const ep = await classifyWithVisionEndpoint(image as any) as VisionResult | null;
        if (ep && ALLOWED_CHART_TYPES.includes(ep.chartType as ChartType)) {
          return {
            chartType: ep.chartType as ChartType,
            confidence: ep.confidence ?? 0.8,
            usedVision: true,
            hasGrid: ep.hasGrid,
          };
        }
      } catch {}
      // Otherwise try in-browser WebLLM engine
      try {
        const r = await classifyWithVision(image as any) as VisionResult | null;
        if (r && ALLOWED_CHART_TYPES.includes(r.chartType as ChartType)) {
          return {
            chartType: r.chartType as ChartType,
            confidence: r.confidence ?? 0.8,
            usedVision: true,
            hasGrid: r.hasGrid,
          };
        }
      } catch {}
    }
  }

  // Abstain: return a placeholder chartType but usedVision=false; caller should ignore.
  return { chartType: 'line', confidence: 0, usedVision: false };
}
