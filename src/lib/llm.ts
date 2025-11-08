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

// Call our same-origin API route (server does OWID matching)
async function toISO3FromQuery(q: string): Promise<string | undefined> {
  try {
    const res = await fetch(`/api/geo/iso3?q=${encodeURIComponent(q)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.iso3) return String(data.iso3).toUpperCase();
    }
  } catch {}
  return quickClientFallbackISO(q);
}

/** Client-side quick fallback so we don't silently default to USA */
function quickClientFallbackISO(q: string): string | undefined {
  const s = String(q).toLowerCase();

  const pairs: Array<[RegExp, string]> = [
    [/\bjapan\b|\bjpn\b/, "JPN"],
    [/\bchina\b|\bchn\b|\bprc\b/, "CHN"],
    [/\bindia\b|\bind\b/, "IND"],
    [/\bunited\s+states\b|\busa\b|\bu\.?s\.?a?\.?\b|\bamerica\b/, "USA"],
    [/\bunited\s+kingdom\b|\buk\b|\bu\.?k\.?|\bgreat\s+britain\b|\bengland\b|\bgbr\b/, "GBR"],
    [/\bgermany\b|\bdeu\b/, "DEU"],
    [/\bfrance\b|\bfra\b/, "FRA"],
    [/\bcanada\b|\bcan\b/, "CAN"],
    [/\bitaly\b|\bita\b/, "ITA"],
    [/\bspain\b|\besp\b/, "ESP"],
    [/\bbrazil\b|\bbra\b/, "BRA"],
    [/\bmexico\b|\bmex\b/, "MEX"],
    [/\brussia\b|\brussian\s+federation\b|\brus\b/, "RUS"],
    [/\bsouth\s+korea\b|\brepublic\s+of\s+korea\b|\bkor\b/, "KOR"],
    [/\bsouth\s+africa\b|\bzaf\b/, "ZAF"],
    [/\bnigeria\b|\bnga\b/, "NGA"],
    [/\begypt\b|\begy\b/, "EGY"],
    [/\bturkey\b|\bturkiye\b|\btur\b/, "TUR"],
    [/\bindonesia\b|\bidn\b/, "IDN"],
    [/\bpakistan\b|\bpak\b/, "PAK"],
    [/\biran\b|\birn\b/, "IRN"],
    [/\btaiwan\b|\btwn\b/, "TWN"],
    [/\bhong\s*kong\b|\bhkg\b/, "HKG"],
    [/\bnetherlands\b|\bnld\b|\bholland\b/, "NLD"],
    [/\bswitzerland\b|\bche\b/, "CHE"],
    [/\bsweden\b|\bswe\b/, "SWE"],
    [/\bnorway\b|\bnor\b/, "NOR"],
    [/\baustralia\b|\baus\b/, "AUS"],
  ];

  for (const [re, iso] of pairs) if (re.test(s)) return iso;

  const isoToken = s.match(/\b[a-z]{3}\b/i);
  return isoToken ? isoToken[0].toUpperCase() : undefined;
}

function extractYearsInclusive(q: string): { start?: number; end?: number } {
  const s = q.toLowerCase();
  const now = new Date().getFullYear();

  const range = s.match(/(\d{4})\s*[-–—]\s*(\d{4}|present|now)/);
  if (range) {
    let a = Number(range[1]);
    let b = /present|now/.test(range[2]) ? now : Number(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return {};
    if (a > b) [a, b] = [b, a];
    b = Math.min(b, now);
    return { start: a, end: b };
  }
  const since = s.match(/\bsince\s+(\d{4})\b/);
  if (since) {
    const a = Number(since[1]);
    if (Number.isFinite(a)) return { start: a, end: now };
  }
  const last = s.match(/\blast\s+(\d+)\s+years?\b/);
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

/* ---------------- race helpers ---------------- */

const RACE_WORDS: Record<string, RegExp> = {
  white: /\bwhite(s)?\b/i,
  black: /\b(black|african[-\s]?american)s?\b/i,
  asian: /\b(aapi|asian(?:[-\s]?american)?)s?\b/i,
  hispanic: /\b(hispanic|latino|latina|latinx)\b/i,
};

function extractRaces(q: string): string[] {
  const found = Object.entries(RACE_WORDS)
    .filter(([, rx]) => rx.test(q))
    .map(([race]) => race);
  return found;
}

function mentionsByRace(q: string): boolean {
  return /\bby\s*race\b/i.test(q);
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
  if (/(^|\s)(population|pop)(\s|$)/.test(q)) {
    const iso = (await toISO3FromQuery(query)) ?? "USA";
    return PlanSchema.parse({
      metricId: "population_total",
      params: { country: iso, ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Population" }
    });
  }

  // GDP per capita (World Bank)
  if (/(gdp per capita|gdp pc|income per capita)/.test(q)) {
    const iso = (await toISO3FromQuery(query)) ?? "USA";
    return PlanSchema.parse({
      metricId: "gdp_per_capita",
      params: { country: iso, ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "GDP per capita" }
    });
  }

  // Inflation CPI (World Bank)
  if (/(^|\s)(inflation|cpi)(\s|$)/.test(q)) {
    const iso = (await toISO3FromQuery(query)) ?? "USA";
    return PlanSchema.parse({
      metricId: "inflation_cpi_pct",
      params: { country: iso, ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Inflation (CPI %)" }
    });
  }

  // ==== Unemployment by race (BLS)
  if (/(unemployment|jobless|unemploy)/.test(q) && (mentionsByRace(q) || extractRaces(q).length > 0)) {
    const racesList = extractRaces(q);
    const racesCsv =
      mentionsByRace(q) && racesList.length === 0
        ? "white,black,asian,hispanic"
        : racesList.join(",");

    return PlanSchema.parse({
      metricId: "unemployment_rate_by_race_us",
      params: {
        races: racesCsv || "white,black,asian,hispanic",
        ...(start ? { start } : {}),
        ...(end ? { end } : {})
      },
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
    const iso = (await toISO3FromQuery(query)) ?? "USA";
    return PlanSchema.parse({
      metricId: "life_expectancy",
      params: { country: iso, ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Life expectancy" }
    });
  }

  // CO2 emissions (OWID)
  if (/(co2|carbon\s+emissions?)/.test(q)) {
    const iso = (await toISO3FromQuery(query)) ?? "USA";
    return PlanSchema.parse({
      metricId: "co2_emissions",
      params: { country: iso, ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "CO₂ emissions" }
    });
  }

  // Default: unemployment rate (World Bank)
  {
    const iso = (await toISO3FromQuery(query)) ?? "USA";
    return PlanSchema.parse({
      metricId: "unemployment_rate",
      params: { country: iso, ...(start ? { start } : {}), ...(end ? { end } : {}) },
      chart: { mark: "line", title: "Unemployment rate" }
    });
  }
}
