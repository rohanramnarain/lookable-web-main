// src/lib/fetchers/owid.ts
// Server-side fetchers for OWID. Avoid browser CORS. Two indicators supported:
//  - "co2": uses consolidated GitHub CSV (owid-co2-data.csv)
//  - "life-expectancy": uses OWID Grapher CSV (life-expectancy.csv)

import { csvParse } from "d3-dsv";

export type OwidIndicator = "life-expectancy" | "co2";
export type OwidOpts = {
  indicator: OwidIndicator;
  countries: string[];        // ISO-3 like "USA", "CHN", or OWID country names; will try both
  startYear?: number;
  endYear?: number;
};

type Row = { date: string; value: number; series?: string };

function isoDate(y: number) { return `${y}-01-01`; }

export async function fetchOwid(opts: OwidOpts) {
  const { indicator, countries, startYear = 1950, endYear = new Date().getFullYear() } = opts;
  let rows: Row[] = [];
  let yLabel = "Value";
  let title: string | undefined;
  let url = "";

  if (indicator === "co2") {
    // Use consolidated dataset from GitHub (wide coverage, stable path)
    url = "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv";
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`OWID CO2 fetch failed: ${res.status}`);
    const text = await res.text();
    const table = csvParse(text);

    // Columns: iso_code, country, year, co2, ...
    const want = new Set(countries.map(c => String(c).trim().toUpperCase()));
    table.forEach((r: any) => {
      const iso = String(r.iso_code || "").toUpperCase();
      const name = String(r.country || "");
      const yr = Number(r.year);
      if (!Number.isFinite(yr) || yr < startYear || yr > endYear) return;

      const match = want.has(iso) || want.has(name.toUpperCase());
      if (!match) return;

      const v = Number(r.co2); // million tonnes
      if (!Number.isFinite(v)) return;

      rows.push({ date: isoDate(yr), value: v, series: name });
    });

    yLabel = "CO₂ (Mt)";
    title = "CO₂ emissions (fossil & industry)";
  } else if (indicator === "life-expectancy") {
    // Use Grapher CSV for life expectancy
    url = "https://ourworldindata.org/grapher/life-expectancy.csv";
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`OWID life-expectancy fetch failed: ${res.status}`);
    const text = await res.text();
    const table = csvParse(text);

    // Columns: Entity, Code, Year, Life expectancy
    const want = new Set(countries.map(c => String(c).trim().toUpperCase()));
    table.forEach((r: any) => {
      const code = String(r.Code || "").toUpperCase();
      const name = String(r.Entity || "");
      const yr = Number(r.Year);
      if (!Number.isFinite(yr) || yr < startYear || yr > endYear) return;

      const match = want.has(code) || want.has(name.toUpperCase());
      if (!match) return;

      const v = Number(r["Life expectancy"]);
      if (!Number.isFinite(v)) return;

      rows.push({ date: isoDate(yr), value: v, series: name });
    });

    yLabel = "Years";
    title = "Life expectancy at birth";
  } else {
    throw new Error(`Unsupported OWID indicator: ${indicator}`);
  }

  // Simple sort by date + series for deterministic charts
  rows.sort((a, b) => (a.series || "").localeCompare(b.series || "") || a.date.localeCompare(b.date));

  return {
    rows,
    unit: yLabel,
    title,
    provenance: { source: "Our World in Data", url },
  };
}
