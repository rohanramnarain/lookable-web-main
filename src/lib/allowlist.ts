export type AllowedSource = "worldbank" | "openmeteo" | "owid" | "urban" | "bls" | "epa_aqi";

export const ALLOWED_SOURCES: AllowedSource[] = ["worldbank", "openmeteo", "owid", "urban", "bls", "epa_aqi"];

export function isAllowedSource(s: string): s is AllowedSource {
  return (ALLOWED_SOURCES as string[]).includes(s);
}
