"use client";

import { useEffect, useState } from "react";
import Chart from "@/components/Chart";
import { plan, ensureEngine } from "@/lib/llm";
import { isAllowedSource } from "@/lib/allowlist";
import { CATALOG, isMetricId } from "@/lib/catalog";
import { fetchWDI } from "@/lib/fetchers/worldbank";
import { fetchOpenMeteo } from "@/lib/fetchers/openmeteo";

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

/** Allowed sources -> field mapping we chart safely. */
type SourceKey = "worldbank" | "openmeteo";
function fieldMapFor(source: SourceKey) {
  if (source === "openmeteo") {
    return {
      xField: "time",
      xType: "temporal" as const,
      yField: "temperature",
      yType: "quantitative" as const,
    };
  }
  return {
    xField: "year",
    xType: "ordinal" as const,
    yField: "value",
    yType: "quantitative" as const,
  };
}

/** Build a minimal Vega-Lite spec from chart meta + fetched rows + field map. */
function compileSpec(chart: any, rows: any[], source: SourceKey) {
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

const SUGGESTIONS = [
  `US unemployment over the last 5 years`,
  `US GDP per capita since 2000`,
  `NYC temperature next 7 days`,
];

// Labels (and a typed list) for the bubble chips under the title.
const SOURCE_LABEL: Record<SourceKey, string> = {
  worldbank: "World Bank",
  openmeteo: "Open-Meteo",
};
const SOURCES: SourceKey[] = Array.from(
  new Set(Object.values(CATALOG).map((d) => d.source as SourceKey))
).filter((s): s is SourceKey => s === "worldbank" || s === "openmeteo");

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
      const sourceKey: SourceKey = def.source;

      let rows: any[] = [];
      let provenance: any = null;
      const now = new Date().getFullYear();

      if (sourceKey === "worldbank") {
        const indicator = def.dataset!;
        const merged = { ...(def.defaultParams || {}), ...(p.params || {}) };
        const country = normalizeCountry(merged.country);
        const start = safeYear(merged.start, now - 5);
        const end = safeYear(merged.end, now);

        const out = await fetchWDI(indicator, country, start, end);
        rows = out.rows;
        provenance = out.provenance;
      } else {
        const merged = { ...(def.defaultParams || {}), ...(p.params || {}) };
        const lat = Number(merged.lat ?? 40.7128);
        const lon = Number(merged.lon ?? -74.0060);

        const out = await fetchOpenMeteo(lat, lon);
        rows = out.rows;
        provenance = out.provenance;
      }

      if (!rows.length)
        throw new Error("No data returned for the selected metric/time range. Try a wider range.");

      const vl = compileSpec(p.chart || {}, rows, sourceKey);
      setSpec(vl);
      setProv(provenance);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function runNoLLM() {
    const { rows, provenance } = await fetchWDI("NY.GDP.PCAP.KD", "USA", 2000);
    const vl = compileSpec(
      { mark: "line", title: "US GDP per capita since 2000" },
      rows,
      "worldbank"
    );
    setSpec(vl);
    setProv(provenance);
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

        {/* Static, non-clickable source bubbles */}
        <div className="badges" aria-label="Supported sources">
          {SOURCES.map((key) => (
            <span key={key} className="badge">
              <span className={`dot ${key}`} aria-hidden="true" />
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
        <div className="chips" style={{ marginTop: 10 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              onClick={() => {
                setQuery(s);
              }}
              aria-label={`Use example: ${s}`}
            >
              {s}
            </button>
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
