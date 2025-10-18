export type AllowedSource = "worldbank" | "openmeteo";

export const ALLOWED_SOURCES: AllowedSource[] = ["worldbank", "openmeteo"];

export function isAllowedSource(s: string): s is AllowedSource {
  return (ALLOWED_SOURCES as string[]).includes(s);
}
