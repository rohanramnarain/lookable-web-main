// src/lib/fetchers/urban.ts
// Enhanced Urban (NCES/IPEDS/CCD) fetcher that supports a {year} template and multi-year loops.

import { csvParse } from "d3-dsv";

type UrbanParams = {
  // Either absolute path beginning with /api/v1/... or full https URL
  path?: string;              // e.g., "/api/v1/schools/ccd/enrollment/2013/grade-3/?fips=11&sex=99&race=99"
  pathTemplate?: string;      // e.g., "/api/v1/schools/ccd/enrollment/{year}/grade-3/?fips=11&sex=99&race=99"
  years?: number[];           // used only with pathTemplate
  valueField: string;         // e.g., "enrollment"
  yearField?: string;         // defaults to "year"
  seriesField?: string;       // optional series split (e.g., "charter_text")
  filters?: Record<string, string | number>; // reserved for future use
};

type Row = { date: string; value: number; series?: string };

function toUrl(input: string) {
  return input.startsWith("http") ? input : `https://educationdata.urban.org${input}`;
}

function isoDate(y: number) { return `${y}-01-01`; }

async function fetchOne(url: string) {
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Urban fetch failed: ${res.status} for ${url}`);
  return await res.json();
}

export async function fetchUrban(p: UrbanParams) {
  const yearField = p.yearField ?? "year";
  let rows: Row[] = [];
  let firstUrl = "";

  if (p.pathTemplate && p.years && p.years.length) {
    // Loop over years, replacing {year}
    for (const y of p.years) {
      const path = p.pathTemplate.replace("{year}", String(y));
      const url = toUrl(path);
      if (!firstUrl) firstUrl = url;
      const data: any[] = await fetchOne(url);
      data.forEach((r: any) => {
        const yr = Number(r[yearField] ?? y);
        const v = Number(r[p.valueField]);
        if (!Number.isFinite(yr) || !Number.isFinite(v)) return;
        const series = p.seriesField && r[p.seriesField] != null ? String(r[p.seriesField]) : undefined;
        rows.push(series ? { date: isoDate(yr), value: v, series } : { date: isoDate(yr), value: v });
      });
    }
  } else if (p.path) {
    const url = toUrl(p.path);
    firstUrl = url;
    const data: any[] = await fetchOne(url);
    data.forEach((r: any) => {
      const yr = Number(r[yearField]);
      const v = Number(r[p.valueField]);
      if (!Number.isFinite(yr) || !Number.isFinite(v)) return;
      const series = p.seriesField && r[p.seriesField] != null ? String(r[p.seriesField]) : undefined;
      rows.push(series ? { date: isoDate(yr), value: v, series } : { date: isoDate(yr), value: v });
    });
  } else {
    throw new Error("Urban: provide either path or {pathTemplate + years[]}");
  }

  // Sort rows
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.series || "").localeCompare(b.series || ""));

  return {
    rows,
    unit: "Students",
    title: undefined,
    provenance: { source: "Urban Institute Education Data API", url: firstUrl || "https://educationdata.urban.org/documentation/" },
  };
}
