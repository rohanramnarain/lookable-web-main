export type MetricId =
  | "unemployment_rate"        // % of labor force (World Bank)
  | "gdp_per_capita"           // constant $ (World Bank)
  | "inflation_cpi_pct"        // % (World Bank)
  | "population_total"         // headcount (World Bank)
  | "temp_hourly";             // hourly temperature (Open-Meteo)

export const METRIC_IDS: readonly MetricId[] = [
  "unemployment_rate",
  "gdp_per_capita",
  "inflation_cpi_pct",
  "population_total",
  "temp_hourly",
] as const;

export const CATALOG: Record<
  MetricId,
  {
    source: "worldbank" | "openmeteo";
    dataset?: string; // WB indicator id
    defaultParams?: Record<string, string | number>;
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
    defaultParams: { lat: 40.7128, lon: -74.0060 }, // NYC default
  },
};

export function isMetricId(x: unknown): x is MetricId {
  return typeof x === "string" && (METRIC_IDS as readonly string[]).includes(x);
}
