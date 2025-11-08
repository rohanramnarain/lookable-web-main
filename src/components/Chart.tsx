"use client";
import { useEffect, useRef } from "react";

// Type-only import to avoid server bundling
type VLSpec = import("vega-embed").VisualizationSpec;
type VegaView = import("vega-embed").Result["view"];

export default function Chart({ spec, filename, prov, query }: { spec: VLSpec; filename?: string; prov?: { source: string; url: string; license?: string } | null; query?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<VegaView | null>(null);

  function handleDownloadCsv() {
    try {
      const rows = extractRowsFromSpec(spec as any);
      const name = (filename || fileNameFromSpec(spec as any) || "data").slice(0, 200);
      const csv = toCsv(rows, { title: spec?.title, query, provenance: prov });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    let disposed = false;

    (async () => {
      if (!ref.current) return;

      const { default: embed } = await import("vega-embed");

      // Patch spec before embedding: add color/legend if 'series' exists, and y-axis title.
      const patched = patchAll(clone(spec));

      const result = await embed(ref.current, patched, {
        actions: { source: true, export: true },
      });

      // Add a custom "Download CSV" action next to Vega's built-in actions.
      try {
        const actionsEl = ref.current.querySelector?.(".vega-actions");
        if (actionsEl) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "vega-action";
          btn.title = "Download data as CSV";
          btn.innerText = "CSV";
          btn.onclick = () => {
            try {
              const rows = extractRowsFromSpec(patched as any);
              const name = (filename || fileNameFromSpec(patched as any) || "data").slice(0, 200);
              const csv = toCsv(rows, { title: patched?.title, query, provenance: prov });
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${name}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } catch (e) {
              // ignore
            }
          };
          actionsEl.appendChild(btn);
        }
      } catch (e) {
        /* no-op if DOM structure differs */
      }

      if (disposed) {
        result?.view?.finalize();
        return;
      }
      viewRef.current = result.view;
    })();

    return () => {
      disposed = true;
      viewRef.current?.finalize();
      viewRef.current = null;
    };
  }, [spec]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button type="button" onClick={handleDownloadCsv} className="btn btn-sm">
          Download CSV
        </button>
      </div>
      <div ref={ref} />
    </div>
  );
}

function clone<T>(x: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(x)
    : JSON.parse(JSON.stringify(x));
}

function patchAll(s: VLSpec): VLSpec {
  let out = patchYAxisTitle(s);
  out = patchColorLegend(out);
  return out;
}

/** Ensure y-axis has a friendly title (not "value"). Handles single & layered specs. */
function patchYAxisTitle(s: VLSpec): VLSpec {
  const anySpec: any = s as any;
  const layers: any[] = Array.isArray(anySpec.layer) ? anySpec.layer : [anySpec];

  for (const sp of layers) {
    const y = sp?.encoding?.y;
    const currentTitle: string | undefined =
      (typeof y === "object" && y?.title) ||
      (typeof y === "object" && typeof y.axis === "object" && y.axis?.title) ||
      undefined;

    // If already set to something other than "value", leave it alone
    if (currentTitle && !/^(value|values?)$/i.test(currentTitle.trim())) continue;

    const fromMeta =
      sp?.meta?.yLabel ||
      sp?.usermeta?.yLabel ||
      anySpec?.meta?.yLabel ||
      anySpec?.usermeta?.yLabel ||
      (anySpec as any).yLabel;

    const yField =
      typeof y === "object" && typeof y.field === "string" ? y.field : undefined;

    const fromField =
      yField && !/^(value|values?)$/i.test(yField) ? prettify(yField) : undefined;

    const fromTitle = inferFromTitle(anySpec?.title);

    const candidate =
      fromMeta || (fromField ?? fromTitle) || fromTitle || "Value";

    // Write the title back
    if (typeof y === "object") {
      sp.encoding = {
        ...sp.encoding,
        y: { ...y, title: candidate, axis: { ...(y.axis ?? {}), title: candidate } },
      };
    } else {
      sp.encoding = { ...(sp.encoding ?? {}), y: { title: candidate, axis: { title: candidate } } };
    }
  }

  return anySpec;
}

/** If data has a 'series' field but encoding.color is missing, add color + legend. */
function patchColorLegend(s: VLSpec): VLSpec {
  const anySpec: any = s as any;
  const layers: any[] = Array.isArray(anySpec.layer) ? anySpec.layer : [anySpec];

  const RACES = new Set(["White", "Black", "Asian", "Hispanic"]);

  const hasSeriesInValues = (specPart: any) => {
    const vals = specPart?.data?.values;
    if (Array.isArray(vals) && vals.length) {
      // check a handful of rows to avoid scanning huge arrays
      const sample = vals.slice(0, Math.min(8, vals.length));
      return sample.some((r: any) => r && typeof r === "object" && "series" in r);
    }
    return false;
  };

  for (const sp of layers) {
    const enc = sp?.encoding ?? {};
    const hasColor = !!enc.color;
    const hasSeriesField = !!(enc?.color?.field === "series" || enc?.detail?.field === "series" || enc?.tooltip?.some?.((t: any) => t.field === "series"));

    if (!hasColor && (hasSeriesField || hasSeriesInValues(sp))) {
      const sampleVals = Array.isArray(sp?.data?.values) ? sp.data.values.slice(0, 12) : [];
      const seriesVals = new Set<string>();
      for (const r of sampleVals) if (r?.series) seriesVals.add(String(r.series));
      const allAreRaces = [...seriesVals].every(v => RACES.has(v));

      sp.encoding = {
        ...enc,
        color: {
          field: "series",
          type: "nominal",
          title: allAreRaces ? "Race" : "Series",
        },
        tooltip: enc.tooltip ?? [
          { field: "series", type: "nominal", title: allAreRaces ? "Race" : "Series" },
          { field: "date", type: "temporal", title: "Date" },
          { field: "value", type: "quantitative", title: "Value" },
        ],
      };
    }
  }

  return anySpec;
}

function prettify(field: string): string {
  return field.replace(/[_\-.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** e.g., "US GDP per Capita" -> "GDP per Capita" */
function inferFromTitle(title: any): string | undefined {
  const t = typeof title === "string" ? title : title?.text;
  if (!t) return undefined;
  const m = t.match(/^(?:[A-Z]{2,3}\s+)?(.+)$/);
  return m ? m[1] : undefined;
}

function extractRowsFromSpec(spec: any): any[] {
  if (!spec) return [];
  const out: any[] = [];
  const pushVals = (vals: any) => {
    if (Array.isArray(vals)) out.push(...vals);
  };

  if (Array.isArray(spec.layer)) {
    for (const l of spec.layer) {
      if (l?.data?.values) pushVals(l.data.values);
      else if (spec?.data?.values) pushVals(spec.data.values);
    }
  } else if (spec?.data?.values) {
    pushVals(spec.data.values);
  }

  // Deduplicate rows by JSON representation to avoid repeats across layers
  const seen = new Set<string>();
  const uniq: any[] = [];
  for (const r of out) {
    try {
      const k = JSON.stringify(r);
      if (!seen.has(k)) {
        seen.add(k);
        uniq.push(r);
      }
    } catch {
      // fallback: include if stringify fails
      uniq.push(r);
    }
  }
  return uniq;
}

function toCsv(rows: any[], opts?: { title?: any; query?: string; provenance?: any }): string {
  if (!rows || !rows.length) {
    // Still emit metadata if available
    const metaLines: string[] = [];
    if (opts?.query) metaLines.push(`# Query: ${opts.query}`);
    if (opts?.title) metaLines.push(`# Title: ${String(opts.title)}`);
    if (opts?.provenance?.source) metaLines.push(`# Source: ${opts.provenance.source}`);
    if (opts?.provenance?.url) metaLines.push(`# URL: ${opts.provenance.url}`);
    return metaLines.join("\n");
  }

  // Collect headers (union of keys, preserving order from first row)
  const first = rows[0] || {};
  const headers = Object.keys(first);
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!headers.includes(k)) headers.push(k);
    }
  }

  const friendly: Record<string, string> = {
    year: "Year",
    date: "Date",
    time: "Time",
    value: "Value",
    series: "Series",
  };

  const headerNames = headers.map((h) => friendly[h] ?? prettify(h));

  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const metaLines: string[] = [];
  if (opts?.query) metaLines.push(`# Query: ${opts.query}`);
  if (opts?.title) metaLines.push(`# Title: ${String(opts.title)}`);
  if (opts?.provenance?.source) metaLines.push(`# Source: ${opts.provenance.source}`);
  if (opts?.provenance?.url) metaLines.push(`# URL: ${opts.provenance.url}`);

  const lines = [] as string[];
  if (metaLines.length) {
    lines.push(...metaLines);
    lines.push("");
  }

  lines.push(headerNames.join(","));
  for (const r of rows) {
    const row = headers.map((h) => escape((r as any)[h]));
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function fileNameFromSpec(spec: any): string | undefined {
  const t = spec?.title || (spec?.title && spec.title?.text) || undefined;
  if (!t) return undefined;
  return String(t).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
