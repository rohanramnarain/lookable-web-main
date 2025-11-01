import type { AllowedSource } from "./allowlist";

export type MetricId =
  | "unemployment_rate"        // % of labor force (World Bank)
  | "gdp_per_capita"           // constant $ (World Bank)
  | "inflation_cpi_pct"        // % (World Bank)
  | "population_total"         // headcount (World Bank)
  | "temp_hourly"              // Open-Meteo
  | "life_expectancy"          // OWID
  | "co2_emissions"            // OWID
  | "unemployment_rate_by_race_us" // BLS
  | "aqi_daily_cbsa"           // EPA AirData
  | "urban_edu_value";         // Urban Institute (generic)

export const METRIC_IDS: readonly MetricId[] = [
  "unemployment_rate",
  "gdp_per_capita",
  "inflation_cpi_pct",
  "population_total",
  "temp_hourly",
  "life_expectancy",
  "co2_emissions",
  "unemployment_rate_by_race_us",
  "aqi_daily_cbsa",
  "urban_edu_value",
] as const;

export const CATALOG: Record<
  MetricId,
  {
    source: AllowedSource;
    dataset?: string; // indicator / chart id when applicable
    defaultParams?: Record<string, string | number>; // flat only
  }
> = {
  unemployment_rate: {
    source: "worldbank",
    dataset: "SL.UEM.TOTL.ZS",
    defaultParams: { country: "USA" },
  },
  gdp_per_capita: {
    source: "worldbank",
    dataset: "NY.GDP.PCAP.KD",
    defaultParams: { country: "USA" },
  },
  inflation_cpi_pct: {
    source: "worldbank",
    dataset: "FP.CPI.TOTL.ZG",
    defaultParams: { country: "USA" },
  },
  population_total: {
    source: "worldbank",
    dataset: "SP.POP.TOTL",
    defaultParams: { country: "USA" },
  },
  temp_hourly: {
    source: "openmeteo",
    defaultParams: { lat: 40.7128, lon: -74.0060 },
  },
  life_expectancy: {
    source: "owid",
    dataset: "life-expectancy",
    defaultParams: { country: "USA", start: 1950, end: 2025 },
  },
  co2_emissions: {
    source: "owid",
    dataset: "co2",
    defaultParams: { country: "USA", start: 1960, end: 2025 },
  },
  unemployment_rate_by_race_us: {
    source: "bls",
    defaultParams: { races: "white,black,asian,hispanic", start: 2000, end: 2025 },
  },
  aqi_daily_cbsa: {
    source: "epa_aqi",
    defaultParams: { cbsa: "New York-Newark-Jersey City, NY-NJ-PA", start: 2025, end: 2025 },
  },
  urban_edu_value: {
    source: "urban",
    defaultParams: { url: "/api/v1/schools/ccd/enrollment/2013/grade-3/?fips=11", value: "enrollment" },
  },
};

export function isMetricId(x: unknown): x is MetricId {
  return typeof x === "string" && (METRIC_IDS as readonly string[]).includes(x as any);
}
