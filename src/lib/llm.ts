"use client";

import { PlanSchema } from "./schema";
import type { Plan } from "./schema";

/** Engine is optional; we keep API surface */
let engine: any = null;
export async function ensureEngine() {
  // No-op engine so UI remains happy; swap in web-llm later if desired.
  return engine;
}

/* ---------------- helpers ---------------- */

function toISO3FromQuery(q: string): string | undefined {
  const s = q.toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/(united states|u\.?s\.?a?|america)\b/, "USA"],
    [/nigeria\b|\bnga\b/, "NGA"],
    [/canada\b|\bcan\b/, "CAN"],
    [/india\b|\bind\b/, "IND"],
    [/(united kingdom|u\.?k\.?|great britain|gbr|england)\b/, "GBR"],
    [/germany\b|\bdeu\b/, "DEU"],
    [/france\b|\bfra\b/, "FRA"]
  ];
  for (const [re, code] of pairs) if (re.test(s)) return code;
  const iso3 = q.match(/\b[A-Z]{3}\b/);
  return iso3 ? iso3[0] : undefined;
}

function extractYearsInclusive(q: string): { start?: number; end?: number } {
  const s = q.toLowerCase();
  const now = new Date().getFullYear();

  const range = s.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (range) {
    let a = Number(range[1]), b = Number(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return {};
    if (a > b) [a, b] = [b, a];
    b = Math.min(b, now);
    return { start: a, end: b };
  }
  const since = s.match(/since\s+(\d{4})/);
  if (since) {
    const a = Number(since[1]);
    if (Number.isFinite(a)) return { start: a, end: now };
  }
  const last = s.match(/last\s+(\d+)\s+years?/);
  if (last) {
    const n = Number(last[1]);
    if (Number.isFinite(n) && n > 0) return { start: now - (n - 1), end: now };
  }
  return {};
}

function extractLatLon(q: string): { lat?: number; lon?: number } {
  const m = q.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return {};
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

/* --------------- deterministic planner --------------- */

export async function plan(query: string): Promise<Plan> {
  const q = query.toLowerCase();
  const { start, end } = extractYearsInclusive(q);

  // Temperature (Open-Meteo)
  if (/(temp|temperature|°c|°f)/.test(q)) {
    const { lat, lon } = extractLatLon(query);
    return PlanSchema.parse({
      metricId: "temp_hourly",
      params: { lat: lat ?? 40.7128, lon: lon ?? -74.0060 },
      chart: { mark: "line", title: "Hourly Temperature" }
    });
  }

  // Population (World Bank)
  if (/(population|pop)/.test(q)) {
    return PlanSchema.parse({
      metricId: "population_total",
      params: { country: toISO3FromQuery(query) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Population" }
    });
  }

  // GDP per capita (World Bank)
  if (/(gdp per capita|gdp pc|income per capita)/.test(q)) {
    return PlanSchema.parse({
      metricId: "gdp_per_capita",
      params: { country: toISO3FromQuery(query) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "GDP per capita" }
    });
  }

  // Inflation CPI (World Bank)
  if (/(inflation|cpi)/.test(q)) {
    return PlanSchema.parse({
      metricId: "inflation_cpi_pct",
      params: { country: toISO3FromQuery(query) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Inflation (CPI %)" }
    });
  }

  // Unemployment by race (BLS)
  if (/(unemployment).*?(race)|(race).*?(unemployment)/.test(q)) {
    return PlanSchema.parse({
      metricId: "unemployment_rate_by_race_us",
      params: { races: "white,black,asian,hispanic", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Unemployment rate by race (US)" }
    });
  }

  // Air Quality (EPA AQI)
  if (/(aqi|air\s*quality)/.test(q)) {
    return PlanSchema.parse({
      metricId: "aqi_daily_cbsa",
      params: { cbsa: "New York-Newark-Jersey City, NY-NJ-PA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Daily AQI" }
    });
  }

  // Life expectancy (OWID)
  if (/(life\s*expectancy)/.test(q)) {
    return PlanSchema.parse({
      metricId: "life_expectancy",
      params: { country: toISO3FromQuery(query) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Life expectancy" }
    });
  }

  // CO2 emissions (OWID)
  if (/(co2|carbon\s+emissions?)/.test(q)) {
    return PlanSchema.parse({
      metricId: "co2_emissions",
      params: { country: toISO3FromQuery(query) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "CO₂ emissions" }
    });
  }

  // Default: unemployment rate (World Bank)
  return PlanSchema.parse({
    metricId: "unemployment_rate",
    params: { country: toISO3FromQuery(query) ?? "USA", ...(start ? { start } : {}), ...(end ? { end } : {}) },
    chart: { mark: "line", title: "Unemployment rate" }
  });
}
