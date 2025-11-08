"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Chart from "@/components/Chart";
import { plan, ensureEngine, chooseSource } from "@/lib/llm";
import ModelConsent from "@/components/ModelConsent";
import { isAllowedSource } from "@/lib/allowlist";
import { CATALOG, isMetricId } from "@/lib/catalog";
import { fetchWDI } from "@/lib/fetchers/worldbank";
import { fetchOpenMeteo } from "@/lib/fetchers/openmeteo";
// ✅ use server action for generic sources (OWID/BLS/EPA/Urban)
import { getDataForPlan } from "./actions";

/** Normalize common country inputs to ISO-3 for World Bank. */
function normalizeCountry(input?: unknown) {
  if (!input) return "USA";
  const s = String(input).trim().toLowerCase();
  if (
    ["us", "u.s.", "usa", "united states", "united states of america", "america"].includes(s)
  ) return "USA";
  return String(input).toUpperCase();
}

/** Ensure a sane year value. */
function safeYear(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1900 && n < 3000 ? n : fallback;
}

/** Chart field mapping modes. */
type SourceMode = "worldbank" | "openmeteo" | "generic";

/** Detect the best x-axis field for generic sources */
function detectAxis(rows: any[]): { xField: string; xType: "temporal" | "ordinal" } {
  const sample = rows.find((r) => r && typeof r === "object") || {};
  if ("date" in sample) return { xField: "date", xType: "temporal" };
  if ("year" in sample) return { xField: "year", xType: "ordinal" }; // OWID/WB often use numeric years
  if ("time" in sample) return { xField: "time", xType: "temporal" };
  return { xField: "date", xType: "temporal" };
}

/** Build a minimal Vega-Lite spec from chart meta + fetched rows + field map. */
function compileSpec(chart: any, rows: any[], source: SourceMode) {
  // Clean rows so Vega-Lite doesn’t choke on null/NaN
  const cleaned = (rows || []).filter((r) => r && (r.value == null || Number.isFinite(Number(r.value))));

  let xField: string;
  let xType: "temporal" | "ordinal";
  let yField: string = "value";
  let yType: "quantitative" = "quantitative";

  if (source === "openmeteo") {
    xField = "time";
    xType = "temporal";
    yField = "temperature"; // your Open-Meteo fetcher uses this
  } else if (source === "worldbank") {
    xField = "year";
    xType = "ordinal";
    yField = "value";
  } else {
    // Generic (OWID, BLS, EPA, Urban): detect x axis from data
    const axis = detectAxis(cleaned);
    xField = axis.xField;
    xType = axis.xType;
  }

  const mark = chart?.mark || "line";
  const title = chart?.title;

  const fallbackY =
    chart?.y?.title ??
    (typeof title === "string" ? title.replace(/^(?:[A-Z]{2,3}\s+)?/, "") : undefined) ??
    "Value";

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    ...(title ? { title } : {}),
    mark,
    encoding: {
      x: { field: xField, type: xType, title: chart?.x?.title },
      y: { field: yField, type: yType, title: fallbackY },
    },
    data: { values: cleaned },
  };
}

/** ======= Suggestions (pre-select prompts) ======= */
type SuggestionGroup = { label: string; items: string[] };

const SUGGESTION_GROUPS: SuggestionGroup[] = [
  { label: "World Bank", items: [
    "US GDP per capita since 2000",
    "Population Nigeria since 1990",
    "Inflation CPI % Germany 2010–2024",
  ]},
  { label: "Open-Meteo", items: [
    "NYC temperature next 7 days",
    "San Francisco hourly temperature tomorrow",
  ]},
  { label: "OWID", items: [
    "Life expectancy Japan since 1950",
    "CO2 emissions China since 1990",
  ]},
  { label: "BLS", items: [
    "Black unemployment in the US since 2000",
  ]},
  { label: "EPA AirData", items: [
    "Daily AQI for Los Angeles-Long Beach-Anaheim, CA in 2024",
  ]},
  { label: "Urban (NCES/IPEDS)", items: [
    "Grade 3 enrollment in DC, 2013 (NCES CCD)",
  ]},
];

/** ======= Source bubbles (dynamic from catalog) ======= */
type BubbleKey = "worldbank" | "openmeteo" | "owid" | "bls" | "epa_aqi" | "urban";

function isBubbleKey(x: unknown): x is BubbleKey {
  return ["worldbank","openmeteo","owid","bls","epa_aqi","urban"].includes(String(x));
}

const SOURCE_LABEL: Record<BubbleKey, string> = {
  worldbank: "World Bank",
  openmeteo: "Open-Meteo",
  owid: "Our World in Data",
  bls: "US BLS",
  epa_aqi: "EPA AirData",
  urban: "Urban (NCES/IPEDS)",
};

function dotStyleFor(key: BubbleKey): CSSProperties {
  const base: CSSProperties = { width: ".6rem", height: ".6rem", borderRadius: 999, display: "inline-block", marginRight: ".35rem" };
  const colors: Record<BubbleKey, string> = {
    worldbank: "#2b8a3e",
    openmeteo: "#0077b6",
    owid: "#6b5b95",
    bls: "#2a9d8f",
    epa_aqi: "#e76f51",
    urban: "#3a86ff",
  };
  return { ...base, background: colors[key] };
}

// Build visible bubbles from catalog (only allowed + known keys)
const SOURCES_BUBBLES: BubbleKey[] = Array.from(
  new Set(Object.values(CATALOG).map((d) => d.source))
).filter((s) => isAllowedSource(s) && isBubbleKey(s)) as BubbleKey[];

export default function Home() {
  const [query, setQuery] = useState("");
  const [spec, setSpec] = useState<any>(null);
  const [prov, setProv] = useState<{ source: string; url: string; license?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureEngine();
      } catch {
        /* noop */
      }
    })();
  }, []);

  async function run() {
    setError(null);
    setSpec(null);
    setProv(null);
    setLoading(true);

    try {
      // Ask the server-side chooser first (may be driven by Qwen). If it
      // returns a high-confidence metricId we use it; otherwise fallback to
      // the deterministic planner.
      let p: any = null;
      try {
        const suggestion = await chooseSource(query);
        if (suggestion && typeof suggestion.confidence === 'number' && suggestion.confidence >= 0.7 && suggestion.metricId && isMetricId(suggestion.metricId)) {
          // Merge deterministic planner params (years, country, races) into the
          // suggestion so syntactic facts from the query are not lost when the
          // chooser returns only a metricId.
          try {
            const planner = await plan(query);
            const plannerParams = (planner && (planner as any).params) || {};
            const mergedParams = { ...(plannerParams || {}), ...(suggestion.params || {}) };
            p = { metricId: suggestion.metricId, params: mergedParams, chart: {} };
          } catch (err) {
            // If planner fails for any reason, fall back to suggestion params.
            p = { metricId: suggestion.metricId, params: suggestion.params || {}, chart: {} };
          }
        }
      } catch (err) {
        /* ignore chooser errors and fallback */
      }

      if (!p) {
        p = await plan(query);
      }

      // If the plan doesn't include a country for World Bank queries, try a
      // lightweight inference using the server geo route against the raw
      // user query. This helps capture country names like "India" when the
      // deterministic planner missed them.
      let inferredCountryFromQuery: string | undefined = undefined;
      try {
        const wantsWB = String(((p || {}).metricId || "") || "").length > 0 && (CATALOG as any)[(p || {}).metricId]?.source === "worldbank";
        const hasCountry = (p && p.params && p.params.country) ? true : false;
        if (wantsWB && !hasCountry) {
          const res = await fetch(`/api/geo/iso3?q=${encodeURIComponent(query)}`, { cache: "no-store" });
          if (res.ok) {
            const j = await res.json();
            if (j && j.iso3) inferredCountryFromQuery = j.iso3;
          }
        }
      } catch (err) {
        // Don't block the flow for geo lookup failures — we'll fall back to
        // merged/default country logic below.
        inferredCountryFromQuery = undefined;
      }

  if (!isMetricId(p.metricId)) throw new Error("Planner chose an unknown metricId");
  const def = (CATALOG as any)[p.metricId];
      if (!isAllowedSource(def.source)) throw new Error("Source not allowed");
      const mode: SourceMode =
        def.source === "worldbank" ? "worldbank" :
        def.source === "openmeteo" ? "openmeteo" : "generic";

      let rows: any[] = [];
      let provenance: any = null;
      const now = new Date().getFullYear();

      if (mode === "worldbank") {
        // Use the server action to fetch World Bank data so requests are
        // executed from the server (no CORS issues) and reuse existing
        // runSource logic.
        const indicator = def.dataset!;
        const merged = {
          ...(def.defaultParams || {}),
          ...(inferredCountryFromQuery ? { country: inferredCountryFromQuery } : {}),
          ...(p.params || {}),
        };

        const out = await getDataForPlan({ metricId: p.metricId as string, params: merged });
        rows = out.rows as any[];
        provenance = out.provenance;
        const fetchedYLabel = out.yLabel ?? out.title ?? undefined;

        // Apply fetched labels into the chart meta so compileSpec can pick them up
        p.chart = { ...(p.chart || {}), y: { title: p.chart?.y?.title ?? fetchedYLabel }, title: p.chart?.title ?? out.title };
      } else if (mode === "openmeteo") {
        const merged = { ...(def.defaultParams || {}), ...(p.params || {}) };
        const lat = Number(merged.lat ?? 40.7128);
        const lon = Number(merged.lon ?? -74.0060);

        const out = await fetchOpenMeteo(lat, lon);
        rows = out.rows;
        provenance = out.provenance;
        const fetchedYLabel = out.yLabel ?? undefined;
        p.chart = { ...(p.chart || {}), y: { title: p.chart?.y?.title ?? fetchedYLabel }, title: p.chart?.title ?? undefined };
      } else {
        // ✅ Generic sources (OWID, BLS, EPA AQI, Urban) via server action (no CORS).
        const out = await getDataForPlan({ metricId: p.metricId as string, params: p.params || {} });
        rows = out.rows as any[];
        provenance = out.provenance;
        const fetchedYLabel = out.yLabel ?? out.title ?? undefined;

        if (!rows.length)
          throw new Error("No data returned for the selected metric/time range. Try a wider range.");

        // Apply fetched labels into the chart meta so compileSpec can pick them up
        p.chart = { ...(p.chart || {}), y: { title: p.chart?.y?.title ?? fetchedYLabel }, title: p.chart?.title ?? out.title };

        const vl = compileSpec(p.chart || {}, rows, "generic");
        setSpec(vl);
        setProv(provenance);
        return;
      }

      if (!rows.length)
        throw new Error("No data returned for the selected metric/time range. Try a wider range.");

      const vl = compileSpec(p.chart || {}, rows, mode);
      setSpec(vl);
      setProv(provenance);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loading && query) run();
  }

  return (
    <main className="container">
      <header className="stack" style={{ marginBottom: 12 }}>
        <h1 className="page-title">Lookable — open data only</h1>
        <p className="subtitle">Instant, no-code charts from trusted public sources.</p>

        {/* Dynamic, non-clickable source bubbles */}
        <div className="badges" aria-label="Supported sources" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SOURCES_BUBBLES.map((key) => (
            <span key={key} className="badge">
              <span style={dotStyleFor(key)} aria-hidden="true" />
              {SOURCE_LABEL[key]}
            </span>
          ))}
        </div>
      </header>

      <div style={{ marginBottom: 12 }}>
        <ModelConsent onChange={(v) => { if (v) void ensureEngine(); }} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form className="toolbar" onSubmit={submit} aria-label="Ask for a chart">
          <input
            aria-label="Ask Lookable"
            className="input"
            placeholder='Try: "US unemployment over the last 5 years"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !query}>
            {loading ? "Thinking…" : "Go"}
          </button>
        </form>

        {/* Helpful suggestions; click to fill input */}
        <div className="stack" style={{ marginTop: 10, gap: 10 }}>
          {SUGGESTION_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="chips-label" style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{g.label}</div>
              <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.items.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    onClick={() => setQuery(s)}
                    aria-label={`Use example: ${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {spec && (
        <section className="card" aria-live="polite" style={{ overflow: "hidden" }}>
          <Chart spec={spec} filename={query} prov={prov} query={query} />
        </section>
      )}

      {prov && (
        <p className="provenance" style={{ marginTop: 12 }}>
          Source:{" "}
          <a href={prov.url} target="_blank" rel="noreferrer">
            {prov.source}
          </a>
          {prov.license ? ` · License: ${prov.license}` : null}
        </p>
      )}
    </main>
  );
}
