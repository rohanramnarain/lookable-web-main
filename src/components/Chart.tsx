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

      // Patch y-axis title before embedding
      const patched = patchYAxisTitle(clone(spec));

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

function prettify(field: string): string {
  return field.replace(/[_\-.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** e.g., "US GDP per Capita" -> "GDP per Capita" */
function inferFromTitle(title: any): string | undefined {
  const t = typeof title === "string" ? title : title?.text;
  if (!t) return undefined;
  // Drop leading 2–3 letter country codes like "US"
  const m = t.match(/^(?:[A-Z]{2,3}\s+)?(.+)$/);
  return m ? m[1] : undefined;
}
