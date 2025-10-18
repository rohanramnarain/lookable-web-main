"use client";

import * as webllm from "@mlc-ai/web-llm";
import { PlanSchema } from "./schema";
import { METRIC_IDS } from "./catalog";
import type { MetricId } from "./catalog";

let engine: webllm.MLCEngineInterface | null = null;
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

export async function ensureEngine() {
  if (engine) return engine;
  engine = await webllm.CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (p) => console.log(p.text),
  });
  return engine;
}

/* -------------------- utils -------------------- */

function parseFirstJsonObject(raw: string) {
  const s = raw.trim();
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { esc = c === "\\" ? !esc : false; if (c === '"' && !esc) inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { if (start === -1) start = i; depth++; }
    if (c === "}") { depth--; if (depth === 0 && start !== -1) return JSON.parse(s.slice(start, i + 1)); }
  }
  return JSON.parse(s);
}

function toISO3FromQuery(q: string): string | undefined {
  const s = q.toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/\b(united states|u\.?s\.?a?|america)\b/, "USA"],
    [/\bnigeria|nga\b/, "NGA"],
    [/\bcanada|can\b/, "CAN"],
    [/\bindia|ind\b/, "IND"],
    [/\b(united kingdom|u\.?k\.?|great britain|gbr|england)\b/, "GBR"],
    [/\bgermany|deu\b/, "DEU"],
    [/\bfrance|fra\b/, "FRA"]
  ];
  for (const [re, code] of map) if (re.test(s)) return code;
  const iso3 = s.match(/\b[A-Z]{3}\b/);
  return iso3 ? iso3[0] : undefined;
}

/** Inclusive year extraction with clamping & fixes.
 *  - "2008-2024" → start=2008, end=2024
 *  - "since 1990" → start=1990, end=now
 *  - "last 17 years" → start=now-16, end=now  (inclusive)
 *  - "this year" → start=end=now
 */
function extractYearsInclusive(q: string): { start?: number; end?: number } {
  const now = new Date().getFullYear();
  const s = q.toLowerCase();

  // Explicit range
  const range = s.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (range) {
    let a = Number(range[1]), b = Number(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return {};
    // Fix inverted & clamp to now
    if (a > b) [a, b] = [b, a];
    b = Math.min(b, now);
    return { start: a, end: b };
  }

  // Since YEAR
  const since = s.match(/since\s+(\d{4})/);
  if (since) {
    const a = Number(since[1]);
    if (Number.isFinite(a)) return { start: a, end: now };
  }

  // Last N years (inclusive)
  const last = s.match(/last\s+(\d+)\s+years?/);
  if (last) {
    const n = Number(last[1]);
    if (Number.isFinite(n) && n > 0) {
      const end = now;
      const start = now - (n - 1); // inclusive range
      return { start, end };
    }
  }

  // "past couple/few of years"
  if (/\bpast\s+(couple|few)\s+of\s+years\b/.test(s)) {
    const n = /couple/.test(s) ? 2 : 3;
    const end = now;
    const start = now - (n - 1);
    return { start, end };
  }

  // "this year"
  if (/\bthis year\b/.test(s)) return { start: now, end: now };

  return {};
}

function extractLatLon(q: string): { lat?: number; lon?: number } {
  const m = q.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return {};
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

/* ---------- keyword scoring & ordering ---------- */

function scoreMetrics(query: string): Record<MetricId, number> {
  const q = query.toLowerCase();
  const s: Record<MetricId, number> = {
    unemployment_rate: 0,
    gdp_per_capita: 0,
    inflation_cpi_pct: 0,
    population_total: 0,
    temp_hourly: 0
  };

  const add = (id: MetricId, n = 1) => (s[id] += n);
  if (/\bunemployment|jobless\b/.test(q)) add("unemployment_rate", 5);
  if (/\bpopulation|pop\b/.test(q)) add("population_total", 5);
  if (/\binflation|cpi\b/.test(q)) add("inflation_cpi_pct", 5);
  if (/\bgdp per capita|gdp pc|income per capita\b/.test(q)) add("gdp_per_capita", 5);
  if (/\btemperature|temp|°c|°f\b/.test(q)) add("temp_hourly", 5);

  const { lat, lon } = extractLatLon(query);
  if (typeof lat === "number" && typeof lon === "number") add("temp_hourly", 3);

  if (/since \d{4}|last \d+ years?|\d{4}\s*[-–]\s*\d{4}|this year/.test(q)) {
    add("unemployment_rate", 1);
    add("gdp_per_capita", 1);
    add("inflation_cpi_pct", 1);
    add("population_total", 1);
  }

  return s;
}

function orderedCandidates(query: string): MetricId[] {
  const scores = scoreMetrics(query);
  const base = [...METRIC_IDS] as MetricId[];
  base.sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  return base;
}

/* ---------- deterministic fallback classifier ---------- */

type FallbackPlan = {
  metricId: MetricId;
  params?: Record<string, string | number>;
  chart?: { mark: "line" | "bar" | "area" | "point"; title?: string; x?: any; y?: any };
  note?: string;
};

function classifyQueryFallback(query: string): FallbackPlan {
  const q = query.toLowerCase();
  const { start, end } = extractYearsInclusive(q);

  if (/\b(temp|temperature|°c|°f)\b/.test(q)) {
    const { lat, lon } = extractLatLon(query);
    return {
      metricId: "temp_hourly",
      params: { lat: lat ?? 40.7128, lon: lon ?? -74.0060 },
      chart: { mark: "line", title: "Hourly Temperature" }
    };
  }

  if (/\bpopulation\b/.test(q)) {
    return {
      metricId: "population_total",
      params: { country: toISO3FromQuery(q) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Population" }
    };
  }

  if (/\bunemployment|jobless\b/.test(q)) {
    return {
      metricId: "unemployment_rate",
      params: { country: toISO3FromQuery(q) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Unemployment Rate" }
    };
  }

  if (/\binflation|cpi\b/.test(q)) {
    return {
      metricId: "inflation_cpi_pct",
      params: { country: toISO3FromQuery(q) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Inflation (CPI %)" }
    };
  }

  if (/\bgdp\b/.test(q) && /\bper capita|pc\b/.test(q)) {
    return {
      metricId: "gdp_per_capita",
      params: { country: toISO3FromQuery(q) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "GDP per Capita" }
    };
  }

  // Default safety net
  return {
    metricId: "gdp_per_capita",
    params: { country: toISO3FromQuery(q) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
    chart: { mark: "line", title: "GDP per Capita" }
  };
}

function strongIntentMetric(query: string): MetricId | undefined {
  const s = scoreMetrics(query);
  const best = (Object.keys(s) as MetricId[]).sort((a, b) => s[b] - s[a])[0];
  return s[best] >= 5 ? best : undefined; // strong signal threshold
}

/* -------------------- prompting -------------------- */

function buildSystemPrompt(candidates: MetricId[]) {
  const list = candidates.map((id) => `"${id}"`).join(", ");
  return `
You are a data-viz planner restricted to public, allowed sources only.
Pick exactly one metricId from this ORDERED candidate list (most relevant first):
[${list}]

Return STRICT JSON (no prose, no code fences) with:
- metricId: one of [${list}]
- params: object (optional). For World Bank: { country?, start?, end? }. For Open-Meteo: { lat?, lon? }.
- chart: { mark, title?, x?, y? }  // small meta only

Never include data arrays or Vega-Lite; keep it concise.
`;
}

const FEWSHOTS: Array<{ role: "user" | "assistant"; content: string }> = [
  {
    role: "user",
    content: "Nigeria population since 1990"
  },
  {
    role: "assistant",
    content: JSON.stringify({
      metricId: "population_total",
      params: { country: "NGA", start: 1990 },
      chart: { mark: "line", title: "Nigeria Population since 1990" }
    })
  },
  {
    role: "user",
    content: "Hourly temperature for 40.7,-74.0 today"
  },
  {
    role: "assistant",
    content: JSON.stringify({
      metricId: "temp_hourly",
      params: { lat: 40.7, lon: -74.0 },
      chart: { mark: "line", title: "Hourly Temperature" }
    })
  }
];

/* -------------------- main planner -------------------- */

export async function plan(query: string) {
  // Deterministic intent & ordered candidates
  const baseline = classifyQueryFallback(query);
  const candidates = orderedCandidates(query);
  const userYears = extractYearsInclusive(query);
  const now = new Date().getFullYear();

  // 1) Try the local LLM with ordered candidates + few-shots
  try {
    const eng = await ensureEngine();
    const req: webllm.ChatCompletionRequest = {
      messages: [
        { role: "system", content: buildSystemPrompt(candidates) },
        ...FEWSHOTS,
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" },
      temperature: 0.05,
      max_tokens: 280
    };
    const out = await eng.chat.completions.create(req);
    const text = out.choices?.[0]?.message?.content || "{}";
    const parsed = parseFirstJsonObject(text);

    const result = PlanSchema.safeParse(parsed);
    if (result.success) {
      let llmPlan = { ...result.data };

      // Gate with strong intent: if LLM disagrees with clear keywords, use baseline.
      const strong = strongIntentMetric(query);
      if (strong && llmPlan.metricId !== strong) {
        return PlanSchema.parse(baseline);
      }

      // ---- YEAR SANITIZATION (override with user intent) ----
      llmPlan.params = { ...(llmPlan.params || {}) };

      if (typeof userYears.start === "number") llmPlan.params.start = userYears.start;
      if (typeof userYears.end === "number") llmPlan.params.end = userYears.end;

      // Clamp end ≤ now, fix inverted ranges
      if (typeof llmPlan.params.end === "number") {
        llmPlan.params.end = Math.min(now, Math.floor(llmPlan.params.end));
      }
      if (typeof llmPlan.params.start === "number" && typeof llmPlan.params.end === "number") {
        if (llmPlan.params.start > llmPlan.params.end) {
          const a = llmPlan.params.start;
          llmPlan.params.start = llmPlan.params.end;
          llmPlan.params.end = a;
        }
      }

      return PlanSchema.parse(llmPlan);
    }

    console.warn("Planner JSON failed validation; falling back. Issues:", result.error.issues);
  } catch (e) {
    console.warn("LLM planning failed; falling back.", e);
  }

  // 2) Fallback: deterministic so the app never breaks (already inclusive & clamped)
  return PlanSchema.parse(baseline);
}
