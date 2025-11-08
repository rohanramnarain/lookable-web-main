// src/lib/fetchers/owid.ts
// Server-side fetchers for OWID. Avoid browser CORS. Two indicators supported:
//  - "co2": uses consolidated GitHub CSV (owid-co2-data.csv)
//  - "life-expectancy": uses OWID Grapher CSV (life-expectancy.csv)

import { csvParse } from "d3-dsv";

export type OwidIndicator = "life-expectancy" | "co2";
export type OwidOpts = {
  indicator: OwidIndicator;
  countries: string[];        // ISO-3 like "USA", "CHN", or OWID country names; we match both
  startYear?: number;
  endYear?: number;
};

type Row = { date: string; value: number; series?: string };

function isoDate(y: number) { return `${y}-01-01`; }

/** Detect the numeric value column in an OWID Grapher CSV.
 *  Falls back gracefully if headers shift (e.g., "Life expectancy (years)").
 */
function detectValueColumn(table: any, preferred: string[] = []): string | undefined {
  const cols: string[] =
    (table && Array.isArray(table.columns) && table.columns.length)
      ? table.columns
      : Object.keys((table && table[0]) || {});

  const NON_VALUE = new Set(["Entity","Code","Year","entity","code","year"]);

  // Try preferred names first (exact match)
  for (const name of preferred) {
    if (cols.includes(name)) return name;
  }

  // Then try any non-meta column that looks numeric on several rows
  const candidates = cols.filter(c => !NON_VALUE.has(c));
  for (const col of candidates) {
    let hits = 0;
    const lim = Math.min(200, table.length || 0);
    for (let i = 0; i < lim; i++) {
      const v = Number((table[i] as any)?.[col]);
      if (Number.isFinite(v)) {
        hits++;
        if (hits >= 5) return col; // good enough
      }
    }
  }

  // Last resort
  return candidates[0];
}

export async function fetchOwid(opts: OwidOpts) {
  const { indicator, countries, startYear = 1950, endYear = new Date().getFullYear() } = opts;

  // Normalize requested countries: accept codes or names (case-insensitive)
  const wantUpper = new Set(
    (countries || []).map((c) => String(c).trim()).filter(Boolean).map((c) => c.toUpperCase())
  );

  let rows: Row[] = [];
  let unit = "Value";
  let title: string | undefined;
  let url = "";

  if (indicator === "co2") {
    // Use consolidated dataset from GitHub (wide coverage, stable path)
    url = "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv";
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`OWID CO2 fetch failed: ${res.status}`);
    const text = await res.text();
    const table: any = csvParse(text);

    // Columns: iso_code, country, year, co2, ...
    table.forEach((r: any) => {
      const iso = String(r.iso_code || "").toUpperCase();
      const name = String(r.country || "");
      const yr = Number(r.year);
      if (!Number.isFinite(yr) || yr < startYear || yr > endYear) return;

      if (wantUpper.size && !(wantUpper.has(iso) || wantUpper.has(name.toUpperCase()))) return;

      const v = Number(r.co2); // million tonnes
      if (!Number.isFinite(v)) return;

      rows.push({ date: isoDate(yr), value: v, series: name });
    });

    unit = "CO₂ (Mt)";
    title = "CO₂ emissions (fossil & industry)";
  }

  else if (indicator === "life-expectancy") {
    // Use Grapher CSV for life expectancy (column name can vary)
    url = "https://ourworldindata.org/grapher/life-expectancy.csv";
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`OWID life-expectancy fetch failed: ${res.status}`);
    const text = await res.text();
    const table: any = csvParse(text);

    // Columns usually: Entity, Code, Year, <value column>
    const valueCol =
      detectValueColumn(table, ["Life expectancy", "Life expectancy (years)"]) ||
      "Life expectancy";

    table.forEach((r: any) => {
      const code = String(r.Code ?? r.code ?? "").toUpperCase();
      const name = String(r.Entity ?? r.entity ?? "");
      const yr = Number(r.Year ?? r.year);
      if (!Number.isFinite(yr) || yr < startYear || yr > endYear) return;

      if (wantUpper.size && !(wantUpper.has(code) || wantUpper.has(name.toUpperCase()))) return;

      const v = Number(r[valueCol]);
      if (!Number.isFinite(v)) return;

      rows.push({ date: isoDate(yr), value: v, series: name });
    });

    unit = "Years";
    title = "Life expectancy at birth";
  }

  else {
    throw new Error(`Unsupported OWID indicator: ${indicator}`);
  }

  // Sort for deterministic charts
  rows.sort(
    (a, b) =>
      (a.series || "").localeCompare(b.series || "") ||
      a.date.localeCompare(b.date)
  );

  return {
    rows,
    unit,
    title,
    provenance: { source: "Our World in Data", url },
  };
}
