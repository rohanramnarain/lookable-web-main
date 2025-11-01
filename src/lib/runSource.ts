// src/lib/runSource.ts
import { CATALOG, type MetricId } from "@/lib/catalog";
import type { AllowedSource } from "@/lib/allowlist";

// Existing sources
import { fetchWDI } from "@/lib/fetchers/worldbank";
import { fetchOpenMeteo } from "@/lib/fetchers/openmeteo";

// New sources
import { fetchOwid } from "@/lib/fetchers/owid";
import { fetchUrban } from "@/lib/fetchers/urban";
import { fetchBlsUnempByRace } from "@/lib/fetchers/bls";
import { fetchDailyAqiByCbsa } from "@/lib/fetchers/epa_aqi";

type Row = { date: string; value: number; series?: string };
export type RunResult = {
  rows: Row[];
  yLabel?: string;
  title?: string;
  provenance: { source: string; url: string; license?: string };
};

export async function runSource(metricId: MetricId, params: Record<string, string | number>) {
  const meta = CATALOG[metricId];

  switch (meta.source as AllowedSource) {
    case "worldbank": {
      const indicator = meta.dataset!;
      const country = String(params.country ?? meta.defaultParams?.country ?? "USA");
      const start = Number(params.start ?? meta.defaultParams?.start ?? 2000);
      const end = Number(params.end ?? meta.defaultParams?.end ?? new Date().getFullYear());
      const out = await fetchWDI(indicator, country, start, end);
      return {
        rows: out.rows,
        yLabel: out.yLabel ?? undefined,
        provenance: out.provenance,
      };
    }

    case "openmeteo": {
      const lat = Number(params.lat ?? meta.defaultParams?.lat ?? 40.7128);
      const lon = Number(params.lon ?? meta.defaultParams?.lon ?? -74.0060);
      const out = await fetchOpenMeteo(lat, lon);
      return {
        rows: out.rows,
        yLabel: out.yLabel ?? "Temperature",
        provenance: out.provenance,
      };
    }

    case "owid": {
      const indicator = (String(params.indicator ?? meta.dataset ?? "life-expectancy") as "life-expectancy" | "co2");
      const countryCsv = String(params.country ?? meta.defaultParams?.country ?? "USA");
      const countries = countryCsv.split(/\s*,\s*/).filter(Boolean);
      const start = Number(params.start ?? meta.defaultParams?.start ?? 1950);
      const end   = Number(params.end   ?? meta.defaultParams?.end   ?? new Date().getFullYear());
      const out = await fetchOwid({ indicator, countries, startYear: start, endYear: end });
      return {
        rows: out.rows,
        yLabel: out.unit ?? "Value",
        title: out.title ?? undefined,
        provenance: { source: "OWID", url: `https://ourworldindata.org/grapher/${indicator}` },
      };
    }

    case "bls": {
      const csv = String(params.races ?? meta.defaultParams?.races ?? "white,black,asian,hispanic");
      const racesAll = csv.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      const valid = ["white","black","asian","hispanic"] as const;
      const races = racesAll.filter((r): r is typeof valid[number] => (valid as readonly string[]).includes(r));
      const start = Number(params.start ?? meta.defaultParams?.start ?? 2000);
      const end   = Number(params.end   ?? meta.defaultParams?.end   ?? new Date().getFullYear());
      const out = await fetchBlsUnempByRace({ races, startYear: start, endYear: end, seasonallyAdjusted: true });
      return {
        rows: out.rows,
        yLabel: out.unit ?? "%",
        title: out.title ?? "Unemployment rate by race (CPS)",
        provenance: { source: "BLS Public API", url: "https://api.bls.gov/publicAPI/v2/timeseries/" },
      };
    }

    case "epa_aqi": {
      const cbsa  = String(params.cbsa ?? meta.defaultParams?.cbsa ?? "New York-Newark-Jersey City, NY-NJ-PA");
      const start = Number(params.start ?? meta.defaultParams?.start ?? new Date().getFullYear());
      const end   = Number(params.end   ?? meta.defaultParams?.end   ?? new Date().getFullYear());
      const out = await fetchDailyAqiByCbsa({ cbsaName: cbsa, startYear: start, endYear: end });
      return {
        rows: out.rows,
        yLabel: out.unit ?? "AQI",
        title: out.title ?? undefined,
        provenance: { source: "EPA AirData", url: "https://aqs.epa.gov/aqsweb/airdata/" },
      };
    }

    case "urban": {
      const url = String(params.url ?? meta.defaultParams?.url);
      const valueField = String(params.value ?? meta.defaultParams?.value);
      const yearField = String((params as any).yearField ?? "year");
      const seriesField = (params as any).seriesField ? String((params as any).seriesField) : undefined;
      if (!url || !valueField) throw new Error("Urban: missing url or value");
      const path = url.replace(/^https?:\/\/educationdata\.urban\.org\//, "/");
      const out = await fetchUrban({ path, filters: {}, valueField, yearField, seriesField });
      return {
        rows: out.rows,
        yLabel: out.unit ?? "Value",
        title: out.title ?? "Urban Education Data",
        provenance: { source: "Urban Institute", url: `https://educationdata.urban.org${path}` },
      };
    }

    default:
      throw new Error(`Unknown source: ${meta.source}`);
  }
}
