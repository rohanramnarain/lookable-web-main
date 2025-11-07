"use client";
import { useEffect, useRef } from "react";

// Type-only import to avoid server bundling
type VLSpec = import("vega-embed").VisualizationSpec;
type VegaView = import("vega-embed").Result["view"];

export default function Chart({ spec }: { spec: VLSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<VegaView | null>(null);

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

  return <div ref={ref} />;
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
