// bls.ts — CPS unemployment by race + NL parsing + datasets for your charts.

import { z } from "zod";

/* =========================
 * Types & Schemas
 * ========================= */
export type Race = "white" | "black" | "asian" | "hispanic";

export const BlsRaceParams = z.object({
  races: z
    .array(z.enum(["white", "black", "asian", "hispanic"]))
    .default(["white", "black", "asian", "hispanic"]),
  startYear: z.number().int().default(1972),
  endYear: z.number().int().default(new Date().getFullYear()),
  seasonallyAdjusted: z.boolean().default(true),
});
export type BlsRaceParams = z.infer<typeof BlsRaceParams>;

export type MonthlyRow = { date: string; value: number; series: string; unit: "%" };
export type AnnualRow = { year: number; value: number; series: string; unit: "%" };

export type FetchResult = { title: string; unit: string; rows: MonthlyRow[]; provenance: { source: string; url: string; license?: string; note?: string; requestBody?: any } };

/* =========================
 * Series IDs / helpers
 * ========================= */
const SERIES_SA: Record<Race, string> = {
  white:    "LNS14000003",
  black:    "LNS14000006",
  asian:    "LNS14032183",      // Correct Asian SA series
  hispanic: "LNS14000009",
};
const PROPER: Record<Race,string> = {
  white:"White", black:"Black", asian:"Asian", hispanic:"Hispanic"
};

const BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const toNSA = (id: string) => id.replace(/^LNS14/, "LNU04");
const idFor = (race: Race, sa: boolean) => (sa ? SERIES_SA[race] : toNSA(SERIES_SA[race]));
const raceFromId = (seriesId: string, sa: boolean): Race | string => {
  for (const [race, saId] of Object.entries(SERIES_SA) as [Race,string][]) {
    if ((sa ? saId : toNSA(saId)) === seriesId) return race;
  }
  return seriesId;
};

/* =========================
 * Fetch
 * ========================= */
async function fetchBlsSeries(seriesIds: string[], startYear: number, endYear: number) {
  const body: any = { seriesid: seriesIds, startyear: String(startYear), endyear: String(endYear) };
  if (process?.env?.BLS_API_KEY) body.registrationkey = process.env.BLS_API_KEY;

  const resp = await fetch(BLS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 86400 },
  });
  if (!resp.ok) throw new Error(`BLS HTTP ${resp.status}`);
  const json = await resp.json();
  if (json?.status && json.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS error: ${json?.status} | ${JSON.stringify(json?.message ?? json)}`);
  }
  return json;
}

/* =========================
 * High-level API
 * ========================= */
export async function fetchBlsUnempByRace(p: BlsRaceParams): Promise<FetchResult> {
  const params = BlsRaceParams.parse(p);
  const ids = params.races.map(r => idFor(r, params.seasonallyAdjusted));

  // Chunk if no API key (BLS can auto-reduce long ranges)
  const span = Math.max(0, params.endYear - params.startYear + 1);
  const MAX_YEARS_PER_CALL = process?.env?.BLS_API_KEY ? span : 10;
  const rows: MonthlyRow[] = [];

  const ingest = (json: any) => {
    const containers = Array.isArray(json?.Results) ? json.Results : [json?.Results].filter(Boolean);
    for (const c of containers) {
      for (const s of c?.series ?? []) {
        const seriesId: string = s?.seriesID;
        const race = raceFromId(seriesId, params.seasonallyAdjusted);
        const label = (typeof race === "string" && (race as Race) in PROPER) ? PROPER[race as Race] : race;
        for (const d of s?.data ?? []) {
          const period = String(d?.period);
          if (!/^M(0[1-9]|1[0-2])$/.test(period)) continue;
          const value = Number(d?.value);
          if (!Number.isFinite(value)) continue;
          rows.push({ date: `${d.year}-${period.slice(1)}-01`, value, series: String(label), unit: "%" });
        }
      }
    }
  };

  if (MAX_YEARS_PER_CALL >= span) {
    const json = await fetchBlsSeries(ids, params.startYear, params.endYear);
    ingest(json);
  } else {
    let start = params.startYear;
    while (start <= params.endYear) {
      const end = Math.min(params.endYear, start + (MAX_YEARS_PER_CALL - 1));
      const json = await fetchBlsSeries(ids, start, end);
      ingest(json);
      start = end + 1;
    }
  }

  rows.sort((a,b) => a.date.localeCompare(b.date));
  const scope = params.races.length === 1 ? PROPER[params.races[0]] : "Race";
  const provUrl = "https://api.bls.gov/publicAPI/v2/timeseries/";
  const requestBody = { seriesid: ids, startyear: String(params.startYear), endyear: String(params.endYear) };
  const note = process?.env?.BLS_API_KEY ? "Requested full range via single POST." : "Fetched in 10-year POST chunks and merged (no API key).";
  return {
    title: `Unemployment rate — ${scope} (CPS, ${params.seasonallyAdjusted ? "SA" : "NSA"})`,
    unit: "%",
    rows,
    provenance: { source: "BLS Public API", url: provUrl, note, requestBody },
  };
}

/* =========================
 * NL helpers (optional export if you use them elsewhere)
 * ========================= */

export function toAnnual(rows: MonthlyRow[]): AnnualRow[] {
  const byKey = new Map<string, { sum: number; n: number; series: string; year: number }>();
  for (const r of rows) {
    const y = Number(r.date.slice(0,4));
    const key = `${r.series}|${y}`;
    const cur = byKey.get(key) ?? { sum: 0, n: 0, series: r.series, year: y };
    cur.sum += r.value; cur.n += 1;
    byKey.set(key, cur);
  }
  const out: AnnualRow[] = [];
  for (const { sum, n, series, year } of byKey.values()) {
    if (n > 0) out.push({ year, value: sum / n, series, unit: "%" });
  }
  out.sort((a,b) => a.year - b.year);
  return out;
}

export default {
  BlsRaceParams,
  fetchBlsUnempByRace,
  toAnnual,
};
