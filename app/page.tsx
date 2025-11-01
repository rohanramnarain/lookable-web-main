"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Chart from "@/components/Chart";
import { plan, ensureEngine } from "@/lib/llm";
import { isAllowedSource } from "@/lib/allowlist";
import { CATALOG, isMetricId } from "@/lib/catalog";
import { fetchWDI } from "@/lib/fetchers/worldbank";
import { fetchOpenMeteo } from "@/lib/fetchers/openmeteo";
import { runSource } from "@/lib/runSource";

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

function fieldMapFor(source: SourceMode) {
  if (source === "openmeteo") {
    return { xField: "time", xType: "temporal" as const, yField: "temperature", yType: "quantitative" as const };
  }
  if (source === "worldbank") {
    return { xField: "year", xType: "ordinal" as const, yField: "value", yType: "quantitative" as const };
  }
  // generic timeseries (OWID, BLS, EPA, Urban) use ISO date
  return { xField: "date", xType: "temporal" as const, yField: "value", yType: "quantitative" as const };
}

/** Build a minimal Vega-Lite spec from chart meta + fetched rows + field map. */
function compileSpec(chart: any, rows: any[], source: SourceMode) {
  const { xField, xType, yField, yType } = fieldMapFor(source);
  const mark = chart?.mark || "line";
  const title = chart?.title;

  const fallbackY = chart?.y?.title
    ?? (typeof title === 'string' ? title.replace(/^(?:[A-Z]{2,3}\s+)?/, '') : undefined)
    ?? 'Value';

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    ...(title ? { title } : {}),
    mark,
    encoding: {
      x: { field: xField, type: xType, title: chart?.x?.title },
      y: { field: yField, type: yType, title: fallbackY },
    },
    data: { values: rows },
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
    "Life expectancy Japan vs United States since 1950",
    "CO2 emissions World and China since 1990",
  ]},
  { label: "BLS", items: [
    "Unemployment rate by race in the US since 2000",
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
      const p = await plan(query);

      if (!isMetricId(p.metricId)) throw new Error("Planner chose an unknown metricId");
      const def = CATALOG[p.metricId];
      if (!isAllowedSource(def.source)) throw new Error("Source not allowed");
      const mode: SourceMode = def.source === "worldbank" ? "worldbank" : (def.source === "openmeteo" ? "openmeteo" : "generic");

      let rows: any[] = [];
      let provenance: any = null;
      const now = new Date().getFullYear();

      if (mode === "worldbank") {
        const indicator = def.dataset!;
        const merged = { ...(def.defaultParams || {}), ...(p.params || {}) };
        const country = normalizeCountry(merged.country);
        const start = safeYear(merged.start, now - 5);
        const end = safeYear(merged.end, now);

        const out = await fetchWDI(indicator, country, start, end);
        rows = out.rows;
        provenance = out.provenance;
      } else if (mode === "openmeteo") {
        const merged = { ...(def.defaultParams || {}), ...(p.params || {}) };
        const lat = Number(merged.lat ?? 40.7128);
        const lon = Number(merged.lon ?? -74.0060);

        const out = await fetchOpenMeteo(lat, lon);
        rows = out.rows;
        provenance = out.provenance;
      } else {
        // Generic sources (OWID, BLS, EPA AQI, Urban)
        const out = await runSource(p.metricId as any, p.params || {});
        rows = out.rows;
        provenance = out.provenance;
        // Use generic mode for field mapping
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
          <Chart spec={spec} />
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
