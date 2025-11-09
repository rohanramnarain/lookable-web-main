"use client";

// Lightweight client-only store for style config and flags

export type ChartType =
  | 'line'
  | 'area'
  | 'bar'
  | 'bar-horizontal'
  | 'scatter'
  | 'circle'
  | 'pie'
  | 'donut';

export const ALLOWED_CHART_TYPES: ChartType[] = [
  'line',
  'area',
  'bar',
  'bar-horizontal',
  'scatter',
  'circle',
  'pie',
  'donut',
];

export type StyleConfig = {
  chartType?: ChartType;
  colorPalette?: string[]; // hex colors
  legendPosition?: "top" | "right" | "bottom" | "left";
  fontSize?: number; // base font size
  grid?: boolean; // show gridlines
  background?: string; // CSS color
  strokeWidth?: number; // for line/area borders
  pointSize?: number; // for scatter/points
};

export type StylePreset = {
  chartType?: ChartType;
  // palette, legend, grid, background, etc...
};

type State = {
  styleConfig: StyleConfig | null;
  visionUsed: boolean; // whether a vision model was used for classification
  clientOnly: boolean; // whether the end-to-end run avoided server inference/fetches
};

const KEY = "lookable.style.state.v1";

let state: State = {
  styleConfig: null,
  visionUsed: false,
  clientOnly: true,
};

// Initialize from localStorage if available
try {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") state = { ...state, ...parsed };
  }
} catch {}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}

export function getStyleConfig(): StyleConfig | null {
  return state.styleConfig;
}

export function setStyleConfig(cfg: StyleConfig | null) {
  state.styleConfig = cfg;
  emit();
}

export function getFlags(): { visionUsed: boolean; clientOnly: boolean } {
  return { visionUsed: state.visionUsed, clientOnly: state.clientOnly };
}

export function setVisionUsed(v: boolean) {
  state.visionUsed = !!v;
  emit();
}

export function setClientOnly(v: boolean) {
  state.clientOnly = !!v;
  emit();
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
